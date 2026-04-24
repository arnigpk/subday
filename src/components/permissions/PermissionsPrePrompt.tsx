import { Bell, MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onAllow: () => void;
  onLater: () => void;
}

export function PermissionsPrePrompt({ open, onAllow, onLater }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onLater(); }}>
      <DialogContent className="max-w-sm rounded-3xl border-white/20 bg-background/75 backdrop-blur-xl">
        <DialogHeader className="text-center space-y-2">
          <DialogTitle className="text-xl font-semibold">
            Включите уведомления и геолокацию
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Чтобы получать максимум от subday
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Уведомления</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Узнавайте о новых акциях и о том, что подписка скоро закончится
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Геолокация</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Подсказываем, когда вы рядом с кофейней-партнёром
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={onAllow} className="w-full rounded-2xl h-12">
            Разрешить
          </Button>
          <Button onClick={onLater} variant="ghost" className="w-full rounded-2xl h-11">
            Позже
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
