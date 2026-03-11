import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Megaphone, ExternalLink } from 'lucide-react';
import { openWithDeepLink } from '@/utils/deepLinks';
import { supabase } from '@/integrations/supabase/client';

interface SubFlowAd {
  id: string;
  content: string;
  image_url: string | null;
  link_type: string;
  link_value: string | null;
  shop_id: string | null;
  shop_name: string | null;
}

interface SubFlowAdPostProps {
  ad: SubFlowAd;
}

export function SubFlowAdPost({ ad }: SubFlowAdPostProps) {
  const navigate = useNavigate();
  const viewTracked = useRef(false);

  // Track view on mount
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from('subflow_ad_events').insert({
        ad_id: ad.id,
        user_id: data.user.id,
        event_type: 'view',
      }).then(({ error }) => {
        if (error) console.error('Ad view track error:', error);
      });
    });
  }, [ad.id]);

  const trackClick = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { error } = await supabase.from('subflow_ad_events').insert({
        ad_id: ad.id,
        user_id: data.user.id,
        event_type: 'click',
      });
      if (error) console.error('Ad click track error:', error);
    }
  };

  const handleClick = async () => {
    await trackClick();
    if (ad.link_type === 'shop' && ad.link_value) {
      navigate(`/shops/${ad.link_value}`);
    } else if (ad.link_value) {
      openWithDeepLink(ad.link_value);
    }
  };

  return (
    <div className="card-static animate-slide-up border border-accent/30 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shadow-sm">
            <Megaphone size={18} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground tracking-tight">
              {ad.shop_name || 'subday'}
            </p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent/40 text-accent font-bold uppercase tracking-wider">
              реклама
            </Badge>
          </div>
        </div>
      </div>

      <p className="text-[15px] text-foreground leading-relaxed mb-3 whitespace-pre-wrap font-medium">{ad.content}</p>

      {ad.image_url && (
        <div className="mb-3 -mx-4 overflow-hidden">
          <img src={ad.image_url} alt="Реклама" className="w-full object-cover" loading="lazy" />
        </div>
      )}

      {ad.link_value && (
        <button
          onClick={handleClick}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent text-accent-foreground font-bold text-sm hover:bg-accent/90 active:scale-[0.98] transition-all shadow-sm"
        >
          <ExternalLink size={15} />
          {ad.link_type === 'shop' ? 'Перейти в кофейню' :
           ad.link_type === 'instagram' ? 'Открыть Instagram' :
           ad.link_type === 'whatsapp' ? 'Написать в WhatsApp' :
           ad.link_type === 'telegram' ? 'Открыть Telegram' :
           'Подробнее'}
        </button>
      )}
    </div>
  );
}
