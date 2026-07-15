import { useState } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Маленькая иконка «!» рядом с пунктом подписки. По тапу — аккуратный поповер
 * с пояснением (напр. «Айс кофе → айс латте, айс капучино, айс батч брю…»).
 * Показывается только если пояснение задано в админке (feature_hints).
 */
export function FeatureHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text?.trim()) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Подробнее"
          className="shrink-0 w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center hover:bg-accent/30 active:scale-90 transition-all"
        >
          <Info size={13} strokeWidth={2.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-auto max-w-[280px] p-3 rounded-2xl border-border/60 shadow-xl bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-2.5">
          <div className="shrink-0 w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center mt-0.5">
            <Info size={14} className="text-accent" strokeWidth={2.5} />
          </div>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{text}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
