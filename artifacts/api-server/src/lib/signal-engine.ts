import { db } from "@workspace/db";
import { signals } from "@workspace/db/schema";
import { and, asc, desc, eq, gte, lt, lte } from "drizzle-orm";

const CYCLE_SECONDS = 180;
const MIN_MULTIPLIER = 1.2;
const MAX_MULTIPLIER = 4.8;

function deterministicMultiplier(slot: number) {
  const value = Math.sin(slot * 12.9898 + 78.233) * 43758.5453;
  const normalized = value - Math.floor(value);
  return Number((MIN_MULTIPLIER + normalized * (MAX_MULTIPLIER - MIN_MULTIPLIER)).toFixed(2));
}

export async function ensureSignalWindow(now = new Date()) {
  const currentSlot = Math.floor(now.getTime() / 1000 / CYCLE_SECONDS);
  const start = new Date(currentSlot * CYCLE_SECONDS * 1000);
  const nextStart = new Date((currentSlot + 1) * CYCLE_SECONDS * 1000);

  const existing = await db.select().from(signals)
    .where(and(gte(signals.generatedAt, start), lte(signals.generatedAt, nextStart)))
    .orderBy(asc(signals.generatedAt));

  const byTimestamp = new Map(existing.map((signal) => [signal.generatedAt.toISOString(), signal]));
  const windows = [
    { generatedAt: start, multiplier: deterministicMultiplier(currentSlot), status: "live" },
    { generatedAt: nextStart, multiplier: deterministicMultiplier(currentSlot + 1), status: "upcoming" },
  ];

  for (const window of windows) {
    if (!byTimestamp.has(window.generatedAt.toISOString())) {
      await db.insert(signals).values({
          multiplier: String(window.multiplier),
          generatedAt: window.generatedAt,
          resultAt: window.status === "live" ? new Date(window.generatedAt.getTime() + 35_000) : null,
          status: window.status,
        })
        .onConflictDoNothing({ target: signals.generatedAt });
    }
  }

  await db.update(signals)
    .set({ status: "complete" })
    .where(and(lt(signals.generatedAt, start), eq(signals.status, "live")));

  return db.select().from(signals)
    .where(gte(signals.generatedAt, start))
    .orderBy(asc(signals.generatedAt))
    .limit(2);
}

export async function getRecentSignals(limit = 12) {
  return db.select().from(signals).orderBy(desc(signals.generatedAt)).limit(limit);
}

export { CYCLE_SECONDS };