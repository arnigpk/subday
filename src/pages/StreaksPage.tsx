import { AppLayout } from '@/components/layout/AppLayout';
import { Flame, Lock, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function StreaksPage() {
  const { stats, isLoading } = useUserStatsContext();
  const { t, language } = useLanguage();
  
  const progress = Math.min((stats.currentStreak / 30) * 100, 100);
  
  const getStreakRewards = (currentStreak: number) => [
    { days: 3, reward: t('streaks.reward3'), unlocked: currentStreak >= 3 },
    { days: 7, reward: t('streaks.reward7'), unlocked: currentStreak >= 7 },
    { days: 14, reward: t('streaks.reward14'), unlocked: currentStreak >= 14 },
    { days: 30, reward: t('streaks.reward30'), unlocked: currentStreak >= 30 },
  ];
  
  const streakRewards = getStreakRewards(stats.currentStreak);
  
  if (isLoading) {
    return (
      <AppLayout>
        <div className="safe-area-top">
          <div className="px-4 py-4 flex items-center gap-3">
            <Link to="/" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center"><ArrowLeft size={20} className="text-foreground" /></Link>
            <h1 className="text-xl font-bold text-foreground">{t('streaks.title')}</h1>
          </div>
          <div className="px-4">
            <div className="card-static animate-pulse">
              <div className="w-24 h-24 rounded-full bg-muted mx-auto mb-4" />
              <div className="h-12 w-16 bg-muted rounded mx-auto mb-2" />
              <div className="h-4 w-24 bg-muted rounded mx-auto" />
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
          <h1 className="text-xl font-bold text-foreground">{t('streaks.title')}</h1>
        </div>
        
        <div className="px-4 space-y-6">
          <div className="card-static text-center animate-slide-up">
            <div className="w-24 h-24 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
              <Flame size={48} className="text-orange-500" />
            </div>
            <p className="text-5xl font-black text-foreground mb-1">{stats.totalCups}</p>
            <p className="text-muted-foreground">{t('streaks.drunk')}</p>
            <div className="mt-4 flex items-center justify-center gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">{t('streaks.daysInRow')}</p>
                <p className="font-bold text-foreground">{stats.currentStreak}</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <p className="text-muted-foreground">{t('streaks.maximum')}</p>
                <p className="font-bold text-foreground">{stats.maxStreak} {t('common.days')}</p>
              </div>
            </div>
          </div>
          
          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{t('streaks.to30')}</p>
              <p className="text-sm font-bold text-foreground">{stats.currentStreak}/30</p>
            </div>
            <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
          
          <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">{t('streaks.rewards')}</h3>
            <div className="space-y-3">
              {streakRewards.map((reward) => (
                <div key={reward.days} className={`card-static flex items-center gap-4 ${reward.unlocked ? 'border-2 border-accent' : 'opacity-60'}`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${reward.unlocked ? 'bg-accent/20' : 'bg-secondary'}`}>
                    {reward.unlocked ? <Check size={24} className="text-accent" /> : <Lock size={20} className="text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{reward.days} {t('common.days')}</p>
                    <p className="text-sm text-muted-foreground">{reward.reward}</p>
                  </div>
                  {reward.unlocked && <span className="badge-accent">{t('streaks.received')}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
