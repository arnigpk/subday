import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

type Lang = 'ru' | 'en';

export default function PrivacyPolicyPage() {
  const [lang, setLang] = useState<Lang>('ru');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex gap-1">
            <Button
              variant={lang === 'ru' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLang('ru')}
            >
              RU
            </Button>
            <Button
              variant={lang === 'en' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLang('en')}
            >
              EN
            </Button>
          </div>
        </div>

        {lang === 'ru' ? <PolicyRu /> : <PolicyEn />}

        <p className="text-xs text-muted-foreground text-center mt-10 mb-6">
          {lang === 'ru'
            ? 'Дата последнего обновления: 12 марта 2026 г.'
            : 'Last updated: March 12, 2026'}
        </p>
      </div>
    </div>
  );
}

function PolicyRu() {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none space-y-4">
      <h1 className="text-2xl font-bold">Политика конфиденциальности</h1>
      <p>
        Настоящая Политика конфиденциальности описывает, каким образом ТОО «Subday Group»
        (БИН 260240030635, далее — «Оператор») собирает, использует и защищает персональные
        данные пользователей мобильного приложения SubDay (далее — «Приложение»).
      </p>

      <h2 className="text-lg font-semibold">1. Какие данные собирает Оператор</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Номер телефона — для регистрации и авторизации</li>
        <li>Имя и фото профиля — для персонализации</li>
        <li>Город и страна — для отображения ближайших заведений</li>
        <li>Геолокация (с вашего согласия) — для расчёта расстояний до кофеен</li>
        <li>Данные об устройстве (токен push-уведомлений, платформа) — для доставки уведомлений</li>
        <li>История покупок и использования подписок</li>
        <li>Данные Telegram-аккаунта (при авторизации через Telegram)</li>
      </ul>

      <h2 className="text-lg font-semibold">2. Как используются данные</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Предоставление доступа к сервису и управление подписками</li>
        <li>Отправка push-уведомлений и сообщений</li>
        <li>Отображение ближайших заведений-партнёров</li>
        <li>Улучшение работы Приложения и анализ статистики</li>
        <li>Обработка платежей через эквайринг FreedomPay (Visa/Mastercard/Apple Pay/Google Pay)</li>
      </ul>

      <h2 className="text-lg font-semibold">3. Платежи</h2>
      <p>
        Оплата производится онлайн банковскими картами Visa/Mastercard через сертифицированный
        платёжный сервис Paylink. Оператор не хранит данные банковских карт — они обрабатываются
        непосредственно платёжным провайдером.
      </p>

      <h2 className="text-lg font-semibold">4. Хранение и защита данных</h2>
      <p>
        Данные хранятся на защищённых серверах с шифрованием. Оператор применяет технические и
        организационные меры для защиты от несанкционированного доступа, утраты или изменения данных.
        Доступ к персональным данным имеют только уполномоченные сотрудники.
      </p>

      <h2 className="text-lg font-semibold">5. Передача данных третьим лицам</h2>
      <p>
        Оператор не продаёт и не передаёт ваши персональные данные третьим лицам, за исключением
        случаев, предусмотренных законодательством Республики Казахстан, а также:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Платёжным провайдерам — для обработки транзакций</li>
        <li>Заведениям-партнёрам — для верификации подписки при получении напитка</li>
      </ul>

      <h2 className="text-lg font-semibold">6. Ваши права</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Просмотр и редактирование ваших данных в профиле Приложения</li>
        <li>Отключение push-уведомлений в настройках</li>
        <li>Удаление аккаунта — через раздел «Профиль» в Приложении</li>
        <li>Запрос на удаление всех данных — по запросу на supp@subday.app</li>
      </ul>

      <h2 className="text-lg font-semibold">7. Файлы cookie</h2>
      <p>
        Приложение использует локальное хранилище (localStorage) для сохранения настроек и
        сессии авторизации. Сторонние cookie-файлы не используются.
      </p>

      <h2 className="text-lg font-semibold">8. Дети</h2>
      <p>
        Приложение не предназначено для лиц младше 16 лет. Оператор сознательно не собирает
        данные детей.
      </p>

      <h2 className="text-lg font-semibold">9. Изменения политики</h2>
      <p>
        Оператор может обновлять настоящую Политику. Актуальная версия всегда доступна в Приложении.
        При существенных изменениях пользователи будут уведомлены через push-уведомление.
      </p>

      <h2 className="text-lg font-semibold">10. Контакты</h2>
      <p>
        ТОО «Subday Group»<br />
        БИН: 260240030635<br />
        Email: supp@subday.app
      </p>
    </article>
  );
}

function PolicyEn() {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none space-y-4">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p>
        This Privacy Policy describes how Subday Group LLP (BIN 260240030635, hereinafter
        the "Operator") collects, uses, and protects personal data of users of the SubDay
        mobile application (hereinafter "Application").
      </p>

      <h2 className="text-lg font-semibold">1. Data the Operator Collects</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Phone number — for registration and authentication</li>
        <li>Name and profile photo — for personalization</li>
        <li>City and country — to display nearby venues</li>
        <li>Geolocation (with your consent) — to calculate distances to coffee shops</li>
        <li>Device data (push notification token, platform) — for notification delivery</li>
        <li>Purchase and subscription usage history</li>
        <li>Telegram account data (when signing in via Telegram)</li>
      </ul>

      <h2 className="text-lg font-semibold">2. How Your Data Is Used</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Providing access to the service and managing subscriptions</li>
        <li>Sending push notifications and messages</li>
        <li>Displaying nearby partner venues</li>
        <li>Improving the Application and analyzing statistics</li>
        <li>Processing payments via Paylink (Visa/Mastercard)</li>
      </ul>

      <h2 className="text-lg font-semibold">3. Payments</h2>
      <p>
        Payments are processed online using Visa/Mastercard bank cards through the certified
        payment service Paylink. The Operator does not store bank card data — it is processed directly
        by the payment provider.
      </p>

      <h2 className="text-lg font-semibold">4. Data Storage and Security</h2>
      <p>
        Data is stored on encrypted, secure servers. The Operator implements technical and organizational
        measures to protect against unauthorized access, loss, or alteration. Access to personal
        data is limited to authorized personnel only.
      </p>

      <h2 className="text-lg font-semibold">5. Third-Party Data Sharing</h2>
      <p>
        The Operator does not sell or share your personal data with third parties, except as required by the
        laws of the Republic of Kazakhstan, and:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Payment providers — for transaction processing</li>
        <li>Partner venues — for subscription verification when redeeming drinks</li>
      </ul>

      <h2 className="text-lg font-semibold">6. Your Rights</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>View and edit your data in your Application profile</li>
        <li>Disable push notifications in settings</li>
        <li>Delete your account — via the "Profile" section in the Application</li>
        <li>Request deletion of all data — by contacting supp@subday.app</li>
      </ul>

      <h2 className="text-lg font-semibold">7. Cookies</h2>
      <p>
        The Application uses local storage (localStorage) to save settings and authentication
        sessions. No third-party cookies are used.
      </p>

      <h2 className="text-lg font-semibold">8. Children</h2>
      <p>
        The Application is not intended for individuals under 16 years of age. The Operator does not
        knowingly collect data from children.
      </p>

      <h2 className="text-lg font-semibold">9. Policy Changes</h2>
      <p>
        The Operator may update this Policy. The current version is always available in the Application.
        Users will be notified of significant changes via push notification.
      </p>

      <h2 className="text-lg font-semibold">10. Contact Us</h2>
      <p>
        Subday Group LLP<br />
        BIN: 260240030635<br />
        Email: supp@subday.app
      </p>
    </article>
  );
}
