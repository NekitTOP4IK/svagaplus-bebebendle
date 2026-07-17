const BOT_TOKEN = process.env.BOT_TOKEN;

export async function sendTelegramMessage(
  telegramId: string,
  text: string,
): Promise<boolean> {
  if (!BOT_TOKEN || !telegramId.trim()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[telegram-notify] send failed", res.status, body);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[telegram-notify] send error", error);
    return false;
  }
}

export function buildDailyRotationMessage(
  date: string,
  scranNames: string[],
): string {
  if (scranNames.length === 1) {
    return (
      `🍽 Твоё блюдо «${scranNames[0]}» попало в сегодняшнюю ротацию daily (${date})!\n` +
      `Заходи играть и голосуй ✌️`
    );
  }
  const list = scranNames.map((n) => `• ${n}`).join("\n");
  return (
    `🍽 Твои блюда попали в сегодняшнюю ротацию daily (${date}):\n${list}\n\n` +
    `Заходи играть и голосуй ✌️`
  );
}
