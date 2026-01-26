import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import { coffeeShops } from '@/data/mockData';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { toast } from '@/components/ui/sonner';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';

type RedeemStatus = 'ready' | 'scanning' | 'success' | 'error';

export default function RedeemPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<RedeemStatus>('ready');
  const [showConfetti, setShowConfetti] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  const { stats, redeemDrink } = useUserStatsContext();
  
  const shop = location.state?.shop || coffeeShops[0];
  const drinkType = location.state?.drinkType || 'coffee';
  const drinkName = location.state?.drinkName || (drinkType === 'coffee' ? 'Капучино' : 'Матча латте');
  
  const remaining = drinkType === 'coffee' ? stats.coffeeRemaining : stats.drinksRemaining;

  // Get user ID for QR code
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
      }
    });
  }, []);

  // Generate unique QR code data
  const qrCodeData = useMemo(() => {
    if (!userId) return null;
    
    const timestamp = Date.now();
    const data = {
      type: 'subday_redeem',
      userId: userId,
      shopId: shop.id,
      shopName: shop.name,
      drinkType: drinkType,
      drinkName: drinkName,
      timestamp: timestamp,
      remaining: remaining,
    };
    
    return JSON.stringify(data);
  }, [userId, shop.id, shop.name, drinkType, drinkName, remaining]);
  
  const handleScan = async () => {
    if (remaining <= 0) {
      toast.error('У вас закончились напитки в пакете');
      return;
    }
    
    setStatus('scanning');
    
    // Simulate scanning delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Actually redeem the drink
    const success = await redeemDrink(shop.name, shop.id, drinkName, drinkType);
    
    if (success) {
      setStatus('success');
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);
    } else {
      setStatus('error');
      toast.error('Ошибка при получении напитка');
    }
  };
  
  const goHome = () => {
    navigate('/');
  };
  
  return (
    <AppLayout hideNav>
      <div className="min-h-screen safe-area-top safe-area-bottom flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 flex items-center gap-3">
          <Link to="/" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeft size={20} className="text-foreground" />
          </Link>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Забираешь в</p>
            <h1 className="font-bold text-foreground">{shop.name}</h1>
          </div>
        </div>
        
        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          {status === 'ready' && (
            <div className="text-center animate-slide-up">
              <div className="w-64 h-64 bg-white rounded-3xl shadow-card flex items-center justify-center mb-6 mx-auto border-4 border-accent p-4">
                {qrCodeData ? (
                  <QRCodeSVG 
                    value={qrCodeData}
                    size={220}
                    level="M"
                    includeMargin={false}
                    bgColor="white"
                    fgColor="black"
                  />
                ) : (
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              <p className="text-lg font-bold text-foreground mb-2">Код готов</p>
              <p className="text-muted-foreground mb-2">Покажи бариста для сканирования</p>
              <p className="text-sm text-muted-foreground mb-8">
                Осталось: <span className="font-bold text-foreground">{remaining}</span> {drinkType === 'coffee' ? 'кофе' : 'напитков'}
              </p>
              
              <button 
                onClick={handleScan} 
                className="btn-primary"
                disabled={remaining <= 0}
              >
                {remaining > 0 ? 'Имитировать скан' : 'Нет доступных напитков'}
              </button>
            </div>
          )}
          
          {status === 'scanning' && (
            <div className="text-center animate-pop">
              <div className="w-64 h-64 bg-card rounded-3xl shadow-card flex items-center justify-center mb-6 mx-auto border-4 border-primary">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-lg font-bold text-foreground mb-2">Сканируют...</p>
              <p className="text-muted-foreground">Подожди секунду</p>
            </div>
          )}
          
          {status === 'success' && (
            <div className="text-center animate-pop relative">
              {/* Confetti */}
              {showConfetti && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute animate-confetti"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: '50%',
                        animationDelay: `${Math.random() * 0.5}s`,
                        fontSize: `${Math.random() * 20 + 10}px`,
                      }}
                    >
                      {['☕', '✨', '🎉', '⭐'][Math.floor(Math.random() * 4)]}
                    </div>
                  ))}
                </div>
              )}
              
              <div className="w-64 h-64 bg-accent rounded-3xl shadow-glow flex items-center justify-center mb-6 mx-auto">
                <Check size={100} className="text-accent-foreground" strokeWidth={3} />
              </div>
              <p className="text-2xl font-black text-foreground mb-2">Засчитано!</p>
              <p className="text-muted-foreground mb-2">Наслаждайся напитком ☕</p>
              
              <div className="inline-flex items-center gap-2 bg-accent/20 text-accent font-bold px-4 py-2 rounded-xl mt-4">
                <Sparkles size={16} />
                +10 бонусов
              </div>
              
              <div className="mt-8">
                <button onClick={goHome} className="btn-primary">
                  На главную
                </button>
              </div>
            </div>
          )}
          
          {status === 'error' && (
            <div className="text-center animate-pop">
              <div className="w-64 h-64 bg-destructive/20 rounded-3xl flex items-center justify-center mb-6 mx-auto border-4 border-destructive">
                <span className="text-6xl">❌</span>
              </div>
              <p className="text-lg font-bold text-foreground mb-2">Ошибка</p>
              <p className="text-muted-foreground mb-8">Попробуй ещё раз</p>
              
              <button onClick={() => setStatus('ready')} className="btn-primary">
                Попробовать снова
              </button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
