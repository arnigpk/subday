import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGuestMode } from '@/contexts/GuestModeContext';

interface UsePaymentResult {
  isProcessing: boolean;
  createPayment: (subscriptionTypeId: string) => Promise<void>;
}

// Пока оплата открыта в системном браузере (Custom Tabs / SFSafariViewController),
// храним заказ, чтобы подтвердить его при возврате (deep-link или закрытие оверлея).
export const PENDING_PAYMENT_KEY = 'subday_pending_payment';

export function usePayment(): UsePaymentResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const location = useLocation();
  const { isGuest, requestLogin } = useGuestMode();

  const createPayment = async (subscriptionTypeId: string) => {
    // Гость: оплата требует аккаунта — уводим на вход/регистрацию, не показывая ошибку.
    if (isGuest) {
      requestLogin();
      return;
    }
    setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Необходимо авторизоваться');
        return;
      }

      const returnPath = `${location.pathname}${location.search}${location.hash}`;
      const isNative = Capacitor.isNativePlatform();
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { subscription_type_id: subscriptionTypeId, return_path: returnPath, native: isNative },
      });

      if (error) {
        console.error('Payment creation error:', error);
        toast.error('Ошибка создания платежа');
        return;
      }

      if (!data?.payment_url) {
        toast.error('Ошибка: не получена ссылка на оплату');
        return;
      }

      if (isNative) {
        // Открываем оплату во ВСТРОЕННОМ системном браузере (не покидая приложение):
        // Android → Chrome Custom Tabs, iOS → SFSafariViewController. Это реальный
        // браузерный движок, поэтому Google Pay / Apple Pay работают (в отличие от
        // iframe/WebView). Возврат в приложение — по deep-link'у subday://pay,
        // а закрытие оверлея вручную ловится в DeepLinkHandler (browserFinished).
        try {
          localStorage.setItem(
            PENDING_PAYMENT_KEY,
            JSON.stringify({ orderId: data.order_id, returnPath, ts: Date.now() }),
          );
        } catch { /* ignore */ }
        await Browser.open({ url: data.payment_url, presentationStyle: 'fullscreen' });
      } else {
        window.location.href = data.payment_url;
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Произошла ошибка при создании платежа');
    } finally {
      setIsProcessing(false);
    }
  };

  return { isProcessing, createPayment };
}
