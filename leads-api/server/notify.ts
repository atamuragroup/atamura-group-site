import type { LeadPayload } from "../src/core/lead";
import { formatUtm, type SiteLeadPayload } from "../src/core/siteLead";
import { normalizeKzPhone } from "../src/core/phone";
import { formatTenge } from "../src/core/money";

/** Sends a text to the configured Telegram chat. No-op until configured. */
async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status}`);
}

/**
 * Sends a new-lead notification to Telegram if a bot token + chat id are set.
 * No-op until configured — the site keeps working without it.
 */
export async function notifyTelegram(lead: LeadPayload): Promise<void> {
  const phone = normalizeKzPhone(lead.phone) ?? lead.phone;
  await sendTelegram(
    [
      "🏠 Новая заявка с калькулятора Atamura",
      `Имя: ${lead.name.trim()}`,
      `Телефон: +${phone}`,
      `Стоимость: ${formatTenge(lead.cost)}`,
      `Первоначальный взнос: ${formatTenge(lead.downPayment)}`,
      `Программа: ${lead.programName}`,
      `Ежемесячный платёж: ${formatTenge(lead.monthlyPayment)}`,
      `Источник: ${lead.source}`,
    ].join("\n"),
  );
}

/** Telegram notification for an atamura.group site-form lead. */
export async function notifySiteLead(lead: SiteLeadPayload): Promise<void> {
  const phone = normalizeKzPhone(lead.phone) ?? lead.phone;
  const utm = formatUtm(lead);
  await sendTelegram(
    [
      "🌐 Новая заявка с сайта atamura.group",
      lead.name && `Имя: ${lead.name}`,
      `Телефон: +${phone}`,
      `Форма: ${lead.source}`,
      lead.page && `Страница: ${lead.page}`,
      lead.ref && `Реферер: ${lead.ref}`,
      utm && `UTM: ${utm}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
