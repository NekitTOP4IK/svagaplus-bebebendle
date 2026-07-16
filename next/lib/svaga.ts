export type SvagaCheckResult =
  | { status: "ok"; isSubscriber: boolean; checkedAt: Date }
  | {
      status: "unavailable";
      reason: "not_configured" | "timeout" | "unauthorized" | "upstream" | "invalid_response";
    };

type SvagaConfig = Readonly<{
  baseUrl: string;
  secret: string;
  targetUserId: string;
}>;

function readConfig(): SvagaConfig | null {
  const baseUrl = process.env.SVAGAPLUS_INTERNAL_URL?.trim();
  const secret = process.env.SVAGAPLUS_INTERNAL_SECRET?.trim();
  const targetUserId = process.env.SVAGA_TARGET_USER_ID?.trim();
  if (!baseUrl || !secret || !targetUserId) {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), secret, targetUserId };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && !Number.isNaN(value);
}

function parseCheckedAt(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isValidSuccessPayload(
  data: unknown,
  telegramUserId: number,
  targetUserId: string,
): data is {
  contract_version: 1;
  telegram_user_id: number;
  target_user_id: string;
  is_subscriber: boolean;
  checked_at: string;
} {
  if (!data || typeof data !== "object") return false;
  const payload = data as Record<string, unknown>;
  if (setEquals(Object.keys(payload), [
    "contract_version",
    "telegram_user_id",
    "target_user_id",
    "is_subscriber",
    "checked_at",
  ]) === false) {
    return false;
  }
  return payload.contract_version === 1
    && payload.telegram_user_id === telegramUserId
    && payload.target_user_id === targetUserId
    && typeof payload.is_subscriber === "boolean"
    && typeof payload.checked_at === "string";
}

function setEquals(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  const set = new Set(actual);
  return expected.every((key) => set.has(key));
}

export async function getSubscriberStatus(telegramUserId: number): Promise<SvagaCheckResult> {
  const config = readConfig();
  if (!config) {
    console.warn(
      "[svaga] subscriber check not configured (SVAGAPLUS_INTERNAL_URL, SVAGAPLUS_INTERNAL_SECRET, or SVAGA_TARGET_USER_ID)",
    );
    return { status: "unavailable", reason: "not_configured" };
  }

  if (!isPositiveInteger(telegramUserId)) {
    return { status: "unavailable", reason: "invalid_response" };
  }

  console.log(`[svaga] subscriber check start for telegramUserId=${telegramUserId}`);

  try {
    const res = await fetch(
      `${config.baseUrl}/api/internal/bebebendle/subscription-status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": config.secret,
        },
        body: JSON.stringify({
          contract_version: 1,
          telegram_user_id: telegramUserId,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );

    if (res.status === 401) {
      console.error(`[svaga] unauthorized for telegramUserId=${telegramUserId}`);
      return { status: "unavailable", reason: "unauthorized" };
    }

    if (res.status === 503) {
      console.error(`[svaga] upstream not configured for telegramUserId=${telegramUserId}`);
      return { status: "unavailable", reason: "upstream" };
    }

    if (!res.ok) {
      console.error(
        `[svaga] subscriber check failed for ${telegramUserId} with status:`,
        res.status,
      );
      return { status: "unavailable", reason: "upstream" };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { status: "unavailable", reason: "invalid_response" };
    }

    if (!isValidSuccessPayload(data, telegramUserId, config.targetUserId)) {
      console.error(`[svaga] invalid response shape for telegramUserId=${telegramUserId}`);
      return { status: "unavailable", reason: "invalid_response" };
    }

    const checkedAt = parseCheckedAt(data.checked_at);
    if (!checkedAt) {
      return { status: "unavailable", reason: "invalid_response" };
    }

    console.log(
      `[svaga] subscriber check result for ${telegramUserId}: isSubscriber=${data.is_subscriber}`,
    );
    return {
      status: "ok",
      isSubscriber: data.is_subscriber,
      checkedAt,
    };
  } catch (error) {
    const isTimeout =
      error instanceof Error
      && (error.name === "TimeoutError" || error.name === "AbortError" || /timeout/i.test(error.message));
    console.error(`[svaga] Error calling SVAGA+ for ${telegramUserId}:`, error);
    return { status: "unavailable", reason: isTimeout ? "timeout" : "upstream" };
  }
}
