import { AppLayout } from '@/components/layout/AppLayout';
import { userData, streakRewards } from '@/data/mockData';
import { Flame, Gift, Lock, Check, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function StreaksPage() {
  const progress = (userData.currentStreak / 30) * 100;
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        {/* Header */}
        <div className="px-4 py-4 flex items-center gap-3">
          <Link to="/" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeft size={20} className="text-foreground" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Стрики</h1>
        </div>
        
        <div className="px-4 space-y-6">
          {/* Current streak */}
          <div className="card-static text-center animate-slide-up">
            <div className="w-24 h-24 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
              <Flame size={48} className="text-orange-500" />
            </div>
            
            <p className="text-5xl font-black text-foreground mb-1">{userData.currentStreak}</p>
            <p className="text-muted-foreground">дней подряд</p>
            
            <div className="mt-4 flex items-center justify-center gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Максимум</p>
                <p className="font-bold text-foreground">{userData.maxStreak} дней</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <p className="text-muted-foreground">Всего</p>
                <p className="font-bold text-foreground">{userData.totalCups} чашек</p>
              </div>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">До 30 дней</p>
              <p className="text-sm font-bold text-foreground">{userData.currentStreak}/30</p>
            </div>
            <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          
          {/* Rewards */}
          <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">Награды</h3>
            <div className="space-y-3">
              {streakRewards.map((reward, index) => (
                <div 
                  key={reward.days} 
                  className={`card-static flex items-center gap-4 ${
                    reward.unlocked ? 'border-2 border-accent' : 'opacity-60'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    reward.unlocked ? 'bg-accent/20' : 'bg-secondary'
                  }`}>
                    {reward.unlocked ? (
                      <Check size={24} className="text-accent" />
                    ) : (
                      <Lock size={20} className="text-muted-foreground" />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{reward.days} дней</p>
                    <p className="text-sm text-muted-foreground">{reward.reward}</p>
                  </div>
                  
                  {reward.unlocked && (
                    <span className="badge-accent">Получено</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
