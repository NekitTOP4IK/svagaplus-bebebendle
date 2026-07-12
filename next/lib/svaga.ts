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
      console.error("SVAGA+ status fetch failed with status:", res.status);
      return { isSubscriber: false };
    }

    const data = (await res.json()) as {
      is_subscriber?: boolean;
      tribute_user_id?: string;
      isSubscriber?: boolean;
      tributeUserId?: string;
    };

    return {
      isSubscriber: !!(data.is_subscriber ?? data.isSubscriber),
      tributeUserId: data.tribute_user_id ?? data.tributeUserId,
    };
  } catch (error) {
    console.error("Error calling SVAGA+ internal endpoint:", error);
    return { isSubscriber: false };
  }
}
