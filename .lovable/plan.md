

## Миграция с Lucide на Heroicons

### Масштаб задачи

- **87 файлов** используют Lucide icons
- **~414 импортов** по всему проекту
- Lucide: 1400+ иконок, Heroicons: ~300 иконок

### Важное предупреждение

Heroicons имеет значительно меньше иконок (~300 vs 1400+). Некоторые иконки из Lucide **не имеют прямого аналога** в Heroicons. Например:
- `Droplets`, `QrCode`, `Zap`, `Sparkles` — нет точных аналогов
- Придётся подбирать ближайшие замены или оставлять Lucide для отсутствующих

### Примеры замен ключевых иконок

```text
Lucide               →  Heroicons
─────────────────────────────────────
Home                  →  HomeIcon
Coffee                →  нет аналога (можно CakeIcon или оставить)
MapPin                →  MapPinIcon
User                  →  UserIcon
Zap                   →  BoltIcon
ArrowLeft             →  ArrowLeftIcon
Clock                 →  ClockIcon
Search                →  MagnifyingGlassIcon
Check                 →  CheckIcon
X                     →  XMarkIcon
Plus                  →  PlusIcon
Trash2                →  TrashIcon
Pencil                →  PencilIcon
ChevronRight          →  ChevronRightIcon
Heart                 →  HeartIcon
Send                  →  PaperAirplaneIcon
Bell                  →  BellIcon
Shield                →  ShieldCheckIcon
Loader2               →  нет аналога (нужен кастомный спиннер)
QrCode                →  QrCodeIcon (есть!)
Gift                  →  GiftIcon
Eye / EyeOff          →  EyeIcon / EyeSlashIcon
Navigation            →  нет прямого аналога
Droplets              →  нет аналога
Sparkles              →  SparklesIcon (есть!)
```

### Синтаксис отличается

```tsx
// Lucide (текущий)
import { Home } from 'lucide-react';
<Home size={20} strokeWidth={2} />

// Heroicons
import { HomeIcon } from '@heroicons/react/24/outline';
<HomeIcon className="w-5 h-5" />  // размер через className
```

Heroicons не имеет пропсов `size` и `strokeWidth` — размер задаётся через CSS классы.

### План реализации

1. **Установить** `@heroicons/react`
2. **Создать маппинг** Lucide → Heroicons для всех используемых иконок
3. **Пройти по всем 87 файлам** и заменить импорты и использование
4. **Для иконок без аналога** (Coffee, Droplets, Loader2, Navigation) — использовать ближайшие альтернативы или оставить Lucide как fallback
5. **Адаптировать размеры** — заменить `size={20}` на `className="w-5 h-5"` везде
6. **Синхронизировать** все разделы

### Риски

- Высокий объём изменений (87 файлов)
- Некоторые иконки не имеют аналогов — возможно придётся держать обе библиотеки
- Изменение API (size prop → className) может вызвать визуальные расхождения

### Оценка: ~87 файлов, крупная миграция

