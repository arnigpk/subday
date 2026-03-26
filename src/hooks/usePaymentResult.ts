import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export function usePaymentResult() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isVerifying, setIsVerifying] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    
    if (paymentStatus === 'success' && !isVerifying) {
      setIsVerifying(true);
      
      // Remove payment param from URL immediately
      searchParams.delete('payment');
      setSearchParams(searchParams, { replace: true });
      
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
        
        // Invalidate all queries to refresh data instantly
        queryClient.invalidateQueries();
      }).finally(() => {
        setIsVerifying(false);
      });
    } else if (paymentStatus === 'failed') {
      toast.error('Оплата не прошла', {
        duration: 5000,
        description: 'Попробуйте ещё раз или выберите другой способ оплаты.',
      });
      
      searchParams.delete('payment');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isVerifying, queryClient]);
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
