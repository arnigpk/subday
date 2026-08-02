import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface OnboardingTutorialProps {
  onComplete: () => void;
}

interface Slide {
  emoji: string;
  title: string;
  body: string;        // абзацы через \n; строки с «- » рендерятся списком
  buttonLabel: string;
}

// Дефолтные слайды — показываются мгновенно и работают даже без сети.
// Из БД (onboarding_slides) подтягиваются свежие, если они есть.
const DEFAULT_SLIDES: Slide[] = [
  {
    emoji: '☕',
    title: 'Одна подписка — десятки, сотни кофеен',
    body: 'subday объединяет кофейни города в одной подписке.\n'
      + 'Выберите тариф, платите 1 раз в месяц и получайте напитки в кофейнях-партнёрах без лишних оплат за каждый кофе.\n'
      + 'Уже более 20 кофеен в одной подписке.',
    buttonLabel: 'Далее →',
  },
  {
    emoji: '💳',
    title: 'Как оформить подписку?',
    body: 'Перейдите в раздел «Подписки», выберите подходящий тариф и нажмите «Оформить».\n'
      + 'Оплата доступна через:\n- Kaspi\n- Банковскую карту\n- Apple Pay\n- Google Pay\n'
      + 'После оплаты подписка активируется автоматически.',
    buttonLabel: 'Далее →',
  },
  {
    emoji: '📱',
    title: 'Как пользоваться?',
    body: '- Откройте приложение.\n- Выберите кофейню из списка партнёров.\n- Покажите QR-код сотруднику кофейни.\n- Получите свой напиток.\n'
      + 'Всё занимает меньше минуты.',
    buttonLabel: 'Начать пользоваться',
  },
];

// Тело слайда: абзацы по \n; идущие подряд строки с «- » собираем в маркированный список.
function SlideBody({ body }: { body: string }) {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const nodes: JSX.Element[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (bullets.length) {
      nodes.push(
        <ul key={key} className="list-disc space-y-1 pl-5">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  lines.forEach((line, i) => {
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2));
    } else {
      flush(`ul-${i}`);
      nodes.push(<p key={`p-${i}`}>{line}</p>);
    }
  });
  flush('ul-end');
  return <div className="flex w-full flex-col gap-3 text-left text-sm text-muted-foreground">{nodes}</div>;
}

export function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const [slides, setSlides] = useState<Slide[]>(DEFAULT_SLIDES);
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // Тянем слайды из БД; при любой ошибке/пустоте остаёмся на дефолтных.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('onboarding_slides')
          .select('emoji, title, body, button_label')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (cancelled || error || !data || data.length === 0) return;
        setSlides(data.map(d => ({
          emoji: d.emoji || '☕',
          title: d.title || '',
          body: d.body || '',
          buttonLabel: d.button_label || 'Далее →',
        })));
      } catch { /* оставляем дефолт */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Индекс не должен выйти за пределы, если из БД пришло меньше слайдов.
  const safeIndex = Math.min(index, slides.length - 1);
  const page = slides[safeIndex];
  const isLast = safeIndex === slides.length - 1;

  const handleNext = () => {
    if (isLast) onComplete();
    else setIndex(safeIndex + 1);
  };

  // Простой свайп без библиотеки — не критичен, кнопки всегда основной путь.
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0]?.clientX ?? null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (dx < -50 && !isLast) setIndex(safeIndex + 1);
    else if (dx > 50 && safeIndex > 0) setIndex(safeIndex - 1);
  };

  if (!page) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#FAF9F6]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <button
        onClick={onComplete}
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+2.25rem)] z-10 flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-xs text-muted-foreground active:scale-95"
      >
        Пропустить <X className="h-3 w-3" />
      </button>

      {/* Один активный слайд — без карусели: на слабых Android WebView embla
          вешал экран (индекс шёл, слайды не двигались). */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-8 py-10 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 text-5xl animate-onboarding-emoji">
          {page.emoji}
        </div>
        <h2 className="text-xl font-semibold">{page.title}</h2>
        <div className="w-full max-w-sm">
          <SlideBody body={page.body} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === safeIndex ? 'w-6 bg-primary' : 'w-1.5 bg-primary/20'}`}
            />
          ))}
        </div>
        <Button onClick={handleNext} className="w-56 rounded-full" size="lg">
          {page.buttonLabel}
        </Button>
      </div>
    </div>
  );
}
