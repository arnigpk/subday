import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UsePaymentResult {
  isProcessing: boolean;
  paymentUrl: string | null;
  isPaymentOpen: boolean;
  createPayment: (subscriptionTypeId: string) => Promise<void>;
  closePayment: () => void;
}

export function usePayment(): UsePaymentResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const createPayment = async (subscriptionTypeId: string) => {
    setIsProcessing(true);
    
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
        setPaymentUrl(data.payment_url);
        setIsPaymentOpen(true);
      } else {
        console.error('No payment URL in response:', data);
        toast.error('Ошибка: не получена ссылка на оплату');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Произошла ошибка при создании платежа');
    } finally {
      setIsProcessing(false);
    }
  };

  const closePayment = () => {
    setIsPaymentOpen(false);
    setPaymentUrl(null);
  };

  return {
    isProcessing,
    paymentUrl,
    isPaymentOpen,
    createPayment,
    closePayment,
  };
}
