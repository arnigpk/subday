import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, Pencil, Loader2, Eye, EyeOff, MousePointerClick, Heart, MessageCircle } from 'lucide-react';
import { getCountryFlag } from '@/utils/countries';

const LINK_TYPES = [
  { value: 'shop', label: 'Кофейня' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'external', label: 'Внешняя ссылка' },
];

interface SubFlowAd {
  id: string;
  title: string | null;
  content: string;
  image_url: string | null;
  link_type: string;
  link_value: string | null;
  shop_id: string | null;
  shop_name: string | null;
  frequency: number;
  daily_limit: number;
  is_active: boolean;
  created_at: string;
  starts_at?: string | null;
  ends_at?: string | null;
}

interface AdAnalytics {
  [adId: string]: { views: number; clicks: number; reactions: number; comments: number };
}

interface SubFlowAdsListProps {
  ads: SubFlowAd[];
  analytics: AdAnalytics;
  isLoading: boolean;
  onEdit?: (ad: SubFlowAd) => void;
  onDelete?: (id: string) => void;
  onToggleActive?: (ad: SubFlowAd) => void;
  formatDate: (d: string) => string;
}

export function SubFlowAdsList({ ads, analytics, isLoading, onEdit, onDelete, onToggleActive, formatDate }: SubFlowAdsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Рекламные посты ({ads.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : ads.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Нет рекламных постов</p>
        ) : (
          <div className="space-y-3">
            {ads.map(ad => {
              const stats = analytics[ad.id] || { views: 0, clicks: 0, reactions: 0, comments: 0 };
              return (
                <div key={ad.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-secondary/30">
                  {ad.image_url && (
                    <img src={ad.image_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {ad.title && <p className="text-xs font-bold text-accent">{ad.title}</p>}
                    <p className="text-sm font-medium text-foreground line-clamp-2">{ad.content}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {LINK_TYPES.find(lt => lt.value === ad.link_type)?.label || ad.link_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Каждые {ad.frequency} постов</span>
                      {ad.daily_limit > 0 && (
                        <span className="text-xs text-muted-foreground">• {ad.daily_limit}x/день</span>
                      )}
                      <Badge className={ad.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {ad.is_active ? 'Активна' : 'Выкл'}
                      </Badge>
                      {(ad as any).country && (
                        <Badge variant="outline" className="text-xs">
                          {getCountryFlag((ad as any).country)} {(ad as any).city || 'Все города'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Eye size={12} /> {stats.views}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MousePointerClick size={12} /> {stats.clicks}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Heart size={12} /> {stats.reactions}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MessageCircle size={12} /> {stats.comments}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        CTR: {stats.views > 0 ? ((stats.clicks / stats.views) * 100).toFixed(1) : '0'}%
                      </span>
                    </div>
                    {(ad.starts_at || ad.ends_at) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        📅 {ad.starts_at ? formatDate(ad.starts_at) : '...'} — {ad.ends_at ? formatDate(ad.ends_at) : '...'}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{formatDate(ad.created_at)}</p>
                  </div>
                  {(onToggleActive || onEdit || onDelete) && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {onToggleActive && (
                        <button onClick={() => onToggleActive(ad)} className="p-2 rounded-full hover:bg-muted transition-colors">
                          {ad.is_active ? <EyeOff size={16} className="text-muted-foreground" /> : <Eye size={16} className="text-muted-foreground" />}
                        </button>
                      )}
                      {onEdit && (
                        <button onClick={() => onEdit(ad)} className="p-2 rounded-full hover:bg-muted transition-colors">
                          <Pencil size={16} className="text-muted-foreground" />
                        </button>
                      )}
                      {onDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="p-2 rounded-full hover:bg-destructive/10 transition-colors">
                              <Trash2 size={16} className="text-destructive" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить рекламу?</AlertDialogTitle>
                              <AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDelete(ad.id)}>Удалить</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
