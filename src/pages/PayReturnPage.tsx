import { useEffect, useState } from 'react';

/**
 * Страница-«отскок» после оплаты FreedomPay для НАТИВНОГО приложения.
 *
 * Открывается внутри Custom Tabs / SFSafariViewController по адресу
 * https://web.subday.app/pay-return?status=success&order=..&path=/packages
 * и сразу перебрасывает пользователя обратно в приложение по deep-link
 * subday://pay?... — приложение ловит его, закрывает оверлей и показывает
 * результат. Кнопка-fallback на случай, если авто-переход заблокирован (iOS).
 */
export default function PayReturnPage() {
  const [deepLink, setDeepLink] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status') || params.get('payment') || 'success';
    const order = params.get('order') || '';
    const path = params.get('path') || '/packages';
    const link = `subday://pay?status=${encodeURIComponent(status)}&order=${encodeURIComponent(order)}&path=${encodeURIComponent(path)}`;
    setDeepLink(link);
    // Пытаемся вернуться в приложение автоматически.
    const t = setTimeout(() => {
      try { window.location.replace(link); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
      padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center',
      background: '#FAF9F6', color: '#1a1a1a',
    }}>
      <div style={{ fontSize: 40 }}>✅</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Оплата обработана</div>
      <div style={{ fontSize: 14, opacity: 0.7, maxWidth: 320 }}>
        Возвращаем вас в приложение subday…
      </div>
      {deepLink && (
        <a
          href={deepLink}
          style={{
            marginTop: 8, padding: '12px 24px', borderRadius: 16,
            background: '#8BC34A', color: '#fff', fontWeight: 600,
            textDecoration: 'none', fontSize: 15,
          }}
        >
          Вернуться в приложение
        </a>
      )}
    </div>
  );
}
