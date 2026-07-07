import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

// Ожидающий Kaspi(xpayment)-заказ. В отличие от FreedomPay (возврат в браузере с
// ?payment=success), Kaspi открывает отдельное приложение и возврата с параметрами
// нет — поэтому статус проверяем сами по order_id и показываем ту же анимацию.
export const PENDING_KASPI_KEY = 'subday_pending_kaspi';

export function usePaymentResult() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isVerifying, setIsVerifying] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

  // --- Kaspi(xpayment): глобальная проверка успеха оплаты ---
  // Работает на любом экране и переживает выгрузку приложения/закрытие модалки,
  // т.к. ожидающий заказ хранится в localStorage. Проверяем при возврате в
  // приложение (resume/focus) и интервалом, пока заказ не завершится.
  useEffect(() => {
    let cancelled = false;

    const checkPendingKaspi = async () => {
      let orderId: string | null = null;
      try { orderId = localStorage.getItem(PENDING_KASPI_KEY); } catch { /* ignore */ }
      if (!orderId) return;
      try {
        const { data } = await supabase
          .from('payment_orders')
          .select('status, created_at')
          .eq('order_id', orderId)
          .maybeSingle();
        if (!data) return;
        if (data.status === 'paid') {
          try { localStorage.removeItem(PENDING_KASPI_KEY); } catch { /* ignore */ }
          if (!cancelled) setShowSuccessAnimation(true);
        } else if (
          data.status === 'failed' || data.status === 'refunded' ||
          (data.created_at && Date.now() - new Date(data.created_at).getTime() > 30 * 60 * 1000)
        ) {
          // Заказ не оплачен и протух — убираем, чтобы не проверять вечно.
          try { localStorage.removeItem(PENDING_KASPI_KEY); } catch { /* ignore */ }
        }
      } catch { /* сеть/RLS — молча пропускаем, попробуем на следующем тике */ }
    };

    // Мгновенный показ: любой платёжный флоу может дёрнуть это событие, как только
    // сам обнаружил успех (напр. модалка Kaspi по своему опросу) — без ожидания тика.
    const onSuccessEvent = () => {
      try { localStorage.removeItem(PENDING_KASPI_KEY); } catch { /* ignore */ }
      if (!cancelled) setShowSuccessAnimation(true);
    };
    window.addEventListener('subday:payment-success', onSuccessEvent);

    const interval = setInterval(checkPendingKaspi, 2500);
    const onFocus = () => checkPendingKaspi();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    let capListener: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) checkPendingKaspi(); })
        .then((l) => { capListener = l; });
    }
    checkPendingKaspi(); // сразу при монтировании (напр. холодный старт после Kaspi)

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('subday:payment-success', onSuccessEvent);
      if (capListener) capListener.remove();
    };
  }, []);

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const orderId = searchParams.get('order');

    if (paymentStatus === 'success' && !isVerifying) {
      setIsVerifying(true);

      verifyPayment(orderId).then((result) => {
        if (result.success) {
          setShowSuccessAnimation(true);
        } else {
          toast.info('Платёж обрабатывается...', {
            duration: 5000,
            description: 'Подписка будет активирована сразу после подтверждения оплаты.',
          });
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('payment');
        nextParams.delete('order');
        setSearchParams(nextParams, { replace: true });
      }).finally(() => {
        setIsVerifying(false);
      });
    } else if (paymentStatus === 'failed') {
      toast.error('Оплата не прошла', {
        duration: 5000,
        description: 'Попробуйте ещё раз или выберите другой способ оплаты.',
      });

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('payment');
      nextParams.delete('order');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isVerifying]);

  const dismissSuccessAnimation = () => {
    setShowSuccessAnimation(false);
    window.location.reload();
  };

  return { showSuccessAnimation, dismissSuccessAnimation };
}

async function verifyPayment(orderId: string | null): Promise<{ success: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-payment', {
      body: orderId ? { order_id: orderId } : {},
    });

    if (error) {
      console.error('Verify payment error:', error);
      return { success: false };
    }

    console.log('Verify payment result:', data);
    return { success: data?.success === true };
  } catch (e) {
    console.error('Verify payment exception:', e);
    return { success: false };
  }
}
