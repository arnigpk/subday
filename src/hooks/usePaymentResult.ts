import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function usePaymentResult() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    
    if (paymentStatus === 'success' && !isVerifying) {
      setIsVerifying(true);
      
      // Verify and activate subscription
      verifyPayment().then((result) => {
        if (result.success) {
          toast.success('🎉 Подписка успешно активирована!', {
            duration: 5000,
            description: 'Спасибо за покупку! Наслаждайтесь кофе.',
          });
        } else {
          toast.info('Платёж обрабатывается...', {
            duration: 5000,
            description: 'Подписка будет активирована в течение нескольких минут.',
          });
        }
        
        // Remove payment param from URL
        searchParams.delete('payment');
        setSearchParams(searchParams, { replace: true });
        
        // Refresh the page data
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }).finally(() => {
        setIsVerifying(false);
      });
    } else if (paymentStatus === 'failed') {
      toast.error('Оплата не прошла', {
        duration: 5000,
        description: 'Попробуйте ещё раз или выберите другой способ оплаты.',
      });
      
      // Remove payment param from URL
      searchParams.delete('payment');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isVerifying]);
}

async function verifyPayment(): Promise<{ success: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-payment');
    
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
