import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PaymentOptions {
  subscriptionTypeId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function usePayment() {
  const [isLoading, setIsLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  const createPayment = async ({ subscriptionTypeId, onSuccess, onError }: PaymentOptions) => {
    setIsLoading(true);
    setPaymentUrl(null);

    try {
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { subscriptionTypeId },
      });

      if (error) {
        console.error('Payment error:', error);
        const errorMessage = 'Не удалось создать платёж';
        toast.error(errorMessage);
        onError?.(errorMessage);
        return null;
      }

      if (!data?.success || !data?.paymentUrl) {
        console.error('Invalid payment response:', data);
        const errorMessage = data?.error || 'Ошибка создания платежа';
        toast.error(errorMessage);
        onError?.(errorMessage);
        return null;
      }

      setPaymentUrl(data.paymentUrl);
      onSuccess?.();
      return data.paymentUrl;

    } catch (err) {
      console.error('Payment creation failed:', err);
      const errorMessage = 'Произошла ошибка';
      toast.error(errorMessage);
      onError?.(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const redirectToPayment = async (options: PaymentOptions) => {
    const url = await createPayment(options);
    if (url) {
      // Open in same window as requested
      window.location.href = url;
    }
  };

  return {
    isLoading,
    paymentUrl,
    createPayment,
    redirectToPayment,
  };
}
