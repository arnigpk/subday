import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function usePaymentResult() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isVerifying, setIsVerifying] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

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
