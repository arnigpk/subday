import { useState } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Megaphone, TrendingUp, Users, Target, Sparkles, CheckCircle2, Loader2, UserPlus, MapPin, Clock, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PartnerActiveAds } from '@/components/partner/PartnerActiveAds';
import { PartnerAdResults } from '@/components/partner/PartnerAdResults';

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
            <p className="text-xs text-muted-foreground">Привлечение гостей и отчёт по результату</p>
          </div>
        </div>

        {/* Главное отличие: результат считается в реальных гостях */}
        <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus size={18} className="text-accent" />
              Вы видите не показы, а гостей
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              subday знает не только, кто увидел рекламу, но и кто после неё пришёл в вашу кофейню
              и списал напиток. Поэтому в отчёте ниже — не абстрактный охват, а живые люди.
            </p>

            <div className="space-y-2">
              {[
                ['Новые гости', 'Сколько человек пришли к вам впервые — раньше их у вас не было'],
                ['Дошли до кофейни', 'Сколько всего увидевших рекламу дошли и списали напиток за 7 и 14 дней'],
                ['Срок до визита', 'Через сколько в среднем человек приходит после рекламы'],
              ].map(([title, text]) => (
                <div key={title} className="flex items-start gap-3 p-3 rounded-xl bg-secondary/50">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle2 size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Один человек считается один раз, даже если потом заходил многократно, — повторные
              приходы показаны отдельно. Показ засчитывается, только когда реклама реально была
              на экране, а не просто загрузилась.
            </p>
          </CardContent>
        </Card>

        {/* Кому показывать */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target size={18} className="text-primary" />
              Реклама идёт не всем подряд
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Мы настраиваем показ под вашу задачу, чтобы бюджет не уходил на тех, кто и так
              к вам ходит:
            </p>

            <div className="space-y-2">
              {[
                [<Users key="i" size={16} className="text-primary" />, 'Кто у вас ещё не был',
                 'Привлечение новых гостей — реклама не тратится на постоянных'],
                [<TrendingUp key="i" size={16} className="text-primary" />, 'Кто был, но давно не приходил',
                 'Возврат ушедших гостей — обычно самый отзывчивый сегмент'],
                [<MapPin key="i" size={16} className="text-primary" />, 'Кто ходит в соседние кофейни',
                 'Показ гостям выбранных заведений в вашем городе'],
                [<Clock key="i" size={16} className="text-primary" />, 'В нужные дни и часы',
                 'Например, только утром в будни — под утренний кофе'],
              ].map(([icon, title, text], i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-secondary/50">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{title as string}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{text as string}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Также доступен таргет по городу, тарифу подписки и отношению к ней —
              например, только на действующих подписчиков.
            </p>
          </CardContent>
        </Card>

        {/* Форматы и подбор креатива */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles size={18} className="text-accent" />
              Форматы размещения
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/50">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Megaphone size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Баннер</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    В разделе «Кофейни» — при выборе заведения, и на главной — при каждом заходе
                    в приложение. Можно разместить в одном месте или в обоих.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/50">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Target size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Пост в #subFlow</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Реклама внутри ленты #subFlow — соцсети subday для подписчиков. Выглядит
                    как обычный пост, с картинкой, текстом и ссылкой на вашу кофейню.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-secondary/50 p-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FlaskConical size={15} className="text-primary" />
                Подбор креатива
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Можно запустить два варианта рекламы одновременно и увидеть, какой приводит
                больше гостей. Каждый человек видит только один вариант, поэтому сравнение честное.
              </p>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Частоту показов мы ограничиваем, чтобы реклама не примелькалась: есть лимит на
              человека в день и общий потолок в приложении.
            </p>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center leading-relaxed px-2">
          Оставьте заявку — менеджер subday подберёт формат и настройки показа
          под вашу задачу и бюджет.
        </p>

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
        <PartnerAdResults shopId={shopId} />

        <PartnerActiveAds shopId={shopId} />
      </div>
    </PartnerLayout>
  );
}
