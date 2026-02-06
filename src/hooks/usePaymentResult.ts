import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function usePaymentResult() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    
    if (paymentStatus === 'success') {
      toast.success('🎉 Подписка успешно активирована!', {
        duration: 5000,
        description: 'Спасибо за покупку! Наслаждайтесь кофе.',
      });
      
      // Remove payment param from URL
      searchParams.delete('payment');
      setSearchParams(searchParams, { replace: true });
      
      // Refresh the page data
      window.location.reload();
    } else if (paymentStatus === 'failed') {
      toast.error('Оплата не прошла', {
        duration: 5000,
        description: 'Попробуйте ещё раз или выберите другой способ оплаты.',
      });
      
      // Remove payment param from URL
      searchParams.delete('payment');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
}
