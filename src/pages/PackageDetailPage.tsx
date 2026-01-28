import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, Info, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getPeriodText } from '@/utils/subscriptionDuration';

interface SubscriptionType {
  id: string;
  name: string;
  description: string | null;
  type: string;
  cups_count: number;
  price: number;
  duration_days: number;
  badge: string | null;
  features: string[] | null;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('ru-RU').format(price) + ' ₸';
};

export default function PackageDetailPage() {
  const { id } = useParams();
  const [subscription, setSubscription] = useState<SubscriptionType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchSubscription();
    }
  }, [id]);

  const fetchSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_types')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setSubscription(data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="safe-area-top flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!subscription) {
    return (
      <AppLayout>
        <div className="safe-area-top p-4">
          <Link to="/packages" className="flex items-center gap-2 text-muted-foreground mb-4">
            <ArrowLeft size={20} />
            Назад
          </Link>
          <p className="text-center text-muted-foreground">Подписка не найдена</p>
        </div>
      </AppLayout>
    );
  }

  const isCoffee = subscription.type === 'coffee';
  const period = getPeriodText(subscription.duration_days);
  
  // Use features from database or fallback to defaults
  const defaultFeatures = isCoffee
    ? [
        'Любой кофейный напиток',
        'Без ограничений по размеру',
        '1 напиток за визит',
        'Во всех партнёрских кофейнях',
      ]
    : [
        'Выбранная категория напитков',
        'Стандартный размер',
        '1 напиток за визит',
        'Во всех партнёрских кофейнях',
      ];
  
  const features = subscription.features && subscription.features.length > 0 
    ? subscription.features 
    : defaultFeatures;

  // Calculate original price for savings display
  const pricePerCup = isCoffee ? 1500 : 1200;
  const originalPrice = subscription.cups_count * pricePerCup;
  const savings = originalPrice - subscription.price;

  return (
    <AppLayout>
      <div className="safe-area-top">
        {/* Header */}
        <div className="px-4 py-4 flex items-center gap-3">
          <Link to="/packages" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeft size={20} className="text-foreground" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Детали подписки</h1>
        </div>

        {/* Content */}
        <div className="px-4 space-y-6">
          <div className="card-static animate-slide-up">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black text-foreground">{subscription.name}</h2>
                {subscription.description && (
                  <p className="text-muted-foreground">{subscription.description}</p>
                )}
              </div>
              {subscription.badge && (
                <span className="badge-accent">{subscription.badge}</span>
              )}
            </div>

            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-3xl font-black text-foreground">
                {formatPrice(subscription.price)}
              </span>
              <span className="text-muted-foreground">/ {period}</span>
            </div>

            {savings > 0 && (
              <div className="bg-accent/10 rounded-xl p-3 mb-4">
                <p className="text-sm text-accent font-semibold">
                  Экономия {formatPrice(savings)} в {period}
                </p>
              </div>
            )}
          </div>

          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">Что входит</h3>
            <div className="space-y-2">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-secondary rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                    <Check size={14} className="text-accent" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <div className="bg-secondary rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Info size={20} className="text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Как это работает</p>
                  <p className="text-xs text-muted-foreground">
                    После оформления получаешь {subscription.cups_count} напитков на {period}. 
                    Заходишь в любую партнёрскую кофейню, показываешь QR — и забираешь напиток. Всё просто.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pb-6 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <button className="btn-accent w-full text-lg">
              Оформить за {formatPrice(subscription.price)}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
