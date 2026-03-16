import { useState } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Megaphone, TrendingUp, Users, Target, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PartnerActiveAds } from '@/components/partner/PartnerActiveAds';

export default function PartnerAdvertisingPage() {
  const { shopName, shopId } = usePartnerAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmitRequest = async () => {
    if (submitted) return;
    setIsSubmitting(true);

    try {
      const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Aqtau' });

      await supabase.functions.invoke('partner-ad-request', {
        body: {
          shopName: shopName || 'Не указано',
          time: now,
        },
      });

      setSubmitted(true);
      toast.success('Заявка принята! В ближайшее время с вами свяжется менеджер subday!');
    } catch (error) {
      console.error('Error submitting ad request:', error);
      toast.error('Ошибка при отправке заявки');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PartnerLayout>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center">
            <Megaphone size={24} className="text-accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Реклама</h2>
            <p className="text-xs text-muted-foreground">Продвижение вашей кофейни</p>
          </div>
        </div>

        {/* Main ad block */}
        <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles size={18} className="text-accent" />
              Реклама в приложении subday
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Разместите рекламу вашей кофейни в приложении и привлеките новых постоянных клиентов! 
              Ваш баннер увидят тысячи пользователей subday.
            </p>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/50">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <TrendingUp size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Раздел «Кофейни»</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ваш рекламный баннер в верхней части раздела «Кофейни» — первое, что видят пользователи при выборе заведения.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/50">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Users size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Главная страница</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Баннер в нижней части главной страницы — охватывает всю аудиторию приложения при каждом визите.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Увеличьте узнаваемость вашей кофейни и привлекайте новых гостей каждый день благодаря рекламе в subday!
            </p>
          </CardContent>
        </Card>

        {/* SubFlow targeted ad */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target size={18} className="text-primary" />
              Таргетированная реклама в #subFlow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">#subFlow</span> — это эксклюзивная социальная сеть внутри subday, 
              доступная только пользователям с активной подпиской. Это ваша самая лояльная и платёжеспособная аудитория!
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-secondary/50 text-center">
                <p className="text-lg font-bold text-foreground">🎯</p>
                <p className="text-xs text-muted-foreground mt-1">Точное попадание в ЦА</p>
              </div>
              <div className="p-2.5 rounded-xl bg-secondary/50 text-center">
                <p className="text-lg font-bold text-foreground">💎</p>
                <p className="text-xs text-muted-foreground mt-1">Премиум аудитория</p>
              </div>
              <div className="p-2.5 rounded-xl bg-secondary/50 text-center">
                <p className="text-lg font-bold text-foreground">📈</p>
                <p className="text-xs text-muted-foreground mt-1">Рост постоянных клиентов</p>
              </div>
              <div className="p-2.5 rounded-xl bg-secondary/50 text-center">
                <p className="text-lg font-bold text-foreground">☕</p>
                <p className="text-xs text-muted-foreground mt-1">Увеличение дохода</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Увеличьте свой доход и приток постоянных клиентов с рекламой в subday. 
              Мы подберём оптимальный формат продвижения именно для вашей кофейни!
            </p>
          </CardContent>
        </Card>

        {/* CTA */}
        <Button
          onClick={handleSubmitRequest}
          disabled={isSubmitting || submitted}
          className={`w-full h-12 text-base font-semibold ${submitted ? 'bg-green-600 hover:bg-green-600' : 'btn-accent'}`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Отправка...
            </>
          ) : submitted ? (
            <>
              <CheckCircle2 className="w-5 h-5 mr-2" />
              Заявка отправлена
            </>
          ) : (
            <>
              <Megaphone className="w-5 h-5 mr-2" />
              Оставить заявку
            </>
          )}
        </Button>

        {submitted && (
          <p className="text-xs text-center text-muted-foreground animate-fade-in">
            В ближайшее время с вами свяжется менеджер subday
          </p>
        )}

        {/* Active Ads Section */}
        <PartnerActiveAds shopId={shopId} />
      </div>
    </PartnerLayout>
  );
}
