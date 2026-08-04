// Подстановка персональных тегов в текст рассылки по профилю получателя.
// Общая рассылка хранит ОДИН текст-шаблон; имя/город/ID подставляются на лету
// для каждого получателя в момент отправки. Если тегов в тексте нет — функции
// работают как no-op (нулевая нагрузка, полная обратная совместимость).

export interface RecipientProfile {
  name?: string | null;
  city?: string | null;
  public_id?: string | number | null;
}

// Есть ли в тексте хоть один поддерживаемый тег — чтобы не тянуть профили зря.
const TAG_RE = /\{\{\s*(name|city|id)\s*\}\}/i;
export function hasTags(text: string | null | undefined): boolean {
  return !!text && TAG_RE.test(text);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Подставляет теги. html=true — экранирует ТОЛЬКО подставляемые значения
// (для Telegram parse_mode=HTML), не трогая разметку самого шаблона.
export function personalize(
  text: string,
  p?: RecipientProfile | null,
  opts?: { html?: boolean },
): string {
  if (!text) return text;
  const html = !!opts?.html;
  const wrap = (v: string) => (html ? escapeHtml(v) : v);
  const name = wrap((p?.name || '').toString().trim() || 'друг');
  const city = wrap((p?.city || '').toString().trim());
  const id = wrap(p?.public_id != null ? String(p.public_id) : '');
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*city\s*\}\}/gi, city)
    .replace(/\{\{\s*id\s*\}\}/gi, id);
}
