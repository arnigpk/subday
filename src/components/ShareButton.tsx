import { Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface ShareButtonProps {
  url: string;
  title?: string;
  text?: string;
  size?: number;
  className?: string;
}

// Иконка «Поделиться». Нативный системный лист (Instagram/WhatsApp/Telegram/…)
// через Web Share API (работает в WebView iOS/Android и в браузере). Фолбэк —
// копирование ссылки в буфер.
export function ShareButton({ url, title, text, size = 18, className }: ShareButtonProps) {
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const shareData: ShareData = { url, ...(title ? { title } : {}), ...(text ? { text } : {}) };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      // Пользователь отменил системный лист — молча выходим.
      if ((err as any)?.name === 'AbortError') return;
    }
    // Фолбэк: копируем ссылку.
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось поделиться');
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      title="Поделиться"
      aria-label="Поделиться"
      className={className ?? 'w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/70 transition-colors'}
    >
      <Share2 size={size} />
    </button>
  );
}
