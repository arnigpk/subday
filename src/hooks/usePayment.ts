import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UsePaymentResult {
  isProcessing: boolean;
  createPayment: (subscriptionTypeId: string) => Promise<void>;
}

export function usePayment(): UsePaymentResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const location = useLocation();

  const createPayment = async (subscriptionTypeId: string) => {
    setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Необходимо авторизоваться');
        return;
      }

      const returnPath = `${location.pathname}${location.search}${location.hash}`;
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { subscription_type_id: subscriptionTypeId, return_path: returnPath },
      });

      if (error) {
        console.error('Payment creation error:', error);
        toast.error('Ошибка создания платежа');
        return;
      }

      if (data?.payment_url) {
        window.location.href = data.payment_url;
      } else {
        toast.error('Ошибка: не получена ссылка на оплату');
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
