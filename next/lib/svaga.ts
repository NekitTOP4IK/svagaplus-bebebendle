const SVAGAPLUS_INTERNAL_URL = process.env.SVAGAPLUS_INTERNAL_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

export async function getSubscriberStatus(
  telegramUserId: number
): Promise<{
  isSubscriber: boolean;
  tributeUserId?: string;
}> {
  if (!SVAGAPLUS_INTERNAL_URL || !INTERNAL_SECRET) {
    console.warn(
      "SVAGA+ internal config missing (SVAGAPLUS_INTERNAL_URL or INTERNAL_SECRET)"
    );
    return { isSubscriber: false };
  }

  console.log(`[svaga] subscriber check start for telegramUserId=${telegramUserId}`);
  try {
    const res = await fetch(
      `${SVAGAPLUS_INTERNAL_URL.replace(/\/$/, "")}/internal/bebebendle/get-status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": INTERNAL_SECRET,
        },
        body: JSON.stringify({ telegram_user_id: telegramUserId }),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) {
      console.error(`[svaga] subscriber check failed for ${telegramUserId} with status:`, res.status);
      return { isSubscriber: false };
    }

    const data = (await res.json()) as {
      is_subscriber?: boolean;
      tribute_user_id?: string;
      isSubscriber?: boolean;
      tributeUserId?: string;
    };

    const isSubscriber = !!(data.is_subscriber ?? data.isSubscriber);
    const tributeUserId = data.tribute_user_id ?? data.tributeUserId;
    console.log(`[svaga] subscriber check result for ${telegramUserId}: isSubscriber=${isSubscriber} tributeUserId=${tributeUserId || 'none'}`);
    return {
      isSubscriber,
      tributeUserId,
    };
  } catch (error) {
    console.error(`[svaga] Error calling SVAGA+ internal endpoint for ${telegramUserId}:`, error);
    return { isSubscriber: false };
  }
}
