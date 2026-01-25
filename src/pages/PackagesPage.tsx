import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { coffeePackages, drinkPackages, formatPrice } from '@/data/mockData';
import { Check, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const tabs = [
  { id: 'coffee', label: 'Кофе' },
  { id: 'drinks', label: 'Напитки' },
];

export default function PackagesPage() {
  const [activeTab, setActiveTab] = useState('coffee');
  
  const packages = activeTab === 'coffee' ? coffeePackages : drinkPackages;
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-black text-foreground mb-4">Пакеты</h1>
          
          <TabSwitcher
            tabs={tabs}
            activeTab={activeTab}
            onChange={setActiveTab}
            className="mb-6"
          />
          
          <div className="space-y-4">
            {packages.map((pkg, index) => (
              <Link
                key={pkg.id}
                to={`/packages/${pkg.id}`}
                className="block animate-slide-up"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="card-interactive relative overflow-hidden">
                  {pkg.badge && (
                    <div className="absolute top-3 right-3">
                      <span className="badge-accent flex items-center gap-1">
                        <Sparkles size={12} />
                        {pkg.badge}
                      </span>
                    </div>
                  )}
                  
                  <div className="pr-20">
                    <h3 className="text-xl font-bold text-foreground mb-1">
                      {pkg.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {pkg.description}
                    </p>
                    
                    {'drinks' in pkg && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {(pkg as any).drinks.slice(0, 3).map((drink: string) => (
                          <span 
                            key={drink} 
                            className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-md"
                          >
                            {drink}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-foreground">
                        {formatPrice(pkg.price)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        /{pkg.period}
                      </span>
                      {pkg.originalPrice && (
                        <span className="text-sm text-muted-foreground line-through">
                          {formatPrice(pkg.originalPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <button className="btn-primary w-full text-sm">
                      Оформить
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
