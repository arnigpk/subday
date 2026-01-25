import { AppLayout } from '@/components/layout/AppLayout';
import { coffeePackages, drinkPackages, formatPrice } from '@/data/mockData';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, Info } from 'lucide-react';

export default function PackageDetailPage() {
  const { id } = useParams();
  
  const allPackages = [...coffeePackages, ...drinkPackages];
  const pkg = allPackages.find(p => p.id === id);
  
  if (!pkg) {
    return (
      <AppLayout>
        <div className="safe-area-top p-4">
          <p className="text-center text-muted-foreground">Пакет не найден</p>
        </div>
      </AppLayout>
    );
  }
  
  const isCoffee = pkg.type === 'coffee';
  const features = isCoffee
    ? [
        'Любой кофейный напиток',
        'Без ограничений по размеру',
        '1 напиток за визит',
        'Во всех партнёрских кофейнях',
      ]
    : [
        'Выбранная категория напитков',
        'Стандартный размер',
        '1 напиток за визит',
        'Во всех партнёрских кофейнях',
      ];
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        {/* Header */}
        <div className="px-4 py-4 flex items-center gap-3">
          <Link to="/packages" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeft size={20} className="text-foreground" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Детали пакета</h1>
        </div>
        
        {/* Content */}
        <div className="px-4 space-y-6">
          <div className="card-static animate-slide-up">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black text-foreground">{pkg.name}</h2>
                <p className="text-muted-foreground">{pkg.description}</p>
              </div>
              {pkg.badge && (
                <span className="badge-accent">{pkg.badge}</span>
              )}
            </div>
            
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-3xl font-black text-foreground">
                {formatPrice(pkg.price)}
              </span>
              <span className="text-muted-foreground">/{pkg.period}</span>
            </div>
            
            {pkg.originalPrice && (
              <div className="bg-accent/10 rounded-xl p-3 mb-4">
                <p className="text-sm text-accent font-semibold">
                  Экономия {formatPrice(pkg.originalPrice - pkg.price)} в {pkg.period}
                </p>
              </div>
            )}
          </div>
          
          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">Что входит</h3>
            <div className="space-y-2">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-secondary rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                    <Check size={14} className="text-accent" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <div className="bg-secondary rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Info size={20} className="text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Как это работает</p>
                  <p className="text-xs text-muted-foreground">
                    После оформления получаешь {pkg.count} напитков. Заходишь в любую партнёрскую кофейню, показываешь QR — и забираешь напиток. Всё просто.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="pb-6 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <button className="btn-accent w-full text-lg">
              Оформить за {formatPrice(pkg.price)}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
