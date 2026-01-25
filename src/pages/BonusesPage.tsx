import { AppLayout } from '@/components/layout/AppLayout';
import { Gift, Sparkles, Coffee, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';

const bonusRewards = [
  { points: 1000, reward: 'Бесплатный кофе', icon: Coffee, available: true },
  { points: 2500, reward: 'Апгрейд размера', icon: Sparkles, available: false },
  { points: 5000, reward: 'Бесплатная неделя', icon: Trophy, available: false },
];

export default function BonusesPage() {
  const { stats, isLoading } = useUserStatsContext();
  
  if (isLoading) {
    return (
      <AppLayout>
        <div className="safe-area-top">
          <div className="px-4 py-4 flex items-center gap-3">
            <Link to="/" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <ArrowLeft size={20} className="text-foreground" />
            </Link>
            <h1 className="text-xl font-bold text-foreground">Бонусы</h1>
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
        {/* Header */}
        <div className="px-4 py-4 flex items-center gap-3">
          <Link to="/" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeft size={20} className="text-foreground" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Бонусы</h1>
        </div>
        
        <div className="px-4 space-y-6">
          {/* Points balance */}
          <div className="card-static text-center animate-slide-up bg-gradient-to-br from-yellow-500/10 to-orange-500/10">
            <div className="w-20 h-20 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
              <Gift size={40} className="text-yellow-500" />
            </div>
            
            <p className="text-4xl font-black text-foreground mb-1">{stats.bonusPoints.toLocaleString()}</p>
            <p className="text-muted-foreground">бонусов</p>
          </div>
          
          {/* How to earn */}
          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">Как заработать</h3>
            <div className="card-static space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">☕</span>
                <div className="flex-1">
                  <p className="font-medium text-foreground">Забирай напитки</p>
                  <p className="text-xs text-muted-foreground">+10 бонусов за каждый напиток</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl">🔥</span>
                <div className="flex-1">
                  <p className="font-medium text-foreground">Держи серию</p>
                  <p className="text-xs text-muted-foreground">+5 бонусов за каждый день подряд</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl">👥</span>
                <div className="flex-1">
                  <p className="font-medium text-foreground">Приглашай друзей</p>
                  <p className="text-xs text-muted-foreground">+50 бонусов за каждого друга</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Rewards */}
          <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">Обменять бонусы</h3>
            <div className="space-y-3">
              {bonusRewards.map((reward) => {
                const Icon = reward.icon;
                const canRedeem = stats.bonusPoints >= reward.points;
                
                return (
                  <div 
                    key={reward.points} 
                    className={`card-interactive flex items-center gap-4 ${!canRedeem ? 'opacity-60' : ''}`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon size={24} className="text-primary" />
                    </div>
                    
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{reward.reward}</p>
                      <p className="text-sm text-muted-foreground">{reward.points.toLocaleString()} бонусов</p>
                    </div>
                    
                    {canRedeem ? (
                      <button className="btn-primary text-sm py-2 px-4">Забрать</button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Ещё {(reward.points - stats.bonusPoints).toLocaleString()}
                      </span>
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
