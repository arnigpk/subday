import { useState, useEffect, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ArrowLeftIcon, CheckIcon, SparklesIcon, ChevronDownIcon, MapPinIcon, ClockIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { Loader2, Coffee, UtensilsCrossed } from 'lucide-react';;
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { toast } from '@/components/ui/sonner';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { isShopOpen, isAnyAddressOpen } from '@/utils/shopHours';
import { useSuccessSound } from '@/hooks/useSuccessSound';
import { useVibration } from '@/hooks/useVibration';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useLanguage } from '@/contexts/LanguageContext';
import { useShopDistances, type Coordinate } from '@/hooks/useShopDistances';

interface QRSettings {
  qr_title: string;
  qr_barista_text: string;
  qr_validity_text: string;
  qr_remaining_text: string;
}

interface SubTypeVolume {
  id: string;
  name: string;
  type: string;
  max_volume: string | null;
}
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
  supported_types: string[];
  coordinates: Coordinate[];
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
  const [qrTimestamp, setQrTimestamp] = useState<number>(Date.now());
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number>(59);
  
  const { stats, refetch } = useUserStatsContext();
  const { playSuccessSound } = useSuccessSound();
  const { vibrateSuccess } = useVibration();
  const { activeSubscriptions } = useSubscriptionStatus();
  const { t } = useLanguage();
  
  // QR settings and subscription volumes
  const [qrSettings, setQrSettings] = useState<QRSettings>({
    qr_title: 'Ваш QR',
    qr_barista_text: 'Покажите бариста для сканирования',
    qr_validity_text: 'QR действителен {seconds} сек',
    qr_remaining_text: 'Осталось {count} {type}',
  });
  const [subTypeVolumes, setSubTypeVolumes] = useState<SubTypeVolume[]>([]);
  
  // Distance-based sorting
  const shopsForDistance = useMemo(() => shops.map(s => ({ id: s.id, coordinates: s.coordinates })), [shops]);
  const { distances } = useShopDistances(shopsForDistance);
  const [lastDistanceKey, setLastDistanceKey] = useState('');
  
  const initialShop = location.state?.shop;
  const initialDrinkType = location.state?.drinkType || null; // null = auto-detect
  const isGuestCoffee = location.state?.isGuestCoffee || false;
  
  // Re-sort shops by distance when distances are calculated
  useEffect(() => {
    if (distances.size === 0 || shops.length === 0) return;
    
    // Create a key from distances to detect actual changes
    const distKey = Array.from(distances.entries()).map(([id, d]) => `${id}:${d.distance}`).join(',');
    if (distKey === lastDistanceKey) return;
    
    const sorted = [...shops].sort((a, b) => {
      // Open shops first
      if (a.isCurrentlyOpen && !b.isCurrentlyOpen) return -1;
      if (!a.isCurrentlyOpen && b.isCurrentlyOpen) return 1;
      // Then by distance
      const distA = distances.get(a.id)?.distance;
      const distB = distances.get(b.id)?.distance;
      if (distA != null && distB != null) return distA - distB;
      if (distA != null) return -1;
      if (distB != null) return 1;
      return a.name.localeCompare(b.name);
    });
    
    setShops(sorted);
    // Auto-select nearest open shop on first distance calc
    if (!lastDistanceKey && sorted.length > 0) {
      const nearestOpen = sorted.find(s => s.isCurrentlyOpen);
      setSelectedShop(nearestOpen || sorted[0]);
    }
    setLastDistanceKey(distKey);
  }, [distances, shops.length, lastDistanceKey, initialShop]);
  
  // Auto-detect drink type based on active subscriptions
  const hasCoffee = activeSubscriptions.some(sub => sub.subscription_type === 'coffee');
  const hasLunch = activeSubscriptions.some(sub => sub.subscription_type === 'drinks');
  
  const autoDetectedType: 'coffee' | 'drinks' = (() => {
    if (initialDrinkType) return initialDrinkType;
    if (hasLunch && !hasCoffee) return 'drinks';
    return 'coffee';
  })();
  
  const [selectedDrinkType, setSelectedDrinkType] = useState<'coffee' | 'drinks'>(autoDetectedType);
  
  // Update when subscriptions load
  useEffect(() => {
    if (!initialDrinkType && activeSubscriptions.length > 0) {
      if (hasLunch && !hasCoffee) {
        setSelectedDrinkType('drinks');
      }
    }
  }, [activeSubscriptions, hasCoffee, hasLunch, initialDrinkType]);
  
  // Shop capabilities
  const shopSupportsCoffee = selectedShop?.supported_types?.includes('coffee') ?? true;
  const shopSupportsLunch = selectedShop?.supported_types?.includes('drinks') ?? false;

  // Show toggle if user has at least one subscription and not guest
  const showTypeToggle = (hasCoffee || hasLunch) && !isGuestCoffee;

  // Button states: active only if user has sub AND shop supports it
  const coffeeButtonActive = hasCoffee && shopSupportsCoffee;
  const lunchButtonActive = hasLunch && shopSupportsLunch;

  // Auto-correct selected type if current selection is not possible
  useEffect(() => {
    if (isGuestCoffee) return;
    if (selectedDrinkType === 'drinks' && !lunchButtonActive && coffeeButtonActive) {
      setSelectedDrinkType('coffee');
    } else if (selectedDrinkType === 'coffee' && !coffeeButtonActive && lunchButtonActive) {
      setSelectedDrinkType('drinks');
    }
  }, [selectedShop, coffeeButtonActive, lunchButtonActive, selectedDrinkType, isGuestCoffee]);

  const drinkType = selectedDrinkType;
  const drinkName = drinkType === 'coffee' ? t('balance.coffee') : t('balance.drinks');
  
  const hasGuestCoffee = stats.guestCoffees > 0 && stats.guestExpiresAt && new Date(stats.guestExpiresAt) > new Date();
  const remaining = isGuestCoffee && hasGuestCoffee ? stats.guestCoffees : (drinkType === 'coffee' ? stats.coffeeRemaining : stats.drinksRemaining);

  const handleRealtimeRedemption = useCallback(() => {
    setStatus('scanning');
    setTimeout(() => {
      setStatus('success');
      setShowConfetti(true);
      playSuccessSound();
      vibrateSuccess();
      refetch();
      setTimeout(() => setShowConfetti(false), 2000);
    }, 500);
  }, [refetch, playSuccessSound, vibrateSuccess]);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: lastRedemption } = await supabase
          .from('redemptions')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastRedemption) setLastRedemptionId(lastRedemption.id);
      }
    };
    initUser();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('user-redemptions')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'redemptions',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if (payload.new && payload.new.id !== lastRedemptionId) {
          handleRealtimeRedemption();
          setLastRedemptionId(payload.new.id as string);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, lastRedemptionId, handleRealtimeRedemption]);

  useEffect(() => {
    const fetchShops = async () => {
      try {
        const { data, error } = await supabase
          .from('shops').select('id, name, address, city, working_hours, is_active, logo_url, supported_types, coordinates').eq('is_active', true).order('name');
        if (error) throw error;
        const shopsWithStatus: ShopWithStatus[] = (data || []).map(shop => {
          const rawCoords = (shop as any).coordinates;
          let coords: Coordinate[] = [];
          if (Array.isArray(rawCoords)) {
            coords = rawCoords.filter((c: any) => c?.lat && c?.lng);
          } else if (rawCoords?.lat && rawCoords?.lng) {
            coords = [rawCoords];
          }
          return {
            ...shop,
            supported_types: (shop as any).supported_types || ['coffee'],
            coordinates: coords,
            isCurrentlyOpen: isAnyAddressOpen(shop.working_hours, coords),
          };
        });
        // Initial sort: open first, then alphabetical (will be re-sorted by distance later)
        shopsWithStatus.sort((a, b) => {
          if (a.isCurrentlyOpen && !b.isCurrentlyOpen) return -1;
          if (!a.isCurrentlyOpen && b.isCurrentlyOpen) return 1;
          return a.name.localeCompare(b.name);
        });
        setShops(shopsWithStatus);
        // Set temporary selection; will be overridden by distance-based sort
        const firstOpen = shopsWithStatus.find(s => s.isCurrentlyOpen);
        setSelectedShop(firstOpen || shopsWithStatus[0] || null);
      } catch (error) {
        console.error('Error fetching shops:', error);
        toast.error(t('redeem.loadError'));
      } finally {
        setIsLoadingShops(false);
      }
    };
    fetchShops();
  }, [initialShop]);

  // Fetch QR settings and subscription type volumes
  useEffect(() => {
    const fetchQRData = async () => {
      const [settingsRes, subsRes] = await Promise.all([
        supabase.from('qr_settings').select('setting_key, setting_value'),
        supabase.from('subscription_types').select('id, name, type, max_volume').eq('is_active', true),
      ]);
      if (settingsRes.data) {
        const map: Record<string, string> = {};
        (settingsRes.data as any[]).forEach((s: any) => { map[s.setting_key] = s.setting_value; });
        setQrSettings(prev => ({ ...prev, ...map }));
      }
      if (subsRes.data) {
        setSubTypeVolumes(subsRes.data as any);
      }
    };
    fetchQRData();
  }, []);

  // QR countdown timer - refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setQrSecondsLeft(prev => {
        if (prev <= 1) {
          // Regenerate QR
          setQrTimestamp(Date.now());
          // Also refresh shop open/closed status
          setShops(prevShops => {
            const updated = prevShops.map(shop => ({
              ...shop, isCurrentlyOpen: isAnyAddressOpen(shop.working_hours, shop.coordinates),
            }));
            updated.sort((a, b) => {
              if (a.isCurrentlyOpen && !b.isCurrentlyOpen) return -1;
              if (!a.isCurrentlyOpen && b.isCurrentlyOpen) return 1;
              return a.name.localeCompare(b.name);
            });
            return updated;
          });
          if (selectedShop) {
            const updatedStatus = isAnyAddressOpen(selectedShop.working_hours, selectedShop.coordinates);
            if (!updatedStatus) {
              // Selected shop just closed — auto-switch to nearest open shop
              setShops(prev => {
                const nearestOpen = prev.find(s => s.isCurrentlyOpen);
                if (nearestOpen) setSelectedShop(nearestOpen);
                return prev;
              });
            }
            setSelectedShop(prev => prev ? {
              ...prev, isCurrentlyOpen: updatedStatus,
            } : null);
          }
          return 59;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedShop]);

  const qrCodeData = useMemo(() => {
    if (!userId || !selectedShop || !selectedShop.isCurrentlyOpen) return null;
    return JSON.stringify({
      type: 'subday_redeem', userId, shopId: selectedShop.id, shopName: selectedShop.name,
      drinkType, drinkName, timestamp: qrTimestamp, remaining,
      isGuestCoffee: isGuestCoffee && hasGuestCoffee,
    });
  }, [userId, selectedShop, drinkType, drinkName, remaining, qrTimestamp, isGuestCoffee, hasGuestCoffee]);

  const goHome = () => navigate('/');

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
              <ArrowLeftIcon className="w-5 h-5" className="text-foreground" />
            </Link>
          </div>
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="text-center">
              <div className="text-4xl mb-4">☕</div>
              <p className="text-lg font-semibold text-foreground mb-2">{t('redeem.noShops')}</p>
              <p className="text-sm text-muted-foreground">{t('redeem.tryLater')}</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  
  return (
    <AppLayout hideNav>
      <div className="min-h-screen safe-area-top safe-area-bottom flex flex-col">
        <div className="px-4 py-4 flex items-center gap-3">
          <Link to="/" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeftIcon className="w-5 h-5" className="text-foreground" />
          </Link>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{t('redeem.pickingUp')}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 font-bold text-foreground hover:text-primary transition-colors max-w-full">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{selectedShop?.name || t('redeem.selectShop')}</span>
                    {selectedShop && (
                      <span className={`text-xs font-medium shrink-0 ${selectedShop.isCurrentlyOpen ? 'text-accent' : 'text-destructive'}`}>
                        · {selectedShop.isCurrentlyOpen ? t('shops.open') : t('shops.closed')}
                      </span>
                    )}
                  </span>
                  <ChevronDownIcon className="w-4 h-4" className="shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)] max-w-72 bg-card border border-border shadow-lg z-50">
                {shops.map((shop) => (
                  <DropdownMenuItem
                    key={shop.id}
                    onClick={() => shop.isCurrentlyOpen ? setSelectedShop(shop) : null}
                    disabled={!shop.isCurrentlyOpen}
                    className={`flex items-center gap-3 p-3 ${
                      shop.isCurrentlyOpen ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                    } ${selectedShop?.id === shop.id ? 'bg-accent/10' : ''}`}
                  >
                    {shop.logo_url ? (
                      <img src={shop.logo_url} alt={shop.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-lg shrink-0">☕</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{shop.name}</p>
                        <span className={`text-xs font-medium shrink-0 ${shop.isCurrentlyOpen ? 'text-accent' : 'text-destructive'}`}>
                          {shop.isCurrentlyOpen ? t('shops.open') : t('shops.closed')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {shop.address && (
                          <span className="truncate flex items-center gap-1">
                            <MapPinIcon className="w-[10px] h-[10px]" />
                            {shop.address}
                          </span>
                        )}
                        {shop.working_hours && (
                          <span className="shrink-0 flex items-center gap-1">
                            <ClockIcon className="w-[10px] h-[10px]" />
                            {shop.working_hours}
                          </span>
                        )}
                      </div>
                    </div>
                    {selectedShop?.id === shop.id && (
                      <CheckIcon className="w-4 h-4" className="text-accent shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          {status === 'ready' && (
            <div className="text-center animate-slide-up">
              {/* Type toggle */}
              {showTypeToggle && (
                <div className="flex gap-2 justify-center mb-2">
                  <button
                    onClick={() => coffeeButtonActive ? setSelectedDrinkType('coffee') : null}
                    disabled={!coffeeButtonActive}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
                      selectedDrinkType === 'coffee' && coffeeButtonActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    } ${!coffeeButtonActive ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Coffee size={16} />
                    {t('redeem.typeCoffee')}
                  </button>
                  <button
                    onClick={() => lunchButtonActive ? setSelectedDrinkType('drinks') : null}
                    disabled={!lunchButtonActive}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
                      selectedDrinkType === 'drinks' && lunchButtonActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    } ${!lunchButtonActive ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <UtensilsCrossed size={16} />
                    {t('redeem.typeLunch')}
                  </button>
                </div>
              )}
              
              {/* Single hint when lunch unavailable at this shop */}
              {hasLunch && !shopSupportsLunch && (
                <p className="text-xs text-muted-foreground mb-3">{t('redeem.lunchNotAvailable')}</p>
              )}

              <div className="w-full max-w-[288px] aspect-square bg-white rounded-3xl shadow-card flex items-center justify-center mb-6 mx-auto border-4 border-accent p-3">
                {qrCodeData ? (
                  <QRCodeSVG value={qrCodeData} size={256} level="L" includeMargin={false} bgColor="white" fgColor="#000000" className="w-full h-full" />
                ) : selectedShop && !selectedShop.isCurrentlyOpen ? (
                  <div className="text-center p-4">
                    <ClockIcon className="w-12 h-12" className="text-destructive mx-auto mb-3" />
                    <p className="text-sm font-semibold text-destructive">Кофейня закрыта</p>
                    <p className="text-xs text-muted-foreground mt-1">Выберите открытую кофейню</p>
                  </div>
                ) : (
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              <p className="text-lg font-bold text-foreground mb-0.5">{qrSettings.qr_title}</p>
              {/* Current plan name */}
              {(() => {
                const activeSub = activeSubscriptions.find(s => s.subscription_type === drinkType);
                return activeSub?.subscription_name ? (
                  <p className="text-sm font-semibold text-accent mb-1">{activeSub.subscription_name}</p>
                ) : null;
              })()}
              <p className="text-xs text-muted-foreground mb-1">
                {qrSettings.qr_validity_text.replace('{seconds}', String(qrSecondsLeft))}
              </p>
              <p className="text-muted-foreground mb-1">{qrSettings.qr_barista_text}</p>
              {/* Volume */}
              {(() => {
                const activeSub = activeSubscriptions.find(s => s.subscription_type === drinkType);
                const subVolume = activeSub?.subscription_type_id
                  ? subTypeVolumes.find(sv => sv.id === activeSub.subscription_type_id)?.max_volume
                  : null;
                return subVolume ? (
                  <p className="text-sm font-semibold text-accent mb-1">Допустимый объём: {subVolume}</p>
                ) : null;
              })()}
              <p className="text-sm text-muted-foreground mb-4">
                {qrSettings.qr_remaining_text
                  .replace('{count}', String(remaining))
                  .replace('{type}', drinkType === 'coffee' ? t('redeem.coffee') : t('redeem.drinks'))
                }
              </p>
              
              {selectedShop && !selectedShop.isCurrentlyOpen && (
                <p className="text-sm text-destructive mb-4">{t('redeem.shopClosed')}</p>
              )}
            </div>
          )}
          
          {status === 'scanning' && (
            <div className="text-center animate-pop">
              <div className="w-full max-w-[256px] aspect-square bg-card rounded-3xl shadow-card flex items-center justify-center mb-6 mx-auto border-4 border-primary">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-lg font-bold text-foreground mb-2">{t('redeem.scanning')}</p>
              <p className="text-muted-foreground">{t('redeem.waitSec')}</p>
            </div>
          )}
          
          {status === 'success' && (
            <div className="text-center animate-pop relative">
              {showConfetti && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="absolute animate-confetti" style={{
                      left: `${Math.random() * 100}%`, top: '50%',
                      animationDelay: `${Math.random() * 0.5}s`, fontSize: `${Math.random() * 20 + 10}px`,
                    }}>
                      {['☕', '✨', '🎉', '⭐'][Math.floor(Math.random() * 4)]}
                    </div>
                  ))}
                </div>
              )}
              <div className="w-full max-w-[256px] aspect-square bg-accent rounded-3xl shadow-glow flex items-center justify-center mb-6 mx-auto">
                <CheckIcon className="w-[100px] h-[100px]" className="text-accent-foreground" />
              </div>
              <p className="text-2xl font-black text-foreground mb-2">{t('redeem.success')}</p>
              <p className="text-sm text-muted-foreground mb-2 px-2 break-words">{t('redeem.enjoy')}, {selectedShop?.name}!</p>
              <div className="inline-flex items-center gap-2 bg-accent/20 text-accent font-bold px-4 py-2 rounded-xl mt-4">
                <SparklesIcon className="w-4 h-4" />
                +10 {t('bonuses.points')}
              </div>
              <div className="mt-8">
                <button onClick={goHome} className="btn-primary">{t('redeem.goHome')}</button>
              </div>
            </div>
          )}
          
          {status === 'error' && (
            <div className="text-center animate-pop">
              <div className="w-full max-w-[256px] aspect-square bg-destructive/20 rounded-3xl flex items-center justify-center mb-6 mx-auto border-4 border-destructive">
                <span className="text-6xl">❌</span>
              </div>
              <p className="text-lg font-bold text-foreground mb-2">{t('redeem.error')}</p>
              <p className="text-muted-foreground mb-8">{t('redeem.tryAgain')}</p>
              <button onClick={() => setStatus('ready')} className="btn-primary">{t('redeem.retry')}</button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
