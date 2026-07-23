import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { pgTable, text, integer, real, boolean, timestamp, uniqueIndex, serial, bigint, index } from "drizzle-orm/pg-core";

/**
 * Use a Pool (not a single Client). A bare `pg.Client` becomes permanently
 * "not queryable" after any disconnect (Postgres restart, network blip, idle
 * kill). Under PM2 that left the whole site on 500 until process restart.
 * Pool checks out fresh connections and recovers automatically.
 */
function createPool(): Pool {
  // DATABASE_URL is authoritative in CI and on PM2 hosts; POSTGRES_* for local Compose.
  const base: PoolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.POSTGRES_HOST || "localhost",
        port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
        database: process.env.POSTGRES_DB || "bebendle",
        user: process.env.POSTGRES_USER || "postgres",
        password: process.env.POSTGRES_PASSWORD || "postgres",
      };

  const pool = new Pool({
    ...base,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Idle clients can error without an active query; log and let Pool replace them.
  pool.on("error", (err) => {
    console.error("[db] unexpected idle client error", err);
  });

  return pool;
}

// Reuse the pool across Next.js HMR reloads in dev (avoid leaking connections).
const globalForDb = globalThis as typeof globalThis & { __bebebendlePgPool?: Pool };
const pool = globalForDb.__bebebendlePgPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__bebebendlePgPool = pool;
}

export const db = drizzle(pool);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  telegramUsername: text("telegram_username"),
  telegramPhotoUrl: text("telegram_photo_url"),
  displayName: text("display_name"),
  role: text("role", { enum: ["player", "moderator", "admin"] }).notNull().default("player"),
  // legacy svagaTelegramUserId/svagaUserId/linkedAt stay for rollback compatibility but are no longer written
  svagaTelegramUserId: bigint("svaga_telegram_user_id", { mode: "number" }),
  svagaUserId: text("svaga_user_id"),
  isSubscriber: boolean("is_subscriber"),
  lastSyncedAt: timestamp("last_synced_at"),
  lastSyncAttemptAt: timestamp("last_sync_attempt_at"),
  lastSyncError: text("last_sync_error"),
  linkedAt: timestamp("linked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userSessions = pgTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refreshTokenHash: text("refresh_token_hash").notNull().unique(),
  familyId: text("family_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  replacedBySessionId: text("replaced_by_session_id"),
  userAgentHash: text("user_agent_hash"),
}, (table) => ({
  familyIdx: index("user_sessions_family_id_idx").on(table.familyId),
  userIdx: index("user_sessions_user_id_idx").on(table.userId),
}));

export const scrans = pgTable("scrans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  imageUrl: text("image_url").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  numberOfLikes: integer("number_of_likes").notNull().default(0),
  numberOfDislikes: integer("number_of_dislikes").notNull().default(0),
  approved: boolean("approved").notNull().default(false),
  rejected: boolean("rejected").notNull().default(false),
  rejectReason: text("reject_reason"),
  rejectedAt: timestamp("rejected_at"),
  rejectedByUserId: integer("rejected_by_user_id").references(() => users.id),
  telegramId: text("telegram_id"),
  icon: text("icon"),
  submittedByUserId: integer("submitted_by_user_id").references(() => users.id),
  isSubscriberAtSubmit: boolean("is_subscriber_at_submit"),
  subscriberCheckedAt: timestamp("subscriber_checked_at"),
});

export const moderationAuditLog = pgTable("moderation_audit_log", {
  id: serial("id").primaryKey(),
  actorUserId: integer("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  scranId: integer("scran_id"),
  targetTelegramId: text("target_telegram_id"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  createdIdx: index("moderation_audit_log_created_at_idx").on(table.createdAt),
  scranIdx: index("moderation_audit_log_scran_id_idx").on(table.scranId),
}));

/** Telegram-level bans (covers bot-only submitters without a local users row). */
export const userBans = pgTable("user_bans", {
  telegramId: text("telegram_id").primaryKey(),
  reason: text("reason").notNull(),
  reasonCode: text("reason_code").notNull(),
  bannedByUserId: integer("banned_by_user_id").references(() => users.id),
  bannedAt: timestamp("banned_at", { withTimezone: true }).defaultNow().notNull(),
  active: boolean("active").notNull().default(true),
}, (table) => ({
  activeIdx: index("user_bans_active_idx").on(table.active),
  bannedAtIdx: index("user_bans_banned_at_idx").on(table.bannedAt),
}));

export const dailyScrandles = pgTable("daily_scrandles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  date: text("date").notNull(),
  scranAId: integer("scran_a_id").notNull(),
  scranBId: integer("scran_b_id").notNull(),
  roundNumber: integer("round_number").notNull(),
  createdAt: timestamp("created_at").notNull(),
}, (table) => ({
  uniqueRoundPerDay: uniqueIndex("unique_round_per_day").on(table.date, table.roundNumber),
}));

export const scrandleVotes = pgTable("scrandle_votes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  dailyScrandleId: integer("daily_scrandle_id").notNull(),
  sessionId: text("session_id").notNull(),
  fingerprintHash: text("fingerprint_hash"),
  chosenScranId: integer("chosen_scran_id").notNull(),
  createdAt: timestamp("created_at").notNull(),
}, (table) => ({
  uniqueVote: uniqueIndex("unique_scrandle_vote").on(table.sessionId, table.dailyScrandleId),
}));

export const dailyUserResults = pgTable("daily_user_results", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  date: text("date").notNull(),
  sessionId: text("session_id").notNull(),
  fingerprintHash: text("fingerprint_hash"),
  score: integer("score").notNull(),
  createdAt: timestamp("created_at").notNull(),
  userId: integer("user_id").references(() => users.id),
}, (table) => ({
  uniqueResultPerDay: uniqueIndex("unique_session_result_per_day").on(table.sessionId, table.date),
  uniqueResultPerUserPerDay: uniqueIndex("unique_user_result_per_user_day").on(table.userId, table.date),
}));

export const telegramVotes = pgTable("telegram_votes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  telegramId: text("telegram_id").notNull(),
  scranId: integer("scran_id").notNull(),
  isLike: boolean("is_like").notNull(),
  createdAt: timestamp("created_at").notNull(),
}, (table) => ({
  uniqueVote: uniqueIndex("unique_telegram_vote").on(table.telegramId, table.scranId),
}));

/** Key-value runtime flags (admin-toggleable). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Admin-managed on-site announcements shown once per browser on the homepage. */
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => ({
  activeCreatedIdx: index("announcements_active_created_idx").on(t.active, t.createdAt),
}));

export type Scran = typeof scrans.$inferSelect;
export type DailyScrandle = typeof dailyScrandles.$inferSelect;
export type ScrandleVote = typeof scrandleVotes.$inferSelect;
export type DailyUserResult = typeof dailyUserResults.$inferSelect;
export type TelegramVote = typeof telegramVotes.$inferSelect;
export type User = typeof users.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;
export type ModerationAuditLog = typeof moderationAuditLog.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
