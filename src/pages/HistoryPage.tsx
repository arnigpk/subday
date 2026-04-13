import { AppLayout } from '@/components/layout/AppLayout';
import { Coffee, UtensilsCrossed, Gift, CreditCard, Sparkles, FileText } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDateKz } from '@/utils/kazakh';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ReceiptPopup } from '@/components/history/ReceiptPopup';
import { PreorderHistoryItem } from '@/components/preorder/PreorderHistoryItem';

interface SubscriptionTransaction {
  id: string;
  subscription_name: string;
  transaction_type: string;
  amount: number | null;
  is_special_offer: boolean | null;
  payment_method: string | null;
  created_at: string;
  receipt_data: any | null;
}

interface PreorderItem {
  id: string;
  shop_name: string;
  coffee_name: string;
  syrup: string | null;
  status: string;
  qr_code: string;
  created_at: string;
  completed_at: string | null;
  shop_address: string | null;
}

interface UnifiedHistoryItem {
  id: string;
  type: 'redemption' | 'preorder';
  date: string;
  drinkName?: string;
  drinkType?: string;
  shopName?: string;
  shopAddress?: string;
  redeemedAt?: string;
  preorder?: PreorderItem;
}

export default function HistoryPage() {
  const { redemptions, isLoading } = useUserStatsContext();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState('redemptions');
  const [transactions, setTransactions] = useState<SubscriptionTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<{ data: any; name: string } | null>(null);
  const [preorders, setPreorders] = useState<PreorderItem[]>([]);
  
  const tabs = [
    { id: 'redemptions', label: t('history.tabRedemptions') },
    { id: 'transactions', label: t('history.tabTransactions') },
  ];

  useEffect(() => {
    fetchPreorders();
    if (activeTab === 'transactions') fetchTransactions();
  }, [activeTab]);

  const fetchPreorders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('preorders')
        .select('id, shop_name, coffee_name, syrup, status, qr_code, created_at, completed_at, shop_address')
        .eq('user_id', user.id)
        .in('status', ['new', 'completed', 'expired'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data) setPreorders(data as PreorderItem[]);
    } catch (e) {
      console.error('Error fetching preorders:', e);
    }
  };

  const fetchTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('subscription_transactions')
        .select('id, subscription_name, transaction_type, amount, is_special_offer, payment_method, created_at, receipt_data')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data) setTransactions(data);
    } catch (e) {
      console.error('Error fetching transactions:', e);
    } finally {
      setTransactionsLoading(false);
    }
  };
  
  const formatDate = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      if (language === 'kz' || language === 'kg') return formatDateKz(d);
      if (language === 'en') return format(d, 'd MMM', { locale: enUS });
      return format(d, 'd MMM', { locale: ru });
    } catch { return dateStr; }
  };
  
  const formatTime = (dateStr: string) => {
    try { return format(parseISO(dateStr), 'HH:mm'); }
    catch { return ''; }
  };

  const formatAmount = (amount: number | null) => {
    if (!amount) return '';
    return `${amount.toLocaleString()} ₸`;
  };

  const getPaymentLabel = (receiptData: any | null): string => {
    const method = typeof receiptData?.payment_method === 'string' ? receiptData.payment_method.toLowerCase() : '';
    const brand = typeof receiptData?.card_brand === 'string' ? receiptData.card_brand.toUpperCase() : '';
    if (method.includes('apple')) return '🍎 Apple Pay';
    if (method.includes('google')) return '📱 Google Pay';
    if (method === 'wallet') return '💳 FreedomPay Wallet';
    if (brand === 'VI' || brand === 'VISA') return '💳 Visa';
    if (brand === 'MC' || brand === 'MASTERCARD') return '💳 Mastercard';
    return '💳 Онлайн оплата';
  };

  const buildUnifiedList = (): UnifiedHistoryItem[] => {
    const items: UnifiedHistoryItem[] = [];
    
    redemptions.forEach(r => {
      items.push({
        id: r.id,
        type: 'redemption',
        date: r.redeemedAt,
        drinkName: r.drinkName,
        drinkType: r.drinkType,
        shopName: r.shopName,
        shopAddress: r.shopAddress,
        redeemedAt: r.redeemedAt,
      });
    });

    preorders.forEach(p => {
      items.push({
        id: p.id,
        type: 'preorder',
        date: p.created_at,
        preorder: p,
      });
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  };

  const unifiedList = buildUnifiedList();
  
  if (isLoading) {
    return (
      <AppLayout>
        <div className="safe-area-top">
          <div className="px-4 py-4">
            <h1 className="text-2xl font-black text-foreground mb-4">{t('history.title')}</h1>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card-static flex items-center gap-4 animate-pulse">
                  <div className="w-12 h-12 rounded-xl bg-muted" />
                  <div className="flex-1">
                    <div className="h-4 w-24 bg-muted rounded mb-2" />
                    <div className="h-3 w-32 bg-muted rounded" />
                  </div>
                  <div className="text-right">
                    <div className="h-3 w-12 bg-muted rounded mb-2" />
                    <div className="h-3 w-10 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  
  return (
    <>
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-black text-foreground mb-4">{t('history.title')}</h1>
          
          <TabSwitcher tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-4" />

          {activeTab === 'redemptions' ? (
            unifiedList.length > 0 ? (
              <div className="space-y-3">
                {unifiedList.map((item, index) => {
                  if (item.type === 'preorder' && item.preorder) {
                    return <PreorderHistoryItem key={`p-${item.id}`} preorder={item.preorder} index={index} />;
                  }
                  return (
                    <div key={item.id} className="card-static flex items-center gap-4 animate-slide-up" style={{ animationDelay: `${index * 0.05}s` }}>
                      {(() => {
                        const isGuestGrant = item.drinkName?.startsWith('Гостевой доступ');
                        const isGuestCoffee = item.drinkName?.startsWith('Гостевой кофе');
                        if (isGuestGrant || isGuestCoffee) return (
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10">
                            <Gift size={24} className="text-primary" />
                          </div>
                        );
                        return (
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${item.drinkType === 'coffee' ? 'bg-primary/10' : 'bg-accent/10'}`}>
                            {item.drinkType === 'coffee' ? <Coffee size={24} className="text-primary" /> : <UtensilsCrossed size={24} className="text-accent" />}
                          </div>
                        );
                      })()}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{item.drinkName}</p>
                        <p className="text-sm text-muted-foreground truncate">{item.shopName}</p>
                        {item.shopAddress && (
                          <p className="text-xs text-muted-foreground truncate">{item.shopAddress}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">{formatDate(item.redeemedAt!)}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(item.redeemedAt!)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-lg font-semibold text-foreground mb-2">{t('history.empty')}</p>
                <p className="text-sm text-muted-foreground">{t('history.emptyDesc')}</p>
              </div>
            )
          ) : (
            transactionsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="card-static flex items-center gap-4 animate-pulse">
                    <div className="w-12 h-12 rounded-xl bg-muted" />
                    <div className="flex-1">
                      <div className="h-4 w-28 bg-muted rounded mb-2" />
                      <div className="h-3 w-20 bg-muted rounded" />
                    </div>
                    <div className="text-right">
                      <div className="h-4 w-16 bg-muted rounded mb-2" />
                      <div className="h-3 w-12 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((tx, index) => (
                  <div key={tx.id} className="card-static flex items-center gap-4 animate-slide-up" style={{ animationDelay: `${index * 0.05}s` }}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tx.is_special_offer ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
                      {tx.is_special_offer ? <Sparkles size={24} className="text-amber-500" /> : <CreditCard size={24} className="text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{tx.subscription_name}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground">
                          {tx.transaction_type === 'purchase' ? getPaymentLabel(tx.receipt_data) : 'Админ'}
                        </p>
                        {tx.is_special_offer && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">
                            {t('history.specialOffer')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex items-start gap-1.5">
                      <div>
                        {tx.amount && (
                          <p className="text-sm font-semibold text-foreground">{formatAmount(tx.amount)}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(tx.created_at)}</p>
                      </div>
                      {tx.receipt_data && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedReceipt({ data: tx.receipt_data, name: tx.subscription_name }); }}
                          className="mt-0.5 p-1.5 rounded-lg hover:bg-primary/10 transition-colors active:scale-95"
                          title="Чек"
                        >
                          <FileText size={16} className="text-primary" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">💳</div>
                <p className="text-lg font-semibold text-foreground mb-2">{t('history.transactionsEmpty')}</p>
                <p className="text-sm text-muted-foreground">{t('history.transactionsEmptyDesc')}</p>
              </div>
            )
          )}
        </div>
      </div>
    </AppLayout>
    <ReceiptPopup
      open={!!selectedReceipt}
      onOpenChange={(open) => !open && setSelectedReceipt(null)}
      receipt={selectedReceipt?.data || null}
      subscriptionName={selectedReceipt?.name || ''}
    />
    </>
  );
}
