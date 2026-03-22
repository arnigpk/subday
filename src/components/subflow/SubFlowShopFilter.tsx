import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MapPinIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';;
import { useUserStatsContext } from '@/contexts/UserStatsContext';

interface Shop {
  id: string;
  name: string;
}

interface SubFlowShopFilterProps {
  selectedShopId: string | null;
  onShopChange: (shopId: string | null) => void;
}

export function SubFlowShopFilter({ selectedShopId, onShopChange }: SubFlowShopFilterProps) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedShopName, setSelectedShopName] = useState<string | null>(null);
  const { profile } = useUserStatsContext();
  const userCountry = profile?.country || 'KZ';

  useEffect(() => {
    fetchShops();
  }, [userCountry]);

  useEffect(() => {
    if (selectedShopId && shops.length > 0) {
      const shop = shops.find(s => s.id === selectedShopId);
      setSelectedShopName(shop?.name || null);
    } else {
      setSelectedShopName(null);
    }
  }, [selectedShopId, shops]);

  const fetchShops = async () => {
    let query = supabase
      .from('shops')
      .select('id, name, country')
      .eq('is_active', true)
      .order('sort_order');
    
    const { data } = await query;
    const filtered = (data || []).filter(s => !s.country || s.country === userCountry);
    setShops(filtered);
  };

  const handleSelect = (shopId: string | null) => {
    onShopChange(shopId);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
          selectedShopId 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-secondary text-foreground hover:bg-secondary/80'
        }`}
      >
        <MapPinIcon className="w-4 h-4" />
        <span className="max-w-[120px] truncate">
          {selectedShopName || 'Все кофейни'}
        </span>
        {selectedShopId ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSelect(null);
            }}
            className="ml-1 p-0.5 rounded-full hover:bg-primary-foreground/20"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDownIcon className="w-4 h-4" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          
          <div className="absolute left-0 top-full mt-2 z-50 bg-background/75 backdrop-blur-xl border border-border/40 rounded-xl shadow-[0_8px_32px_hsl(var(--foreground)/0.1),inset_0_1px_0_hsl(var(--background)/0.5)] p-2 min-w-[200px] max-h-[300px] overflow-y-auto animate-slide-up">
            <button
              onClick={() => handleSelect(null)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                !selectedShopId 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-foreground hover:bg-secondary'
              }`}
            >
              <MapPinIcon className="w-4 h-4" />
              <span>Все кофейни</span>
            </button>
            
            <div className="my-1 border-t border-border" />
            
            {shops.map((shop) => (
              <button
                key={shop.id}
                onClick={() => handleSelect(shop.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                  selectedShopId === shop.id 
                    ? 'bg-primary/10 text-primary font-medium' 
                    : 'text-foreground hover:bg-secondary'
                }`}
              >
                <span className="truncate">{shop.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
