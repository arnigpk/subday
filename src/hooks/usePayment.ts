import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UsePaymentResult {
  isProcessing: boolean;
  paymentUrl: string | null;
  orderId: string | null;
  showPaymentFrame: boolean;
  setShowPaymentFrame: (show: boolean) => void;
  createPayment: (subscriptionTypeId: string) => Promise<void>;
}

export function usePayment(): UsePaymentResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [showPaymentFrame, setShowPaymentFrame] = useState(false);
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
        body: {
          subscription_type_id: subscriptionTypeId,
          return_path: returnPath,
        },
      });

      if (error) {
        console.error('Payment creation error:', error);
        toast.error('Ошибка создания платежа');
        return;
      }

      if (data?.payment_url) {
        setPaymentUrl(data.payment_url);
        setOrderId(data.order_id || null);
        setShowPaymentFrame(true);
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

  return {
    isProcessing,
    paymentUrl,
    orderId,
    showPaymentFrame,
    setShowPaymentFrame,
    createPayment,
  };
}
