import { Link } from 'react-router-dom';
import { History, ChevronRight } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useLanguage } from '@/contexts/LanguageContext';

export function PurchaseHistorySection() {
  const { redemptions, completedPreordersCount } = useUserStatsContext();
  const { t } = useLanguage();
  const total = redemptions.length + completedPreordersCount;

  return (
    <Link to="/history" className="card-interactive flex items-center gap-3 mb-3">
      <History size={20} className="text-muted-foreground" />
      <span className="flex-1 font-medium text-foreground">{t('history.purchases')}</span>
      {total > 0 && <span className="text-sm text-muted-foreground">{total}</span>}
      <ChevronRight size={18} className="text-muted-foreground" />
    </Link>
  );
}
