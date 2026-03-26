import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PaymentState {
  isProcessing: boolean;
  paymentUrl: string | null;
  paymentOrderId: string | null;
  showIframe: boolean;
}

interface UsePaymentResult extends PaymentState {
  createPayment: (subscriptionTypeId: string) => Promise<void>;
  closePayment: () => void;
  onPaymentSuccess: () => void;
}

export function usePayment(): UsePaymentResult {
  const [state, setState] = useState<PaymentState>({
    isProcessing: false,
    paymentUrl: null,
    paymentOrderId: null,
    showIframe: false,
  });

  const createPayment = useCallback(async (subscriptionTypeId: string) => {
    setState(s => ({ ...s, isProcessing: true }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Необходимо авторизоваться');
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { subscription_type_id: subscriptionTypeId },
      });

      if (error) {
        console.error('Payment creation error:', error);
        toast.error('Ошибка создания платежа');
        return;
      }

      if (data?.payment_url) {
        setState(s => ({
          ...s,
          paymentUrl: data.payment_url,
          paymentOrderId: data.payment_order_id || null,
          showIframe: true,
        }));
      } else {
        console.error('No payment URL in response:', data);
        toast.error('Ошибка: не получена ссылка на оплату');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Произошла ошибка при создании платежа');
    } finally {
      setState(s => ({ ...s, isProcessing: false }));
    }
  }, []);

  const closePayment = useCallback(() => {
    setState({
      isProcessing: false,
      paymentUrl: null,
      paymentOrderId: null,
      showIframe: false,
    });
  }, []);

  const onPaymentSuccess = useCallback(() => {
    setState({
      isProcessing: false,
      paymentUrl: null,
      paymentOrderId: null,
      showIframe: false,
    });
    // Reload to refresh subscription status
    setTimeout(() => window.location.reload(), 1500);
  }, []);

  return {
    ...state,
    createPayment,
    closePayment,
    onPaymentSuccess,
  };
}
