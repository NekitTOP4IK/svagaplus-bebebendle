/**
 * SVAGA+ internal client for Twitch → Telegram identity lookup.
 * Does not require SVAGA_TARGET_USER_ID (global by twitch_id).
 */

export type TwitchIdentityResult =
  | {
      status: "ok";
      linked: true;
      telegramUserId: number;
      twitchId: string;
      twitchUsername: string | null;
      avatarUrl: string | null;
    }
  | {
      status: "ok";
      linked: false;
      twitchId: string;
      twitchUsername: string | null;
      avatarUrl: string | null;
    }
  | { status: "unavailable"; reason: string };

type InternalConfig = Readonly<{
  baseUrl: string;
  secret: string;
}>;

function readInternalConfig(): InternalConfig | null {
  const baseUrl = process.env.SVAGAPLUS_INTERNAL_URL?.trim();
  const secret = process.env.SVAGAPLUS_INTERNAL_SECRET?.trim();
  if (!baseUrl || !secret) {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), secret };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && !Number.isNaN(value);
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  return value.length > 0 ? value : null;
}

function parseIdentityPayload(
  data: unknown,
  requestedTwitchId: string,
): TwitchIdentityResult {
  if (!data || typeof data !== "object") {
    return { status: "unavailable", reason: "invalid_response" };
  }

  const payload = data as Record<string, unknown>;
  if (payload.contract_version !== 1) {
    return { status: "unavailable", reason: "invalid_response" };
  }

  if (payload.twitch_id !== requestedTwitchId) {
    return { status: "unavailable", reason: "invalid_response" };
  }

  if (payload.linked === true) {
    if (!isPositiveInteger(payload.telegram_user_id)) {
      return { status: "unavailable", reason: "invalid_response" };
    }
    return {
      status: "ok",
      linked: true,
      telegramUserId: payload.telegram_user_id,
      twitchId: requestedTwitchId,
      twitchUsername: optionalString(payload.twitch_username),
      avatarUrl: optionalString(payload.avatar_url),
    };
  }

  if (payload.linked === false) {
    return {
      status: "ok",
      linked: false,
      twitchId: requestedTwitchId,
      twitchUsername: optionalString(payload.twitch_username),
      avatarUrl: optionalString(payload.avatar_url),
    };
  }

  return { status: "unavailable", reason: "invalid_response" };
}

/**
 * Resolve Twitch id → optional Telegram user via SVAGA LinkedAccount.
 */
export async function getTwitchIdentity(twitchId: string): Promise<TwitchIdentityResult> {
  const config = readInternalConfig();
  if (!config) {
    console.warn(
      "[svaga-twitch] not configured (SVAGAPLUS_INTERNAL_URL or SVAGAPLUS_INTERNAL_SECRET)",
    );
    return { status: "unavailable", reason: "not_configured" };
  }

  const id = typeof twitchId === "string" ? twitchId.trim() : "";
  if (!id) {
    return { status: "unavailable", reason: "invalid_response" };
  }

  console.log(`[svaga-twitch] identity lookup start twitchId=${id}`);

  try {
    const res = await fetch(
      `${config.baseUrl}/api/internal/bebebendle/twitch-identity`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": config.secret,
        },
        body: JSON.stringify({
          contract_version: 1,
          twitch_id: id,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );

    if (res.status === 401) {
      console.error(`[svaga-twitch] unauthorized for twitchId=${id}`);
      return { status: "unavailable", reason: "unauthorized" };
    }

    if (res.status === 503) {
      console.error(`[svaga-twitch] upstream not configured for twitchId=${id}`);
      return { status: "unavailable", reason: "upstream" };
    }

    if (!res.ok) {
      console.error(`[svaga-twitch] lookup failed for ${id} status=${res.status}`);
      return { status: "unavailable", reason: "upstream" };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { status: "unavailable", reason: "invalid_response" };
    }

    const parsed = parseIdentityPayload(data, id);
    if (parsed.status === "ok") {
      console.log(
        `[svaga-twitch] identity result twitchId=${id} linked=${parsed.linked}`
          + (parsed.linked ? ` telegramUserId=${parsed.telegramUserId}` : ""),
      );
    } else {
      console.error(`[svaga-twitch] invalid response for twitchId=${id}`);
    }
    return parsed;
  } catch (error) {
    const isTimeout =
      error instanceof Error
      && (error.name === "TimeoutError" || error.name === "AbortError" || /timeout/i.test(error.message));
    console.error(`[svaga-twitch] Error calling SVAGA+ for ${id}:`, error);
    return { status: "unavailable", reason: isTimeout ? "timeout" : "upstream" };
  }
}
