import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { and, count, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  accessKeys,
  accessSessions,
  adminSessions,
  adminUsers,
  auditLogs,
  dailyActivity,
  payments,
  referrals,
  referralCodes,
  referralRewards,
  signals,
  streaks,
  systemSettings,
} from "@workspace/db/schema";
import {
  AccessKeyInput,
  ActivateAccessKeyBody,
  AdminLoginBody,
  ChangeAdminPasswordBody,
  GenerateGiveawayCodesBody,
  InitializePaymentBody,
  UpdatePricingBody,
  ValidateAccessKeyBody,
  VerifyPaymentParams,
} from "@workspace/api-zod";
import { ensureSignalWindow, getRecentSignals, CYCLE_SECONDS } from "../lib/signal-engine";
import {
  formatKeyPrefix,
  generateAccessKey,
  hashPassword,
  hashToken,
  identityHash,
  randomToken,
  safeCookieOptions,
  verifyPassword,
} from "../lib/security";

const router: IRouter = Router();
const ACCESS_COOKIE = "csb_access";
const ADMIN_COOKIE = "csb_admin";
const IDENTITY_COOKIE = "csb_identity";
const REFERRER_COOKIE = "csb_referrer";
const accessSessionAge = 24 * 60 * 60 * 1000;
const adminSessionAge = 8 * 60 * 60 * 1000;
const WHATSAPP_URL = "https://whatsapp.com/channel/0029Vb9NoO28aKvC6vac9n3l";
type RequestWithRawBody = Request & { rawBody?: Buffer };

function now() {
  return new Date();
}

function settingNumber(settings: Map<string, string>, key: string, fallback: number) {
  const value = Number(settings.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function paymentDuration(payment: typeof payments.$inferSelect, settings: Map<string, string>) {
  const metadata = payment.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = Number((metadata as Record<string, unknown>).durationSeconds);
    if (Number.isInteger(value) && value >= 3600) return value;
  }
  return settingNumber(settings, "duration_seconds", 86400);
}

async function readSettings() {
  const rows = await db.select().from(systemSettings);
  return new Map(rows.map((row) => [row.key, row.value]));
}

async function ensureIdentity(req: Request, res: Response) {
  let identity = req.cookies?.[IDENTITY_COOKIE] as string | undefined;
  if (!identity) {
    identity = randomToken(24);
    res.cookie(IDENTITY_COOKIE, identity, safeCookieOptions(365 * 24 * 60 * 60 * 1000));
  }
  const referral = typeof req.query.ref === "string" ? req.query.ref.trim().toUpperCase() : "";
  if (referral) {
    res.cookie(REFERRER_COOKIE, referral, safeCookieOptions(30 * 24 * 60 * 60 * 1000));
  }
  return identity;
}

async function getAccessContext(req: Request) {
  const raw = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!raw) return null;
  const [session] = await db.select().from(accessSessions)
    .where(eq(accessSessions.sessionHash, hashToken(raw))).limit(1);
  if (!session || session.revokedAt || session.expiresAt <= now()) return null;
  const [key] = await db.select().from(accessKeys).where(eq(accessKeys.id, session.accessKeyId)).limit(1);
  if (!key || key.status === "revoked" || !key.expiresAt || key.expiresAt <= now()) return null;
  await db.update(accessSessions).set({ lastSeenAt: now() }).where(eq(accessSessions.id, session.id));
  return { session, key };
}

async function getAdminContext(req: Request) {
  const raw = req.cookies?.[ADMIN_COOKIE] as string | undefined;
  if (!raw) return null;
  const [session] = await db.select().from(adminSessions)
    .where(eq(adminSessions.sessionHash, hashToken(raw))).limit(1);
  if (!session || session.revokedAt || session.expiresAt <= now()) return null;
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, session.adminId)).limit(1);
  return admin ? { session, admin } : null;
}

function requireAccess(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    if (!(await getAccessContext(req))) {
      res.status(401).json({ error: "Active access is required." });
      return;
    }
    await handler(req, res);
  };
}

function requireAdmin(handler: (req: Request, res: Response, adminId: number) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const context = await getAdminContext(req);
    if (!context) {
      res.status(401).json({ error: "Admin login is required." });
      return;
    }
    await handler(req, res, context.admin.id);
  };
}

async function audit(adminId: number | null, action: string, targetType?: string, targetId?: string, metadata?: unknown) {
  await db.insert(auditLogs).values({ adminId, action, targetType, targetId, metadata });
}

async function issueKey(values: {
  source: string;
  durationSeconds: number;
  maxUses: number;
  redeemBefore?: Date | null;
  paymentId?: number | null;
  createdByAdminId?: number | null;
}) {
  const plaintext = generateAccessKey();
  const [row] = await db.insert(accessKeys).values({
    keyHash: hashToken(plaintext),
    keyPrefix: formatKeyPrefix(plaintext),
    source: values.source,
    durationSeconds: values.durationSeconds,
    maxUses: values.maxUses,
    redeemBefore: values.redeemBefore ?? null,
    paymentId: values.paymentId ?? null,
    createdByAdminId: values.createdByAdminId ?? null,
  }).returning();
  return { row, plaintext };
}

async function publicConfig() {
  const settings = await readSettings();
  return {
    productName: "Coded Signal Bot",
    standardPrice: settingNumber(settings, "standard_price", 5),
    promoPrice: settingNumber(settings, "promo_price", 2),
    currency: settings.get("currency") ?? "USD",
    promoEnabled: settings.get("promo_enabled") !== "false",
    durationSeconds: settingNumber(settings, "duration_seconds", 86400),
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY ?? null,
    whatsappUrl: WHATSAPP_URL,
  };
}

export async function ensureSystemData() {
  const defaults = [
    ["standard_price", "5"],
    ["promo_price", "2"],
    ["currency", "USD"],
    ["promo_enabled", "true"],
    ["duration_seconds", "86400"],
    ["referrals_required", "5"],
  ] as const;
  for (const [key, value] of defaults) {
    await db.insert(systemSettings).values({ key, value })
      .onConflictDoNothing({ target: systemSettings.key });
  }
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_INITIAL_PASSWORD) {
    const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.email, process.env.ADMIN_EMAIL)).limit(1);
    if (!existing) {
      await db.insert(adminUsers).values({
        email: process.env.ADMIN_EMAIL,
        passwordHash: hashPassword(process.env.ADMIN_INITIAL_PASSWORD),
        forcePasswordChange: true,
      });
    }
  }
}

router.get("/public/config", async (_req, res) => {
  res.json(await publicConfig());
});

router.post("/payment/initialize", async (req, res) => {
  const parsed = InitializePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const config = await publicConfig();
  if (!process.env.PAYSTACK_SECRET_KEY) {
    res.status(503).json({ error: "Payments are not configured on the server yet." });
    return;
  }
  const amount = (config.promoEnabled ? config.promoPrice : config.standardPrice) * 100;
  const reference = `CSB-${Date.now()}-${randomToken(5).toUpperCase()}`;
  const identity = await ensureIdentity(req, res);
  const callbackOrigin = (process.env.APP_URL ?? req.get("origin") ?? "").replace(/\/+$/, "");
  const callbackUrl = callbackOrigin
    ? `${callbackOrigin}/?payment_reference=${encodeURIComponent(reference)}`
    : undefined;
  const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: parsed.data.email,
      amount,
      currency: config.currency,
      reference,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      metadata: { product: "coded-signal-bot-24-hour-access", identity: identityHash(identity), referralCode: parsed.data.referralCode ?? null },
    }),
  });
  const payload = await paystackResponse.json() as { status?: boolean; message?: string; data?: { authorization_url: string; access_code: string; reference: string } };
  if (!paystackResponse.ok || !payload.status || !payload.data) {
    res.status(502).json({ error: payload.message ?? "Unable to initialize payment." });
    return;
  }
  await db.insert(payments).values({
    reference,
    amount: config.promoEnabled ? config.promoPrice : config.standardPrice,
    currency: config.currency,
    customerEmail: parsed.data.email,
    status: "pending",
    metadata: {
      identity: identityHash(identity),
      referralCode: parsed.data.referralCode ?? null,
      durationSeconds: config.durationSeconds,
    },
  });
  res.json({
    authorizationUrl: payload.data.authorization_url,
    accessCode: payload.data.access_code,
    reference: payload.data.reference,
    amount: config.promoEnabled ? config.promoPrice : config.standardPrice,
    currency: config.currency,
  });
});

router.get("/payment/verify/:reference", async (req, res) => {
  const parsed = VerifyPaymentParams.safeParse(req.params);
  if (!parsed.success || !process.env.PAYSTACK_SECRET_KEY) {
    res.status(400).json({ error: "Payment verification is unavailable." });
    return;
  }
  const [payment] = await db.select().from(payments).where(eq(payments.reference, parsed.data.reference)).limit(1);
  if (!payment) {
    res.status(404).json({ error: "Payment reference was not found." });
    return;
  }
  if (payment.status === "success" && payment.accessKeyId) {
    res.json({ verified: true, accessKey: null, reference: payment.reference, message: "Payment was already verified. Use your previously issued key." });
    return;
  }
  const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(payment.reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const payload = await paystackResponse.json() as { status?: boolean; message?: string; data?: { status?: string; reference?: string; amount?: number; currency?: string } };
  const expectedMinorAmount = payment.amount * 100;
  const valid = paystackResponse.ok && payload.status && payload.data?.status === "success"
    && payload.data.reference === payment.reference && payload.data.amount === expectedMinorAmount && payload.data.currency === payment.currency;
  if (!valid) {
    await db.update(payments).set({ status: "failed" }).where(eq(payments.id, payment.id));
    res.status(400).json({ error: "Paystack could not verify this transaction." });
    return;
  }
  const issued = await db.transaction(async (tx) => {
    const [lockedPayment] = await tx.select().from(payments).where(eq(payments.id, payment.id)).for("update");
    if (!lockedPayment) throw new Error("payment_not_found");
    if (lockedPayment.status === "success" && lockedPayment.accessKeyId) {
      return null;
    }
    const settings = await tx.select().from(systemSettings);
    const plaintext = generateAccessKey();
    const [row] = await tx.insert(accessKeys).values({
      keyHash: hashToken(plaintext),
      keyPrefix: formatKeyPrefix(plaintext),
      source: "payment",
      durationSeconds: paymentDuration(lockedPayment, new Map(settings.map((entry) => [entry.key, entry.value]))),
      maxUses: 1,
      paymentId: lockedPayment.id,
    }).returning();
    await tx.update(payments).set({ status: "success", verifiedAt: now(), accessKeyId: row.id }).where(eq(payments.id, lockedPayment.id));
    return { plaintext };
  });
  res.json({ verified: true, accessKey: issued?.plaintext ?? null, reference: payment.reference, message: issued ? "Payment verified. Keep this access key safe." : "Payment was already verified. Use your previously issued key." });
});

router.post("/payment/webhook", async (req, res) => {
  const signature = req.header("x-paystack-signature");
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!signature || !secret) {
    res.status(401).json({ error: "Webhook signature missing." });
    return;
  }
  const rawBody = (req as RequestWithRawBody).rawBody ?? Buffer.from(JSON.stringify(req.body));
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    res.status(401).json({ error: "Invalid webhook signature." });
    return;
  }
  const event = req.body as { event?: string; data?: { reference?: string; status?: string; amount?: number; currency?: string } };
  if (event.event === "charge.success" && event.data?.reference) {
    const [payment] = await db.select().from(payments).where(eq(payments.reference, event.data.reference)).limit(1);
    if (!payment) {
      res.status(404).json({ error: "Payment reference was not found." });
      return;
    }
    if (event.data.status !== "success" || event.data.amount !== payment.amount * 100 || event.data.currency !== payment.currency) {
      res.status(400).json({ error: "Webhook payment details did not match the recorded payment." });
      return;
    }
    await db.transaction(async (tx) => {
      const [lockedPayment] = await tx.select().from(payments).where(eq(payments.id, payment.id)).for("update");
      if (!lockedPayment || (lockedPayment.status === "success" && lockedPayment.accessKeyId)) return;
      const settings = await tx.select().from(systemSettings);
      const plaintext = generateAccessKey();
      const [row] = await tx.insert(accessKeys).values({
        keyHash: hashToken(plaintext),
        keyPrefix: formatKeyPrefix(plaintext),
        source: "payment",
        durationSeconds: paymentDuration(lockedPayment, new Map(settings.map((entry) => [entry.key, entry.value]))),
        maxUses: 1,
        paymentId: lockedPayment.id,
      }).returning();
      await tx.update(payments).set({ status: "success", verifiedAt: now(), accessKeyId: row.id }).where(eq(payments.id, lockedPayment.id));
    });
  }
  res.json({ received: true });
});

router.post("/access/validate", async (req, res) => {
  const parsed = ValidateAccessKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter an access key." });
    return;
  }
  const [key] = await db.select().from(accessKeys).where(eq(accessKeys.keyHash, hashToken(parsed.data.key))).limit(1);
  if (!key) {
    res.status(400).json({ valid: false, status: "invalid", durationSeconds: 0, redeemBefore: null });
    return;
  }
  const redeemExpired = key.redeemBefore && key.redeemBefore <= now();
  const exhausted = key.maxUses !== -1 && key.uses >= key.maxUses;
  const valid = key.status !== "revoked" && !redeemExpired && !exhausted && (!key.expiresAt || key.expiresAt > now());
  res.json({ valid, status: key.status === "revoked" ? "revoked" : redeemExpired ? "expired" : exhausted ? "exhausted" : "available", durationSeconds: key.durationSeconds, redeemBefore: key.redeemBefore?.toISOString() ?? null });
});

router.post("/access/activate", async (req, res) => {
  const parsed = ActivateAccessKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter an access key." });
    return;
  }
  const identity = await ensureIdentity(req, res);
  try {
    const result = await db.transaction(async (tx) => {
       const [key] = await tx.select().from(accessKeys).where(eq(accessKeys.keyHash, hashToken(parsed.data.key))).for("update").limit(1);
      if (!key) throw new Error("invalid");
      if (key.status === "revoked") throw new Error("revoked");
      if (key.redeemBefore && key.redeemBefore <= now()) throw new Error("expired");
      if (key.maxUses !== -1 && key.uses >= key.maxUses) throw new Error("exhausted");
      const activatedAt = key.activatedAt ?? now();
      const expiresAt = key.expiresAt ?? new Date(activatedAt.getTime() + key.durationSeconds * 1000);
      await tx.update(accessKeys).set({
        uses: key.uses + 1,
        activatedAt,
        expiresAt,
        status: "active",
      }).where(eq(accessKeys.id, key.id));
      const rawSession = randomToken(32);
      await tx.insert(accessSessions).values({
        accessKeyId: key.id,
        sessionHash: hashToken(rawSession),
        identityHash: identityHash(identity),
        expiresAt,
      });
      return { key, expiresAt, rawSession };
    });
    res.cookie(ACCESS_COOKIE, result.rawSession, safeCookieOptions(Math.max(0, result.expiresAt.getTime() - Date.now())));
    await updateStreak(identityHash(identity));
    await confirmReferral(req, identity, result.key.id);
    res.json({ authenticated: true, expiresAt: result.expiresAt.toISOString(), remainingSeconds: Math.max(0, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000)), keyPrefix: result.key.keyPrefix, source: result.key.source });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid";
    const status = message === "revoked" ? "revoked" : message === "expired" ? "expired" : message === "exhausted" ? "exhausted" : "invalid";
    res.status(400).json({ error: `This access key is ${status}.` });
  }
});

router.get("/access/status", async (req, res) => {
  const context = await getAccessContext(req);
  if (!context) {
    res.json({ authenticated: false, expiresAt: null, remainingSeconds: 0, keyPrefix: null, source: null });
    return;
  }
  res.json({ authenticated: true, expiresAt: context.key.expiresAt?.toISOString() ?? null, remainingSeconds: Math.max(0, Math.floor(((context.key.expiresAt?.getTime() ?? 0) - Date.now()) / 1000)), keyPrefix: context.key.keyPrefix, source: context.key.source });
});

router.post("/access/logout", async (req, res) => {
  const raw = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (raw) await db.update(accessSessions).set({ revokedAt: now() }).where(eq(accessSessions.sessionHash, hashToken(raw)));
  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ message: "Access session ended." });
});

router.get("/signals/current", requireAccess(async (_req, res) => {
  const window = await ensureSignalWindow();
  const current = window[0];
  const next = window[1] ?? current;
  res.json({
    current: { id: current.id, multiplier: Number(current.multiplier), status: current.status, generatedAt: current.generatedAt.toISOString(), resultAt: current.resultAt?.toISOString() ?? null },
    next: { id: next.id, multiplier: Number(next.multiplier), status: next.status, generatedAt: next.generatedAt.toISOString(), resultAt: next.resultAt?.toISOString() ?? null },
    serverTime: now().toISOString(),
    cycleSeconds: CYCLE_SECONDS,
  });
}));

router.get("/signals/history", requireAccess(async (_req, res) => {
  const rows = await getRecentSignals();
  res.json(rows.map((signal) => ({ id: signal.id, multiplier: Number(signal.multiplier), status: signal.status, generatedAt: signal.generatedAt.toISOString(), resultAt: signal.resultAt?.toISOString() ?? null })));
}));

async function updateStreak(identity: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [activity] = await db.select().from(dailyActivity).where(and(eq(dailyActivity.identityHash, identity), eq(dailyActivity.activityDate, today), eq(dailyActivity.activityType, "activation"))).limit(1);
  if (activity) return;
  await db.insert(dailyActivity).values({ identityHash: identity, activityDate: today, activityType: "activation" }).onConflictDoNothing();
  const [existing] = await db.select().from(streaks).where(eq(streaks.identityHash, identity)).limit(1);
  const previousDay = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const hadPrevious = existing?.lastQualifyingActivity?.toISOString().slice(0, 10) === previousDay;
  const current = hadPrevious ? (existing?.currentStreak ?? 0) + 1 : 1;
  if (existing) {
    await db.update(streaks).set({ currentStreak: current, longestStreak: Math.max(existing.longestStreak, current), lastQualifyingActivity: now(), updatedAt: now() }).where(eq(streaks.id, existing.id));
  } else {
    await db.insert(streaks).values({ identityHash: identity, currentStreak: current, longestStreak: current, lastQualifyingActivity: now() });
  }
}

async function confirmReferral(req: Request, referredIdentity: string, qualifyingKeyId: number) {
  const referralCode = String(req.cookies?.[REFERRER_COOKIE] ?? "").trim().toUpperCase();
  if (!referralCode) return;
  const [owner] = await db.select().from(referralCodes).where(eq(referralCodes.code, referralCode)).limit(1);
  const referredHash = identityHash(referredIdentity);
  if (!owner || owner.identityHash === referredHash) return;
  await db.insert(referrals).values({
    referralCode,
    referrerIdentity: owner.identityHash,
    referredIdentity: referredHash,
    qualifyingAccessKeyId: qualifyingKeyId,
    status: "confirmed",
    confirmedAt: now(),
  }).onConflictDoNothing();
}

router.get("/referrals", requireAccess(async (req, res) => {
  const identity = await ensureIdentity(req, res);
  const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.key, "referrals_required")).limit(1);
  const currentIdentity = identityHash(identity);
  const referralCode = `CSB${identity.slice(0, 6).toUpperCase()}`;
  await db.insert(referralCodes).values({ code: referralCode, identityHash: currentIdentity }).onConflictDoNothing();
  const [row] = await db.select({ confirmed: count() }).from(referrals).where(and(eq(referrals.referrerIdentity, currentIdentity), eq(referrals.status, "confirmed")));
  const confirmed = Number(row?.confirmed ?? 0);
  const required = Number(settings?.value ?? 5);
  let rewardIssued = false;
  if (confirmed >= required) {
    const [existingReward] = await db.select().from(referralRewards).where(eq(referralRewards.identityHash, currentIdentity)).limit(1);
    if (existingReward) {
      rewardIssued = true;
    } else {
      const reward = await issueKey({ source: "referral-reward", durationSeconds: 86400, maxUses: 1 });
      const rewardExpiresAt = new Date(Date.now() + 86400 * 1000);
      await db.update(accessKeys).set({
        uses: 1,
        activatedAt: now(),
        expiresAt: rewardExpiresAt,
        status: "active",
      }).where(eq(accessKeys.id, reward.row.id));
      await db.insert(referralRewards).values({
        identityHash: currentIdentity,
        referralsRequired: required,
        referralsCount: confirmed,
        rewardDuration: 86400,
        rewardKeyId: reward.row.id,
      });
      const access = await getAccessContext(req);
      if (access) {
        const rawSession = randomToken(32);
        await db.insert(accessSessions).values({ accessKeyId: reward.row.id, sessionHash: hashToken(rawSession), identityHash: currentIdentity, expiresAt: rewardExpiresAt });
        res.cookie(ACCESS_COOKIE, rawSession, safeCookieOptions(86400 * 1000));
      }
      rewardIssued = true;
    }
  }
  res.json({ code: referralCode, confirmed, required, rewardIssued });
}));

router.get("/streak", requireAccess(async (req, res) => {
  const identity = await ensureIdentity(req, res);
  const [row] = await db.select().from(streaks).where(eq(streaks.identityHash, identityHash(identity))).limit(1);
  const current = row?.currentStreak ?? 0;
  const discountPercent = current >= 30 ? 20 : current >= 14 ? 15 : current >= 7 ? 10 : current >= 3 ? 5 : 0;
  res.json({ current, longest: row?.longestStreak ?? 0, discountPercent, lastActivity: row?.lastQualifyingActivity?.toISOString() ?? null });
}));

router.post("/admin/login", async (req, res) => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter valid admin credentials." });
    return;
  }
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, parsed.data.email)).limit(1);
  if (!admin || !verifyPassword(parsed.data.password, admin.passwordHash)) {
    await audit(admin?.id ?? null, "admin_login_failed", "admin", admin?.id?.toString());
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  const rawSession = randomToken(32);
  await db.insert(adminSessions).values({ adminId: admin.id, sessionHash: hashToken(rawSession), expiresAt: new Date(Date.now() + adminSessionAge) });
  await db.update(adminUsers).set({ lastLoginAt: now() }).where(eq(adminUsers.id, admin.id));
  await audit(admin.id, "admin_login");
  res.cookie(ADMIN_COOKIE, rawSession, safeCookieOptions(adminSessionAge));
  res.json({ authenticated: true, email: admin.email, forcePasswordChange: admin.forcePasswordChange });
});

router.post("/admin/logout", async (req, res) => {
  const raw = req.cookies?.[ADMIN_COOKIE] as string | undefined;
  if (raw) await db.update(adminSessions).set({ revokedAt: now() }).where(eq(adminSessions.sessionHash, hashToken(raw)));
  res.clearCookie(ADMIN_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ message: "Admin session ended." });
});

router.get("/admin/me", async (req, res) => {
  const context = await getAdminContext(req);
  if (!context) {
    res.status(401).json({ error: "Admin login is required." });
    return;
  }
  res.json({ authenticated: true, email: context.admin.email, forcePasswordChange: context.admin.forcePasswordChange });
});

router.post("/admin/password", requireAdmin(async (req, res, adminId) => {
  const parsed = ChangeAdminPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminId)).limit(1);
  if (!admin || !verifyPassword(parsed.data.currentPassword, admin.passwordHash)) {
    res.status(400).json({ error: "Current password is incorrect." });
    return;
  }
  await db.update(adminUsers).set({ passwordHash: hashPassword(parsed.data.newPassword), forcePasswordChange: false, updatedAt: now() }).where(eq(adminUsers.id, adminId));
  await audit(adminId, "admin_password_changed");
  res.json({ authenticated: true, email: admin.email, forcePasswordChange: false });
}));

router.get("/admin/overview", requireAdmin(async (_req, res) => {
  const current = now();
  const [[activeSessions], [activeKeys], [expiredKeys], [totalPayments], [successfulPayments], [revenue], [generatedCodes]] = await Promise.all([
    db.select({ value: count() }).from(accessSessions).where(and(isNull(accessSessions.revokedAt), gt(accessSessions.expiresAt, current))),
    db.select({ value: count() }).from(accessKeys).where(and(eq(accessKeys.status, "active"), gt(accessKeys.expiresAt, current))),
    db.select({ value: count() }).from(accessKeys).where(lt(accessKeys.expiresAt, current)),
    db.select({ value: count() }).from(payments),
    db.select({ value: count() }).from(payments).where(eq(payments.status, "success")),
    db.select({ value: sql<number>`coalesce(sum(${payments.amount}), 0)` }).from(payments).where(eq(payments.status, "success")),
    db.select({ value: count() }).from(accessKeys).where(eq(accessKeys.source, "giveaway")),
  ]);
  const activity = await db.select({ action: auditLogs.action, createdAt: auditLogs.createdAt }).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(6);
  res.json({
    activeSessions: Number(activeSessions.value),
    activeKeys: Number(activeKeys.value),
    expiredKeys: Number(expiredKeys.value),
    totalPayments: Number(totalPayments.value),
    successfulPayments: Number(successfulPayments.value),
    revenue: Number(revenue.value),
    generatedCodes: Number(generatedCodes.value),
    recentActivity: activity.map((row) => `${row.action} · ${row.createdAt.toISOString()}`),
  });
}));

router.patch("/admin/pricing", requireAdmin(async (req, res, adminId) => {
  const parsed = UpdatePricingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid pricing settings." });
    return;
  }
  const entries = Object.entries({
    standard_price: String(parsed.data.standardPrice),
    promo_price: String(parsed.data.promoPrice),
    currency: parsed.data.currency.toUpperCase(),
    promo_enabled: String(parsed.data.promoEnabled),
    duration_seconds: String(parsed.data.durationSeconds),
  });
  for (const [key, value] of entries) {
    await db.insert(systemSettings).values({ key, value }).onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: now() } });
  }
  await audit(adminId, "pricing_updated", "settings", "pricing");
  res.json(await publicConfig());
}));

router.post("/admin/giveaway", requireAdmin(async (req, res, adminId) => {
  const parsed = GenerateGiveawayCodesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid giveaway settings." });
    return;
  }
  const created = [];
  for (let index = 0; index < parsed.data.quantity; index += 1) {
    const generated = await issueKey({ source: "giveaway", durationSeconds: parsed.data.durationSeconds, maxUses: parsed.data.maxUses, redeemBefore: parsed.data.redeemBefore ? new Date(parsed.data.redeemBefore) : null, createdByAdminId: adminId });
    created.push({ id: generated.row.id, code: generated.plaintext, durationSeconds: generated.row.durationSeconds, maxUses: generated.row.maxUses, redeemBefore: generated.row.redeemBefore?.toISOString() ?? null });
  }
  await audit(adminId, "giveaway_codes_created", "access_key", undefined, { quantity: created.length });
  res.json(created);
}));

router.get("/admin/codes", requireAdmin(async (_req, res) => {
  const rows = await db.select().from(accessKeys).where(eq(accessKeys.source, "giveaway")).orderBy(desc(accessKeys.createdAt));
  res.json(rows.map((row) => ({ id: row.id, prefix: row.keyPrefix, source: row.source, durationSeconds: row.durationSeconds, maxUses: row.maxUses, uses: row.uses, status: row.status, redeemBefore: row.redeemBefore?.toISOString() ?? null, activatedAt: row.activatedAt?.toISOString() ?? null, expiresAt: row.expiresAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })));
}));

router.post("/admin/codes/:id/revoke", requireAdmin(async (req, res, adminId) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid access code." });
    return;
  }
  const [row] = await db.update(accessKeys).set({ status: "revoked" }).where(eq(accessKeys.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Access code not found." });
    return;
  }
  await audit(adminId, "access_key_revoked", "access_key", String(id));
  res.json({ id: row.id, prefix: row.keyPrefix, source: row.source, durationSeconds: row.durationSeconds, maxUses: row.maxUses, uses: row.uses, status: row.status, redeemBefore: row.redeemBefore?.toISOString() ?? null, activatedAt: row.activatedAt?.toISOString() ?? null, expiresAt: row.expiresAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() });
}));

router.get("/admin/payments", requireAdmin(async (_req, res) => {
  const rows = await db.select().from(payments).orderBy(desc(payments.createdAt));
  res.json(rows.map((row) => ({ id: row.id, reference: row.reference, amount: row.amount, currency: row.currency, status: row.status, customerEmail: row.customerEmail, createdAt: row.createdAt.toISOString(), verifiedAt: row.verifiedAt?.toISOString() ?? null })));
}));

export default router;