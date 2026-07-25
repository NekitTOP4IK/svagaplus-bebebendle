/** Authoritative action keys accepted by moderation_audit_log writers. */
export const AUDIT_ACTIONS = {
  SCRAN_APPROVE: "scran.approve",
  SCRAN_REJECT: "scran.reject",
  SCRAN_UNPUBLISH: "scran.unpublish",
  SCRAN_DELETE: "scran.delete",
  SCRAN_EDIT: "scran.edit",
  SCRAN_RESTORE: "scran.restore",
  SCRAN_BULK_APPROVE: "scran.bulk_approve",
  SCRAN_BULK_REJECT: "scran.bulk_reject",
  USER_BAN: "user.ban",
  DAILY_GENERATE: "daily.generate",
  SETTINGS_DAILY_ROTATION_NOTIFY: "settings.daily_rotation_notify",
  SETTINGS_DAILY_GENERATION: "settings.daily_generation",
  ANNOUNCEMENTS_CREATE: "announcements.create",
  ANNOUNCEMENTS_UPDATE: "announcements.update",
  ANNOUNCEMENTS_DELETE: "announcements.delete",
  USERS_UPDATE: "users.update",
  COMPETITIVE_SEASON_CREATE: "competitive.season.create",
  COMPETITIVE_SEASON_UPDATE: "competitive.season.update",
  COMPETITIVE_SEASON_END: "competitive.season.end",
  COMPETITIVE_INTRO_UPDATE: "competitive.intro.update",
  COMPETITIVE_SETTINGS_UPDATE: "competitive.settings.update",
  COMPETITIVE_CONTENT_MODE_RULES_UPDATE: "competitive.content.mode_rules.update",
  COMPETITIVE_CONTENT_UPLOAD: "competitive.content.upload",
  COMPETITIVE_POOL_ADD: "competitive.pool.add",
  COMPETITIVE_POOL_ENABLE: "competitive.pool.enable",
  COMPETITIVE_DAILY_GENERATE: "competitive.daily.generate",
  COMPETITIVE_DEBUG_RESET: "competitive.debug.reset",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
export const PRODUCTION_AUDIT_ACTIONS = Object.values(AUDIT_ACTIONS) as AuditAction[];
