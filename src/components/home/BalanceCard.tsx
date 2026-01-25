import { useState } from 'react';
import { Coffee, Droplets } from 'lucide-react';
import { TabSwitcher } from '../ui/TabSwitcher';
import { userData } from '@/data/mockData';

const tabs = [
  { id: 'coffee', label: 'Кофе' },
  { id: 'drinks', label: 'Напитки' },
];

export function BalanceCard() {
  const [activeTab, setActiveTab] = useState('coffee');
  
  const isCoffee = activeTab === 'coffee';
  const remaining = isCoffee ? userData.coffeeRemaining : userData.drinksRemaining;
  const total = isCoffee ? userData.coffeeTotal : userData.drinksTotal;
  const percentage = (remaining / total) * 100;
  
  return (
    <div className="card-static animate-slide-up">
      <TabSwitcher
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        className="mb-4"
      />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
            isCoffee ? 'bg-primary/10' : 'bg-accent/10'
          }`}>
            {isCoffee ? (
              <Coffee size={32} className="text-primary" />
            ) : (
              <Droplets size={32} className="text-accent" />
            )}
          </div>
          
          <div>
            <p className="text-muted-foreground text-sm font-medium">Осталось</p>
            <p className="text-4xl font-black text-foreground">
              {remaining}
              <span className="text-lg text-muted-foreground font-medium ml-1">
                из {total}
              </span>
            </p>
          </div>
        </div>
        
        {/* Progress ring */}
        <div className="relative w-16 h-16">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-secondary"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className={isCoffee ? 'text-primary' : 'text-accent'}
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${percentage}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-foreground">
              {Math.round(percentage)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
