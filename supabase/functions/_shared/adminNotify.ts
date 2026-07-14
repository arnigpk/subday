// Уведомление в админ-бот Telegram. Укреплённая версия: раньше сбои были
// «тихими» (ошибка запроса шаблона → молчаливый return; ответ Telegram не
// проверялся) — так 14.07 потерялось уведомление об успешной оплате Kaspi,
// прошедшей в момент рестарта edge-контейнера. Теперь: ретрай шаблона и
// отправки, проверка ответа Telegram, подробные логи каждой причины пропуска.

// deno-lint-ignore no-explicit-any
type AnyClient = any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendAdminNotification(
  supabase: AnyClient,
  env: Record<string, string>,
  triggerType: string,
  variables: Record<string, string>,
): Promise<void> {
  try {
    // Шаблон — с одним ретраем: транзиентная ошибка БД не должна терять уведомление.
    let template: { message_template: string } | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { data, error } = await supabase
        .from('auto_notification_templates')
        .select('message_template, is_active')
        .eq('trigger_type', triggerType)
        .eq('is_active', true)
        .maybeSingle();
      if (data) { template = data; break; }
      if (error) {
        console.error(`[adminNotify] template fetch failed (attempt ${attempt}) for ${triggerType}:`, error.message || error);
        if (attempt < 2) await sleep(500);
      } else {
        console.warn(`[adminNotify] no active template for ${triggerType} — notification skipped`);
        return; // шаблон реально выключен/отсутствует — это осознанная настройка
      }
    }
    if (!template) {
      console.error(`[adminNotify] giving up: template unavailable for ${triggerType}`);
      return;
    }

    const botToken = Deno.env.get('NOTIFICATION_BOT_TOKEN') || env['NOTIFICATION_BOT_TOKEN'];
    const chatId = Deno.env.get('NOTIFICATION_CHAT_ID') || env['NOTIFICATION_CHAT_ID'];
    if (!botToken || !chatId) {
      console.error(`[adminNotify] NOTIFICATION_BOT_TOKEN/CHAT_ID missing — cannot send ${triggerType}`);
      return;
    }

    let message = template.message_template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    // Отправка — до 2 попыток, с проверкой ответа Telegram (раньше не проверялся).
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
        });
        const result = await resp.json().catch(() => ({}));
        if (result?.ok) return;
        console.error(`[adminNotify] telegram rejected ${triggerType} (attempt ${attempt}):`, result?.description || resp.status);
        // parse_mode HTML мог сломаться на содержимом переменных — повторяем без него.
        if (attempt === 1 && /parse/i.test(String(result?.description || ''))) {
          const plain = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message }),
          });
          const plainResult = await plain.json().catch(() => ({}));
          if (plainResult?.ok) return;
        }
      } catch (e) {
        console.error(`[adminNotify] telegram send error ${triggerType} (attempt ${attempt}):`, e instanceof Error ? e.message : e);
      }
      if (attempt < 2) await sleep(700);
    }
  } catch (e) {
    console.error('[adminNotify] unexpected error:', e instanceof Error ? e.message : e);
  }
}
