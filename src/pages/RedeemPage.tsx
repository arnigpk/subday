import { useState, useEffect, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, Sparkles, ChevronDown, MapPin, Loader2, Clock } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { toast } from '@/components/ui/sonner';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { isShopOpen } from '@/utils/shopHours';
import { useSuccessSound } from '@/hooks/useSuccessSound';
import { useVibration } from '@/hooks/useVibration';
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

interface ShopWithStatus extends Shop {
  isCurrentlyOpen: boolean;
}

export default function RedeemPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<RedeemStatus>('ready');
  const [showConfetti, setShowConfetti] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [shops, setShops] = useState<ShopWithStatus[]>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const [selectedShop, setSelectedShop] = useState<ShopWithStatus | null>(null);
  const [lastRedemptionId, setLastRedemptionId] = useState<string | null>(null);
  
  const { stats, refetch } = useUserStatsContext();
  const { playSuccessSound } = useSuccessSound();
  const { vibrateSuccess } = useVibration();
  
  // Get initial shop from location state if provided
  const initialShop = location.state?.shop;
  const drinkType = location.state?.drinkType || 'coffee';
  const drinkName = location.state?.drinkName || (drinkType === 'coffee' ? 'Кофе' : 'Матча латте');
  
  const remaining = drinkType === 'coffee' ? stats.coffeeRemaining : stats.drinksRemaining;

  // Handle successful redemption from realtime
  const handleRealtimeRedemption = useCallback(() => {
    setStatus('scanning');
    
    // Short delay to show scanning state
    setTimeout(() => {
      setStatus('success');
      setShowConfetti(true);
      playSuccessSound();
      vibrateSuccess();
      refetch();
      
      setTimeout(() => setShowConfetti(false), 2000);
    }, 500);
  }, [refetch, playSuccessSound, vibrateSuccess]);

  // Get user ID and last redemption for QR code
  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        
        // Get the last redemption ID to ignore it in realtime
        const { data: lastRedemption } = await supabase
          .from('redemptions')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (lastRedemption) {
          setLastRedemptionId(lastRedemption.id);
        }
      }
    };
    
    initUser();
  }, []);

  // Subscribe to realtime redemptions
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('user-redemptions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'redemptions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('New redemption detected:', payload);
          // Only trigger if this is a new redemption (not the last one we knew about)
          if (payload.new && payload.new.id !== lastRedemptionId) {
            handleRealtimeRedemption();
            setLastRedemptionId(payload.new.id as string);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, lastRedemptionId, handleRealtimeRedemption]);

  // Fetch shops from database and add open status
  useEffect(() => {
    const fetchShops = async () => {
      try {
        const { data, error } = await supabase
          .from('shops')
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        
        // Add open status to each shop
        const shopsWithStatus: ShopWithStatus[] = (data || []).map(shop => ({
          ...shop,
          isCurrentlyOpen: shop.working_hours ? isShopOpen(shop.working_hours) : false,
        }));
        
        // Sort: open shops first, then closed shops
        shopsWithStatus.sort((a, b) => {
          if (a.isCurrentlyOpen && !b.isCurrentlyOpen) return -1;
          if (!a.isCurrentlyOpen && b.isCurrentlyOpen) return 1;
          return a.name.localeCompare(b.name);
        });
        
        setShops(shopsWithStatus);
        
        // Set initial shop - prefer open shop
        if (initialShop && shopsWithStatus.length > 0) {
          const foundShop = shopsWithStatus.find(s => s.id === initialShop.id);
          if (foundShop) {
            setSelectedShop(foundShop);
          } else {
            // Select first open shop or first shop
            const firstOpen = shopsWithStatus.find(s => s.isCurrentlyOpen);
            setSelectedShop(firstOpen || shopsWithStatus[0]);
          }
        } else if (shopsWithStatus.length > 0) {
          // Select first open shop or first shop
          const firstOpen = shopsWithStatus.find(s => s.isCurrentlyOpen);
          setSelectedShop(firstOpen || shopsWithStatus[0]);
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

  // Update shop status every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setShops(prevShops => {
        const updated = prevShops.map(shop => ({
          ...shop,
          isCurrentlyOpen: shop.working_hours ? isShopOpen(shop.working_hours) : false,
        }));
        
        // Re-sort
        updated.sort((a, b) => {
          if (a.isCurrentlyOpen && !b.isCurrentlyOpen) return -1;
          if (!a.isCurrentlyOpen && b.isCurrentlyOpen) return 1;
          return a.name.localeCompare(b.name);
        });
        
        return updated;
      });
      
      // Update selected shop status
      if (selectedShop) {
        setSelectedShop(prev => prev ? {
          ...prev,
          isCurrentlyOpen: prev.working_hours ? isShopOpen(prev.working_hours) : false,
        } : null);
      }
    }, 60000);
    
    return () => clearInterval(interval);
  }, [selectedShop]);

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
                  <span className="flex items-center gap-2">
                    {selectedShop?.name || 'Выбрать кофейню'}
                    {selectedShop && (
                      <span className={`text-xs font-medium ${selectedShop.isCurrentlyOpen ? 'text-accent' : 'text-destructive'}`}>
                        · {selectedShop.isCurrentlyOpen ? 'Открыто' : 'Закрыто'}
                      </span>
                    )}
                  </span>
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
                    } ${!shop.isCurrentlyOpen ? 'opacity-60' : ''}`}
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
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{shop.name}</p>
                        <span className={`text-xs font-medium shrink-0 ${shop.isCurrentlyOpen ? 'text-accent' : 'text-destructive'}`}>
                          {shop.isCurrentlyOpen ? 'Открыто' : 'Закрыто'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {shop.address && (
                          <span className="truncate flex items-center gap-1">
                            <MapPin size={10} />
                            {shop.address}
                          </span>
                        )}
                        {shop.working_hours && (
                          <span className="shrink-0 flex items-center gap-1">
                            <Clock size={10} />
                            {shop.working_hours}
                          </span>
                        )}
                      </div>
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
              <div className="w-72 h-72 bg-white rounded-3xl shadow-card flex items-center justify-center mb-6 mx-auto border-4 border-accent p-3">
                {qrCodeData ? (
                  <QRCodeSVG 
                    value={qrCodeData}
                    size={260}
                    level="L"
                    includeMargin={false}
                    bgColor="white"
                    fgColor="#000000"
                  />
                ) : (
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              <p className="text-lg font-bold text-foreground mb-2">Ваш QR</p>
              <p className="text-muted-foreground mb-2">Покажи бариста для сканирования</p>
              <p className="text-sm text-muted-foreground mb-4">
                Осталось: <span className="font-bold text-foreground">{remaining}</span> {drinkType === 'coffee' ? 'кофе' : 'напитков'}
              </p>
              
              {selectedShop && !selectedShop.isCurrentlyOpen && (
                <p className="text-sm text-destructive mb-4">
                  Кофейня сейчас закрыта
                </p>
              )}
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
