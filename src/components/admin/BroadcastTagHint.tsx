import { Sparkles } from 'lucide-react';

// Персональные теги для рассылок (push и Telegram). Подставляются на стороне
// сервера в момент отправки для КАЖДОГО получателя по его профилю.
const TAGS: { tag: string; label: string; example: string }[] = [
  { tag: '{{name}}', label: 'Имя пользователя', example: 'Иван' },
  { tag: '{{city}}', label: 'Город', example: 'Алматы' },
  { tag: '{{id}}', label: 'ID пользователя', example: '700349' },
];

interface Props {
  onInsert?: (tag: string) => void;
}

export function BroadcastTagHint({ onInsert }: Props) {
  return (
    <div className="p-3 bg-muted rounded-lg border border-border space-y-2">
      <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" />
        Персональные теги
      </p>
      <p className="text-xs text-muted-foreground">
        Подставляются для каждого получателя. Например,{' '}
        <span className="font-mono">{'«{{name}}, загляни на кофе ☕»'}</span> придёт как{' '}
        <span className="font-mono">«Иван, загляни на кофе ☕»</span>.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {TAGS.map((t) => (
          <button
            key={t.tag}
            type="button"
            onClick={() => onInsert?.(t.tag)}
            title={`${t.label} · напр. ${t.example}`}
            className="text-xs font-mono px-2 py-1 rounded-md bg-background border border-border hover:border-primary hover:text-primary transition-colors"
          >
            {t.tag}
            <span className="ml-1 text-muted-foreground font-sans">— {t.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Нажмите на тег, чтобы вставить. Если имя не указано — подставится «друг».
      </p>
    </div>
  );
}
