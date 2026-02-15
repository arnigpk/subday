import { ReactNode, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ServiceRulesDialogProps {
  children: ReactNode;
}

export function ServiceRulesDialog({ children }: ServiceRulesDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-lg font-bold">Правила сервиса</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="offer" className="w-full">
          <div className="px-4">
            <TabsList className="grid w-full grid-cols-5 h-auto">
              <TabsTrigger value="offer" className="text-[10px] py-2 px-1">Оферта</TabsTrigger>
              <TabsTrigger value="agreement" className="text-[10px] py-2 px-1">Соглашение</TabsTrigger>
              <TabsTrigger value="privacy" className="text-[10px] py-2 px-1">Конфиденц.</TabsTrigger>
              <TabsTrigger value="rules" className="text-[10px] py-2 px-1">Правила</TabsTrigger>
              <TabsTrigger value="marketing" className="text-[10px] py-2 px-1">Рассылки</TabsTrigger>
            </TabsList>
          </div>
          
          <ScrollArea className="h-[60vh] px-4 pb-4">
            <TabsContent value="offer" className="mt-4 space-y-4 text-sm text-muted-foreground">
              <PublicOfferContent />
            </TabsContent>
            
            <TabsContent value="agreement" className="mt-4 space-y-4 text-sm text-muted-foreground">
              <UserAgreementContent />
            </TabsContent>
            
            <TabsContent value="privacy" className="mt-4 space-y-4 text-sm text-muted-foreground">
              <PrivacyPolicyContent />
            </TabsContent>
            
            <TabsContent value="rules" className="mt-4 space-y-4 text-sm text-muted-foreground">
              <PackageRulesContent />
            </TabsContent>
            
            <TabsContent value="marketing" className="mt-4 space-y-4 text-sm text-muted-foreground">
              <MarketingConsentContent />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PublicOfferContent() {
  return (
    <>
      <div className="text-center space-y-1">
        <h3 className="font-bold text-foreground text-base">ПУБЛИЧНАЯ ОФЕРТА</h3>
        <p className="text-xs">о заключении договора на использование сервиса Subday и приобретение пакетов напитков</p>
      </div>
      
      <div className="space-y-1 text-xs">
        <p><strong>Дата размещения:</strong> 28 января 2026 г.</p>
        <p><strong>Оператор (Правообладатель):</strong> ТОО "Subday Group", БИН 980102400093</p>
        <p><strong>Адрес:</strong> Республика Казахстан, Атырауская область, г. Атырау, мкр. Береке, д.23, кв.37</p>
        <p><strong>Контакты:</strong> supp@subday.app, +7 707 700 0994</p>
        <p><strong>Сервис:</strong> мобильное приложение Subday (далее — «Сервис»)</p>
      </div>

      <p>Настоящий документ является публичной офертой. Акцепт оферты означает полное и безоговорочное принятие условий. Договор заключается в электронной форме посредством действий Пользователя в Сервисе.</p>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">1. Термины</h4>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Пользователь</strong> — физическое лицо, достигшее 18 лет, использующее Сервис.</li>
          <li><strong>Партнёр</strong> — кофейня/заведение, подключённое к Subday, которое фактически готовит и выдаёт напитки.</li>
          <li><strong>Пакет</strong> — цифровой продукт в Сервисе, предоставляющий право на определённое количество Погашений в течение срока действия Пакета.</li>
          <li><strong>Погашение</strong> — списание 1 (одной) единицы Пакета в Сервисе для получения напитка у Партнёра.</li>
          <li><strong>Гостевой доступ</strong> — разовая функция, позволяющая Пользователю пригласить третье лицо для пробного использования в рамках правил раздела 7.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">2. Предмет договора</h4>
        <p>2.1. Оператор предоставляет Пользователю доступ к функционалу Сервиса, включая покупку Пакетов и механизм учёта/подтверждения Погашений.</p>
        <p>2.2. Напитки готовит и выдаёт Партнёр. Оператор не является организацией общественного питания и не изготавливает напитки.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">3. Территория и партнёры</h4>
        <p>3.1. Сервис предназначен для использования на территории Республики Казахстан.</p>
        <p>3.2. Перечень Партнёров и точек, где доступно Погашение, отображается в Сервисе и может меняться.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">4. Акцепт (принятие) оферты</h4>
        <p>4.1. Договор считается заключённым с момента совершения Пользователем любого из действий:</p>
        <ul className="list-disc list-inside ml-4">
          <li>а) нажатие «Принять/Согласен» с документами; и/или</li>
          <li>б) регистрация/авторизация; и/или</li>
          <li>в) оплата Пакета.</li>
        </ul>
        <p>4.2. Пользователь подтверждает, что ему исполнилось 18 лет.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">5. Пакеты, срок действия, правила использования</h4>
        <p>5.1. В Сервисе доступны, в том числе, следующие Пакеты:</p>
        <ul className="list-disc list-inside ml-4 space-y-1">
          <li>«30 кофе / месяц» — 30 Погашений, срок действия 30 календарных дней;</li>
          <li>«45 кофе / месяц» — 45 Погашений, срок действия 30 календарных дней;</li>
          <li>«180 кофе / 180 дней» — 180 Погашений, срок действия 180 календарных дней;</li>
          <li>«365 кофе / год» — 365 Погашений, срок действия 365 календарных дней.</li>
        </ul>
        <p>5.2. Перенос остатков не допускается: неиспользованные Погашения по окончании срока Пакета аннулируются.</p>
        <p>5.3. Лимитов Погашений "в день" нет, при этом Оператор вправе применять антифрод-ограничения при подозрительных действиях.</p>
        <p>5.4. Передача Пакета третьим лицам запрещена, кроме Гостевого доступа по разделу 7.</p>
        <p>5.5. Погашение доступно только у активных Партнёров, отображаемых в Сервисе.</p>
        <p>5.6. В отдельных кофейнях могут действовать внутренние правила обслуживания.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">6. Что входит в «Любой кофе»</h4>
        <p>6.1. «Любой кофе» означает: любой кофейный напиток, доступный у Партнёра.</p>
        <p>6.2. Альтернативное молоко, сиропы и иные добавки оплачиваются Пользователем отдельно на месте.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">7. Гостевой доступ (1 раз на аккаунт, срок 3 дня)</h4>
        <p>7.1. Пользователь может один раз на один аккаунт предоставить третьему лицу (18+) гостевой доступ.</p>
        <p>7.2. Гостевой доступ действует 3 (три) календарных дня с момента выдачи.</p>
        <p>7.3. При выдаче гостевого доступа у пригласившего Пользователя списывается 1 (одно) Погашение из его активного Пакета.</p>
        <p>7.4. Если приглашённый не воспользовался гостевым доступом в течение 3 дней, гостевой доступ прекращается. Списанное Погашение не возвращается.</p>
        <p>7.5. Пригласивший Пользователь несёт ответственность за действия приглашённого лица.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">8. Цена и оплата</h4>
        <p>8.1. Цены Пакетов указываются в приложении в тенге (KZT).</p>
        <p>8.2. Оплата производится через Kaspi.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">9. Возвраты</h4>
        <p>9.1. Возвраты по инициативе Пользователя (если "передумал/не успел") не предусмотрены.</p>
        <p>9.2. Ничто в оферте не ограничивает права потребителя, предоставленные законодательством РК.</p>
        <p>9.3. Обращения по ошибочным списаниям/сбоям: supp@subday.app.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">10. Антифрод и безопасность</h4>
        <p>10.1. При признаках мошенничества Оператор вправе временно ограничить операции Погашения или доступ к аккаунту.</p>
        <p>10.2. Пользователь вправе направить обращение в поддержку для проверки.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">11. Ответственность</h4>
        <p>11.1. За качество, безопасность, состав напитка отвечает Партнёр.</p>
        <p>11.2. Оператор не отвечает за невозможность Погашения по причинам вне контроля Оператора.</p>
        <p>11.3. Ответственность Оператора ограничивается стоимостью оплаченного Пакета.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">12. Персональные данные</h4>
        <p>12.1. Обработка персональных данных осуществляется по Политике конфиденциальности.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">13. Изменение условий</h4>
        <p>13.1. Оператор вправе обновлять оферту, публикуя новую редакцию в приложении.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">14. Споры и применимое право</h4>
        <p>14.1. Применимое право: Республика Казахстан.</p>
        <p>14.2. Досудебный порядок: обращение в поддержку supp@subday.app, срок ответа — до 10 рабочих дней.</p>
        <p>14.3. Далее спор рассматривается в порядке, установленном законодательством РК.</p>
      </div>
    </>
  );
}

function UserAgreementContent() {
  return (
    <>
      <div className="text-center space-y-1">
        <h3 className="font-bold text-foreground text-base">ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ SUBDAY</h3>
        <p className="text-xs">(Правила использования Subday)</p>
      </div>
      
      <div className="space-y-1 text-xs">
        <p><strong>Дата размещения:</strong> 28 января 2026 г.</p>
        <p><strong>Оператор:</strong> ТОО "Subday Group", БИН 980102400093, supp@subday.app, +7 707 700 0994</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">1. Принятие условий</h4>
        <p>Используя Subday, Пользователь соглашается с: Публичной офертой, Политикой конфиденциальности, Правилами пакетов/погашений и (при наличии отметки) Согласием на маркетинговые рассылки.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">2. Возраст 18+</h4>
        <p>Сервис предназначен только для лиц 18+. Оператор вправе запросить подтверждение возраста при подозрении на нарушение.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">3. Аккаунт и безопасность</h4>
        <p>Пользователь обязан обеспечивать сохранность доступа к аккаунту и устройству. Все действия из аккаунта считаются действиями Пользователя до момента уведомления поддержки о компрометации.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">4. Запрещённые действия</h4>
        <p>Запрещено:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>взлом, вмешательство в работу приложения, обход ограничений;</li>
          <li>фрод с Погашениями, копирование/подмена кодов, использование ботов;</li>
          <li>передача Пакета/аккаунта третьим лицам, кроме гостевого доступа по правилам Оферты;</li>
          <li>действия, нарушающие закон, права Партнёров, Оператора или третьих лиц.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">5. Доступность сервиса</h4>
        <p>Сервис предоставляется «как есть»; возможны перерывы из-за обновлений и технических работ.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">6. Ограничение доступа</h4>
        <p>Оператор вправе временно ограничить доступ при нарушениях/подозрении на фрод. Пользователь может обратиться в поддержку для разбирательства.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">7. Контакты</h4>
        <p>supp@subday.app, +7 707 700 0994</p>
      </div>
    </>
  );
}

function PrivacyPolicyContent() {
  return (
    <>
      <div className="text-center space-y-1">
        <h3 className="font-bold text-foreground text-base">ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ</h3>
      </div>
      
      <div className="space-y-1 text-xs">
        <p><strong>Дата размещения:</strong> 28 января 2026 г.</p>
        <p><strong>Оператор персональных данных:</strong> ТОО "Subday Group", БИН 980102400093</p>
        <p><strong>Адрес:</strong> РК, Атырауская обл., г. Атырау, мкр. Береке, д.23, кв.37</p>
        <p><strong>Контакты:</strong> supp@subday.app, +7 707 700 0994</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">1. Какие данные мы обрабатываем</h4>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Данные аккаунта:</strong> номер телефона, имя/ник, идентификаторы аккаунта.</li>
          <li><strong>Данные покупок и использования:</strong> приобретённые Пакеты, статусы оплат, история Погашений, гостевой доступ.</li>
          <li><strong>Технические данные:</strong> модель устройства, ОС, IP-адрес, идентификаторы приложения, журналы ошибок.</li>
          <li><strong>Данные для рассылок:</strong> push-токены, номер телефона для WhatsApp, идентификатор Telegram.</li>
          <li><strong>Геолокация:</strong> для показа ближайших партнёров (если разрешена).</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">2. Цели обработки</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>регистрация и предоставление доступа к сервису;</li>
          <li>проведение оплат и учёт Пакетов/Погашений;</li>
          <li>предоставление гостевого доступа по правилам;</li>
          <li>поддержка и обработка обращений;</li>
          <li>безопасность и антифрод;</li>
          <li>сервисные уведомления (не рекламные);</li>
          <li>маркетинговые сообщения — только при наличии отдельного согласия.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">3. Правовые основания</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>исполнение договора (Оферта/Соглашение);</li>
          <li>согласие Пользователя (маркетинг, геолокация, мессенджеры);</li>
          <li>законные интересы (безопасность/антифрод);</li>
          <li>требования законодательства РК.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">4. Кому мы передаём данные</h4>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Партнёрам:</strong> минимально необходимое для подтверждения Погашения.</li>
          <li><strong>Kaspi и платёжной инфраструктуре:</strong> для обработки оплаты.</li>
          <li><strong>Подрядчикам:</strong> хостинг/облако/уведомления/аналитика.</li>
          <li><strong>Госорганам:</strong> по законному требованию.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">5. Сроки хранения</h4>
        <p>Храним данные столько, сколько нужно для целей обработки, учёта и разрешения споров, затем удаляем или обезличиваем.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">6. Права пользователя</h4>
        <p>Вы можете запросить доступ/уточнение/удаление данных, а также отозвать маркетинговое согласие. Контакт: supp@subday.app.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">7. Безопасность</h4>
        <p>Используем организационные и технические меры защиты данных.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">8. Изменение политики</h4>
        <p>Новая редакция публикуется в приложении и действует с даты публикации.</p>
      </div>

      <div className="mt-6 pt-4 border-t space-y-4">
        <div className="text-center">
          <h4 className="font-bold text-foreground">СОГЛАСИЕ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ</h4>
        </div>
        <p>Я даю ТОО "Subday Group", БИН 980102400093, согласие на сбор, хранение, обработку и передачу моих персональных данных в объёме и целях, указанных в Политике конфиденциальности Subday, включая регистрацию, проведение оплат, учёт Пакетов/Погашений, гостевой доступ, поддержку, безопасность и антифрод.</p>
        <p className="text-xs">Дата: Дата принятия правил — Подтверждение: авторизация, регистрация, вход в приложение.</p>
      </div>
    </>
  );
}

function PackageRulesContent() {
  return (
    <>
      <div className="text-center space-y-1">
        <h3 className="font-bold text-foreground text-base">ПРАВИЛА SUBDAY</h3>
        <p className="text-xs">Правила пакетов, погашений и гостевого доступа</p>
      </div>
      
      <div className="space-y-1 text-xs">
        <p><strong>Дата размещения:</strong> 28 января 2026 г.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Пакеты:</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>30 кофе — 30 дней</li>
          <li>45 кофе — 30 дней</li>
          <li>180 кофе — 180 дней</li>
          <li>365 кофе — 365 дней (с даты успешной оплаты)</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Перенос остатков:</h4>
        <p>Нет. Неиспользованное сгорает по окончании срока.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Лимиты в день:</h4>
        <p>Нет.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Любой кофе:</h4>
        <p>Любой кофейный напиток. Альтернативное молоко/сиропы — доплата на месте.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Передача пакета:</h4>
        <p>Запрещена.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Гостевой доступ:</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>1 раз на аккаунт</li>
          <li>Действует 3 дня</li>
          <li>При выдаче у пригласившего списывается 1 напиток</li>
          <li>Если гость не успел — списание не возвращается</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Возвраты:</h4>
        <p>По желанию не предусмотрены; ошибки списаний решаются через поддержку.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Поддержка:</h4>
        <p>supp@subday.app, +7 707 700 0994</p>
      </div>
    </>
  );
}

function MarketingConsentContent() {
  return (
    <>
      <div className="text-center space-y-1">
        <h3 className="font-bold text-foreground text-base">СОГЛАСИЕ НА МАРКЕТИНГОВЫЕ РАССЫЛКИ</h3>
        <p className="text-xs">(Push / WhatsApp / Telegram)</p>
      </div>

      <div className="space-y-4">
        <p>Я даю согласие ТОО "Subday Group" (Subday) на получение рекламных и маркетинговых сообщений об акциях, новостях сервиса и предложениях партнёров по следующим каналам:</p>
        
        <ul className="list-disc list-inside space-y-1">
          <li>Push-уведомления</li>
          <li>WhatsApp-сообщения</li>
          <li>Telegram-сообщения</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">Я понимаю, что:</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>Сообщения могут содержать рекламу и спецпредложения</li>
          <li>Согласие является добровольным и может быть отозвано в любой момент:</li>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>через настройки Subday (если предусмотрено), и/или</li>
            <li>обращением в поддержку: supp@subday.app</li>
          </ul>
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-xs">Согласие действует до его отзыва. Отзыв: обращение на supp@subday.app (с учётом случаев, когда обработка допускается без согласия по закону).</p>
        <p className="text-xs">Дата: Дата принятия правил — Подтверждение: авторизация, регистрация, вход в приложение.</p>
      </div>
    </>
  );
}
