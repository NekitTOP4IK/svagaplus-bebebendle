/**
 * Validate post-login redirect paths (open-redirect safe).
 * Only same-origin relative paths starting with a single "/".
 */

const DEFAULT_NEXT = "/";

/**
 * Returns a safe relative path or fallback.
 * Rejects protocol-relative (`//evil`), external URLs, and empty junk.
 */
export function sanitizeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_NEXT,
): string {
  if (raw == null) return fallback;
  const value = raw.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("://")) return fallback;
  if (value.includes("\\")) return fallback;
  // Block path traversal noise
  if (value.includes("..")) return fallback;
  return value;
}

/** Default landing after competitive auth. */
export const COMPETITIVE_AUTH_NEXT = "/competitive";
