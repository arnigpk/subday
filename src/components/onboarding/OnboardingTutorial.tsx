import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OnboardingTutorialProps {
  onComplete: () => void;
}

type ContentBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; ordered?: boolean; items: string[] };

interface OnboardingPage {
  emoji: string;
  title: string;
  blocks: ContentBlock[];
  buttonLabel: string;
}

const PAGES: OnboardingPage[] = [
  {
    emoji: '☕',
    title: 'Одна подписка - десятки, сотни кофеен',
    blocks: [
      { type: 'p', text: 'subday объединяет кофейни города в одной подписке.' },
      { type: 'p', text: 'Выберите тариф, платите 1 раз в месяц и получайте напитки в кофейнях-партнёрах без лишних оплат за каждый кофе.' },
      { type: 'p', text: 'Уже более 20 кофеен в одной подписке.' },
    ],
    buttonLabel: 'Далее →',
  },
  {
    emoji: '💳',
    title: 'Как оформить подписку?',
    blocks: [
      { type: 'p', text: 'Перейдите в раздел «Подписки», выберите подходящий тариф и нажмите «Оформить».' },
      { type: 'p', text: 'Оплата доступна через:' },
      { type: 'list', items: ['Kaspi', 'Банковскую карту', 'Apple Pay', 'Google Pay'] },
      { type: 'p', text: 'После оплаты подписка активируется автоматически.' },
    ],
    buttonLabel: 'Далее →',
  },
  {
    emoji: '📱',
    title: 'Как пользоваться?',
    blocks: [
      {
        type: 'list',
        ordered: true,
        items: [
          'Откройте приложение.',
          'Выберите кофейню из списка партнёров.',
          'Покажите QR-код сотруднику кофейни.',
          'Получите свой напиток.',
        ],
      },
      { type: 'p', text: 'Всё занимает меньше минуты.' },
    ],
    buttonLabel: 'Начать пользоваться',
  },
];

function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="flex w-full flex-col gap-3 text-left text-sm text-muted-foreground">
      {blocks.map((block, i) => {
        if (block.type === 'p') {
          return <p key={i}>{block.text}</p>;
        }
        const ListTag = block.ordered ? 'ol' : 'ul';
        return (
          <ListTag key={i} className={block.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}>
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}

export function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  const isLast = selectedIndex === PAGES.length - 1;

  const handleNext = () => {
    if (isLast) onComplete();
    else emblaApi?.scrollNext();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#FAF9F6]">
      <button
        onClick={onComplete}
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+2.25rem)] z-10 flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-xs text-muted-foreground"
      >
        Пропустить <X className="h-3 w-3" />
      </button>

      <div className="flex-1 overflow-hidden" ref={emblaRef}>
        <div className="flex h-full">
          {PAGES.map((page, i) => (
            <div
              key={i}
              className="flex min-w-0 flex-[0_0_100%] flex-col items-center justify-center gap-5 overflow-y-auto px-8 py-10 text-center"
            >
              <motion.div
                animate={{ y: [0, -10, 0], scale: [1, 1.08, 1] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                className="flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 text-5xl"
              >
                {page.emoji}
              </motion.div>
              <h2 className="text-xl font-semibold">{page.title}</h2>
              <div className="w-full max-w-sm">
                <ContentBlocks blocks={page.blocks} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        <div className="flex gap-2">
          {PAGES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === selectedIndex ? 'w-6 bg-primary' : 'w-1.5 bg-primary/20'
              }`}
            />
          ))}
        </div>
        <Button onClick={handleNext} className="w-56 rounded-full" size="lg">
          {PAGES[selectedIndex].buttonLabel}
        </Button>
      </div>
    </div>
  );
}
