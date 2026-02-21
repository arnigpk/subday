import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, Info, Loader2, CreditCard, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getPeriodText } from '@/utils/subscriptionDuration';
import { usePayment } from '@/hooks/usePayment';
import { Button } from '@/components/ui/button';
import { useActiveSubscription } from '@/hooks/useActiveSubscription';
import { getSubscriptionBadgeStyle } from '@/components/admin/SubscriptionBadgeEditor';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate, useAutoTranslateArray } from '@/hooks/useAutoTranslate';
import { useVibration } from '@/hooks/useVibration';

interface SubscriptionType {
  id: string;
  name: string;
  description: string | null;
  type: string;
  cups_count: number;
  price: number;
  duration_days: number;
  badge: string | null;
  badge_color: string | null;
  features: string[] | null;
  benefit: number | null;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('ru-RU').format(price) + ' ₸';
};

export default function PackageDetailPage() {
  const { id } = useParams();
  const [subscription, setSubscription] = useState<SubscriptionType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isProcessing, createPayment } = usePayment();
  const { activeSubscriptionTypeIds } = useActiveSubscription();
  const { t, language } = useLanguage();
  const { vibrateSuccess } = useVibration();

  useEffect(() => {
    if (id) {
      fetchSubscription();
    }
  }, [id]);

  const handlePurchase = () => {
    if (subscription) {
      vibrateSuccess();
      createPayment(subscription.id);
    }
  };

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

  const isCoffee = subscription?.type === 'coffee';
  const defaultFeatures = isCoffee
    ? [
        'Любой кофейный напиток',
        'Без ограничений по размеру',
        '1 напиток за визит',
        'Во всех партнёрских кофейнях',
      ]
    : [
        'Выбранная категория ланчей',
        'Стандартный размер',
        '1 ланч за визит',
        'Во всех партнёрских кофейнях',
      ];

  const rawFeatures = subscription?.features && subscription.features.length > 0
    ? subscription.features
    : defaultFeatures;

  // Auto-translate dynamic content
  const translatedName = useAutoTranslate(subscription?.name);
  const translatedDescription = useAutoTranslate(subscription?.description);
  const translatedBadge = subscription?.badge; // badges stay in original language
  const translatedFeatures = useAutoTranslateArray(rawFeatures);

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
            {t('packageDetail.back')}
          </Link>
          <p className="text-center text-muted-foreground">{t('packageDetail.notFound')}</p>
        </div>
      </AppLayout>
    );
  }

  const period = getPeriodText(subscription.duration_days, language);
  const isActive = activeSubscriptionTypeIds.includes(subscription.id);

  const formatBenefit = (benefit: number) => {
    return new Intl.NumberFormat('ru-RU').format(benefit);
  };

  return (
    <AppLayout>
      <div className="safe-area-top">
        {/* Header */}
        <div className="px-4 py-4 flex items-center gap-3">
          <Link to="/packages" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeft size={20} className="text-foreground" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">{t('packageDetail.title')}</h1>
        </div>

        {/* Content */}
        <div className="px-4 space-y-6">
          <div className="card-static animate-slide-up">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black text-foreground">{translatedName}</h2>
                {subscription.description && (
                  <p className="text-muted-foreground">{translatedDescription}</p>
                )}
              </div>
              {subscription.badge && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg ${getSubscriptionBadgeStyle(subscription.badge, subscription.badge_color)}`}>
                  <Sparkles size={12} />
                  {translatedBadge}
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-3xl font-black text-foreground">
                {formatPrice(subscription.price)}
              </span>
              <span className="text-muted-foreground">/ {period}</span>
            </div>

            {subscription.benefit && subscription.benefit > 0 && (
              <div className="bg-accent/10 rounded-xl p-3 mb-4">
                <p className="text-sm text-accent font-semibold">
                  {t('packages.benefit')} {formatBenefit(subscription.benefit)} ₸
                </p>
              </div>
            )}
          </div>

          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">{t('packageDetail.whatsIncluded')}</h3>
            <div className="space-y-2">
              {translatedFeatures.map((feature, index) => (
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
                  <p className="text-sm font-medium text-foreground mb-1">{t('packageDetail.howItWorks')}</p>
                  <p className="text-xs text-muted-foreground">
                    {language === 'kz' 
                      ? `Рәсімдегеннен кейін ${period}ге ${subscription.cups_count} сусын аласыз. Кез келген серіктес кофеханаға кіріп, QR көрсетіп — сусынды аласыз. Бәрі оңай.`
                      : `${t('packageDetail.howItWorksText')} ${subscription.cups_count} ${t('packageDetail.drinksFor')} ${period}. ${t('packageDetail.howItWorksText2')}`
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pb-6 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            {isActive ? (
              <div className="w-full h-14 flex items-center justify-center text-lg font-bold bg-muted text-muted-foreground rounded-xl cursor-not-allowed">
                {t('packages.yourActive')}
              </div>
            ) : (
              <Button 
                onClick={handlePurchase}
                disabled={isProcessing}
                className="w-full h-14 text-lg font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {t('packageDetail.creating')}
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    {t('packageDetail.subscribeFor')} {formatPrice(subscription.price)}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
