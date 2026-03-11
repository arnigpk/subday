import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Megaphone, ExternalLink } from 'lucide-react';
import { openWithDeepLink } from '@/utils/deepLinks';

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

  const handleClick = () => {
    if (ad.link_type === 'shop' && ad.link_value) {
      navigate(`/shops/${ad.link_value}`);
    } else if (ad.link_value) {
      openWithDeepLink(ad.link_value);
    }
  };

  return (
    <div className="card-static animate-slide-up border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
      {/* Ad badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center">
            <Megaphone size={16} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              {ad.shop_name || 'subday'}
            </p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent/30 text-accent font-semibold">
              реклама
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <p className="text-foreground leading-relaxed mb-3 whitespace-pre-wrap">{ad.content}</p>

      {/* Image */}
      {ad.image_url && (
        <div className="mb-3 -mx-4 overflow-hidden">
          <img
            src={ad.image_url}
            alt="Реклама"
            className="w-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* CTA */}
      {ad.link_value && (
        <button
          onClick={handleClick}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent/10 text-accent font-semibold text-sm hover:bg-accent/20 transition-colors"
        >
          <ExternalLink size={14} />
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
