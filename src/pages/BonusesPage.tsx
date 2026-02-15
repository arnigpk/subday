import { AppLayout } from '@/components/layout/AppLayout';
import { Gift, Sparkles, Coffee, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function BonusesPage() {
  const { stats, isLoading } = useUserStatsContext();
  const { t } = useLanguage();

  const bonusRewards = [
    { points: 1000, reward: t('bonuses.freeCoffee'), icon: Coffee, available: true },
    { points: 2500, reward: t('bonuses.sizeUpgrade'), icon: Sparkles, available: false },
    { points: 5000, reward: t('bonuses.freeWeek'), icon: Trophy, available: false },
  ];
  
  if (isLoading) {
    return (
      <AppLayout>
        <div className="safe-area-top">
          <div className="px-4 py-4 flex items-center gap-3">
            <Link to="/" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center"><ArrowLeft size={20} className="text-foreground" /></Link>
            <h1 className="text-xl font-bold text-foreground">{t('bonuses.title')}</h1>
          </div>
          <div className="px-4">
            <div className="card-static animate-pulse text-center">
              <div className="w-20 h-20 rounded-full bg-muted mx-auto mb-4" />
              <div className="h-10 w-24 bg-muted rounded mx-auto mb-2" />
              <div className="h-4 w-32 bg-muted rounded mx-auto" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4 flex items-center gap-3">
          <Link to="/" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center"><ArrowLeft size={20} className="text-foreground" /></Link>
          <h1 className="text-xl font-bold text-foreground">{t('bonuses.title')}</h1>
        </div>
        
        <div className="px-4 space-y-6">
          <div className="card-static text-center animate-slide-up bg-gradient-to-br from-yellow-500/10 to-orange-500/10">
            <div className="w-20 h-20 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
              <Gift size={40} className="text-yellow-500" />
            </div>
            <p className="text-4xl font-black text-foreground mb-1">{stats.bonusPoints.toLocaleString()}</p>
            <p className="text-muted-foreground">{t('bonuses.points')}</p>
          </div>
          
          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">{t('bonuses.howToEarn')}</h3>
            <div className="card-static space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">☕</span>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{t('bonuses.getDrinks')}</p>
                  <p className="text-xs text-muted-foreground">{t('bonuses.getDrinksDesc')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl">🔥</span>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{t('bonuses.keepStreak')}</p>
                  <p className="text-xs text-muted-foreground">{t('bonuses.keepStreakDesc')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl">👥</span>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{t('bonuses.inviteFriends')}</p>
                  <p className="text-xs text-muted-foreground">{t('bonuses.inviteFriendsDesc')}</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">{t('bonuses.exchange')}</h3>
            <div className="space-y-3">
              {bonusRewards.map((reward) => {
                const Icon = reward.icon;
                const canRedeem = stats.bonusPoints >= reward.points;
                return (
                  <div key={reward.points} className={`card-interactive flex items-center gap-4 ${!canRedeem ? 'opacity-60' : ''}`}>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><Icon size={24} className="text-primary" /></div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{reward.reward}</p>
                      <p className="text-sm text-muted-foreground">{reward.points.toLocaleString()} {t('bonuses.points')}</p>
                    </div>
                    {canRedeem ? (
                      <button className="btn-primary text-sm py-2 px-4">{t('bonuses.claim')}</button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('bonuses.more')} {(reward.points - stats.bonusPoints).toLocaleString()}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
