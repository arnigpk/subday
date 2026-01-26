import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, Sparkles, ChevronDown, MapPin, Loader2 } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { toast } from '@/components/ui/sonner';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type RedeemStatus = 'ready' | 'scanning' | 'success' | 'error';

interface Shop {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  logo_url: string | null;
}

export default function RedeemPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<RedeemStatus>('ready');
  const [showConfetti, setShowConfetti] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  
  const { stats, redeemDrink } = useUserStatsContext();
  
  // Get initial shop from location state if provided
  const initialShop = location.state?.shop;
  const drinkType = location.state?.drinkType || 'coffee';
  const drinkName = location.state?.drinkName || (drinkType === 'coffee' ? 'Капучино' : 'Матча латте');
  
  const remaining = drinkType === 'coffee' ? stats.coffeeRemaining : stats.drinksRemaining;

  // Fetch shops from database
  useEffect(() => {
    const fetchShops = async () => {
      try {
        const { data, error } = await supabase
          .from('shops')
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setShops(data || []);
        
        // Set initial shop
        if (initialShop && data) {
          const foundShop = data.find(s => s.id === initialShop.id);
          if (foundShop) {
            setSelectedShop(foundShop);
          } else if (data.length > 0) {
            setSelectedShop(data[0]);
          }
        } else if (data && data.length > 0) {
          setSelectedShop(data[0]);
        }
      } catch (error) {
        console.error('Error fetching shops:', error);
        toast.error('Ошибка загрузки кофеен');
      } finally {
        setIsLoadingShops(false);
      }
    };

    fetchShops();
  }, [initialShop]);

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
    if (!userId || !selectedShop) return null;
    
    const timestamp = Date.now();
    const data = {
      type: 'subday_redeem',
      userId: userId,
      shopId: selectedShop.id,
      shopName: selectedShop.name,
      drinkType: drinkType,
      drinkName: drinkName,
      timestamp: timestamp,
      remaining: remaining,
    };
    
    return JSON.stringify(data);
  }, [userId, selectedShop, drinkType, drinkName, remaining]);
  
  const handleScan = async () => {
    if (remaining <= 0) {
      toast.error('У вас закончились напитки в пакете');
      return;
    }

    if (!selectedShop) {
      toast.error('Выберите кофейню');
      return;
    }
    
    setStatus('scanning');
    
    // Simulate scanning delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Actually redeem the drink
    const success = await redeemDrink(selectedShop.name, selectedShop.id, drinkName, drinkType);
    
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

  if (isLoadingShops) {
    return (
      <AppLayout hideNav>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (shops.length === 0) {
    return (
      <AppLayout hideNav>
        <div className="min-h-screen safe-area-top safe-area-bottom flex flex-col">
          <div className="px-4 py-4 flex items-center gap-3">
            <Link to="/" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <ArrowLeft size={20} className="text-foreground" />
            </Link>
          </div>
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="text-center">
              <div className="text-4xl mb-4">☕</div>
              <p className="text-lg font-semibold text-foreground mb-2">Нет доступных кофеен</p>
              <p className="text-sm text-muted-foreground">Попробуйте позже</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 font-bold text-foreground hover:text-primary transition-colors">
                  {selectedShop?.name || 'Выбрать кофейню'}
                  <ChevronDown size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="start" 
                className="w-72 bg-card border border-border shadow-lg z-50"
              >
                {shops.map((shop) => (
                  <DropdownMenuItem
                    key={shop.id}
                    onClick={() => setSelectedShop(shop)}
                    className={`flex items-center gap-3 p-3 cursor-pointer ${
                      selectedShop?.id === shop.id ? 'bg-accent/10' : ''
                    }`}
                  >
                    {shop.logo_url ? (
                      <img 
                        src={shop.logo_url} 
                        alt={shop.name} 
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-lg shrink-0">
                        ☕
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{shop.name}</p>
                      {shop.address && (
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <MapPin size={10} />
                          {shop.address}
                        </p>
                      )}
                    </div>
                    {selectedShop?.id === shop.id && (
                      <Check size={16} className="text-accent shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
                disabled={remaining <= 0 || !selectedShop}
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
