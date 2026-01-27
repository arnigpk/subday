import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface UserAgreementDialogProps {
  children: React.ReactNode;
}

export function UserAgreementDialog({ children }: UserAgreementDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-primary hover:underline font-medium">
          {children}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ SUBDAY</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">
              ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ (Правила использования Subday)
            </p>
            
            <p>Дата размещения: 28 января 2026 г.</p>
            
            <p>
              <strong>Оператор:</strong> ИП «ЭВРИКА», ИИН 980102400093, supp@subday.app, +7 707 700 0994
            </p>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">1. Принятие условий</h3>
              <p>
                Используя Subday, Пользователь соглашается с: Публичной офертой, Политикой конфиденциальности, 
                Правилами пакетов/погашений и (при наличии отметки) Согласием на маркетинговые рассылки.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">2. Возраст 18+</h3>
              <p>
                Сервис предназначен только для лиц 18+. Оператор вправе запросить подтверждение возраста 
                при подозрении на нарушение.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">3. Аккаунт и безопасность</h3>
              <p>
                Пользователь обязан обеспечивать сохранность доступа к аккаунту и устройству. 
                Все действия из аккаунта считаются действиями Пользователя до момента уведомления 
                поддержки о компрометации.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">4. Запрещённые действия</h3>
              <p>Запрещено:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>взлом, вмешательство в работу приложения, обход ограничений;</li>
                <li>фрод с Погашениями, копирование/подмена кодов, использование ботов;</li>
                <li>передача Пакета/аккаунта третьим лицам, кроме гостевого доступа по правилам Оферты;</li>
                <li>действия, нарушающие закон, права Партнёров, Оператора или третьих лиц.</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">5. Доступность сервиса</h3>
              <p>
                Сервис предоставляется «как есть»; возможны перерывы из-за обновлений и технических работ.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">6. Ограничение доступа</h3>
              <p>
                Оператор вправе временно ограничить доступ при нарушениях/подозрении на фрод. 
                Пользователь может обратиться в поддержку для разбирательства.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">7. Контакты</h3>
              <p>supp@subday.app, +7 707 700 0994</p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
