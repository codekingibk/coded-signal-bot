import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  forcePasswordChange: boolean("force_password_change").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
}, (table) => [uniqueIndex("admin_users_email_idx").on(table.email)]);

export const accessKeys = pgTable("access_keys", {
  id: serial("id").primaryKey(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  source: text("source").notNull().default("payment"),
  paymentId: integer("payment_id"),
  durationSeconds: integer("duration_seconds").notNull(),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  redeemBefore: timestamp("redeem_before", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  status: text("status").notNull().default("available"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdByAdminId: integer("created_by_admin_id"),
}, (table) => [
  uniqueIndex("access_keys_hash_idx").on(table.keyHash),
  uniqueIndex("access_keys_payment_idx").on(table.paymentId),
  index("access_keys_status_idx").on(table.status),
]);

export const accessSessions = pgTable("access_sessions", {
  id: serial("id").primaryKey(),
  accessKeyId: integer("access_key_id").notNull(),
  sessionHash: text("session_hash").notNull(),
  identityHash: text("identity_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("access_sessions_hash_idx").on(table.sessionHash),
  index("access_sessions_identity_idx").on(table.identityHash),
]);

export const adminSessions = pgTable("admin_sessions", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull(),
  sessionHash: text("session_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [uniqueIndex("admin_sessions_hash_idx").on(table.sessionHash)]);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("paystack"),
  reference: text("reference").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("pending"),
  customerEmail: text("customer_email"),
  accessKeyId: integer("access_key_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("payments_reference_idx").on(table.reference),
  index("payments_status_idx").on(table.status),
]);

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referralCode: text("referral_code").notNull(),
  referrerIdentity: text("referrer_identity").notNull(),
  referredIdentity: text("referred_identity").notNull(),
  status: text("status").notNull().default("pending"),
  qualifyingAccessKeyId: integer("qualifying_access_key_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("referrals_pair_idx").on(table.referrerIdentity, table.referredIdentity),
  index("referrals_code_idx").on(table.referralCode),
]);

export const referralCodes = pgTable("referral_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  identityHash: text("identity_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("referral_codes_code_idx").on(table.code),
  uniqueIndex("referral_codes_identity_idx").on(table.identityHash),
]);

export const referralRewards = pgTable("referral_rewards", {
  id: serial("id").primaryKey(),
  identityHash: text("identity_hash").notNull(),
  referralsRequired: integer("referrals_required").notNull(),
  referralsCount: integer("referrals_count").notNull(),
  rewardDuration: integer("reward_duration").notNull(),
  rewardKeyId: integer("reward_key_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("referral_rewards_identity_idx").on(table.identityHash)]);

export const streaks = pgTable("streaks", {
  id: serial("id").primaryKey(),
  identityHash: text("identity_hash").notNull(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastQualifyingActivity: timestamp("last_qualifying_activity", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("streaks_identity_idx").on(table.identityHash)]);

export const dailyActivity = pgTable("daily_activity", {
  id: serial("id").primaryKey(),
  identityHash: text("identity_hash").notNull(),
  activityDate: text("activity_date").notNull(),
  activityType: text("activity_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("daily_activity_identity_date_idx").on(table.identityHash, table.activityDate, table.activityType),
]);

export const signals = pgTable("signals", {
  id: serial("id").primaryKey(),
  multiplier: text("multiplier").notNull(),
  status: text("status").notNull().default("upcoming"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
  resultAt: timestamp("result_at", { withTimezone: true }),
  source: text("source").notNull().default("coded-signal-engine"),
  metadata: jsonb("metadata"),
}, (table) => [
  uniqueIndex("signals_generated_unique_idx").on(table.generatedAt),
  index("signals_generated_idx").on(table.generatedAt),
]);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_logs_created_idx").on(table.createdAt)]);