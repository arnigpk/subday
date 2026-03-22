import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';
import { ReceiptPercentIcon, CreditCardIcon, HashtagIcon, CalendarIcon, CheckBadgeIcon } from '@heroicons/react/24/outline';;

interface ReceiptData {
  payment_id?: string;
  rrn?: string | number;
  amount?: number;
  currency?: string;
  card_last4?: string;
  card_brand?: string;
  issuer_bank?: string;
  description?: string;
  tracking_id?: string;
  paid_at?: string;
  status?: string;
}

interface ReceiptPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptData | null;
  subscriptionName: string;
}

export function ReceiptPopup({ open, onOpenChange, receipt, subscriptionName }: ReceiptPopupProps) {
  const { t, language } = useLanguage();

  if (!receipt) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = parseISO(dateStr);
      const locale = language === 'en' ? enUS : ru;
      return format(d, 'd MMMM yyyy, HH:mm', { locale });
    } catch {
      return dateStr;
    }
  };

  const formatAmount = (amount?: number, currency?: string) => {
    if (!amount) return '—';
    const cur = currency === 'KZT' ? '₸' : currency || '₸';
    return `${amount.toLocaleString()} ${cur}`;
  };

  const rows: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <ReceiptPercentIcon className="w-4 h-4" className="text-primary" />, label: 'Подписка', value: subscriptionName },
    { icon: <CalendarIcon className="w-4 h-4" className="text-primary" />, label: 'Дата', value: formatDate(receipt.paid_at) },
    { icon: <CheckBadgeIcon className="w-4 h-4" className="text-primary" />, label: 'Сумма', value: formatAmount(receipt.amount, receipt.currency) },
  ];

  if (receipt.card_last4) {
    rows.push({
      icon: <CreditCardIcon className="w-4 h-4" className="text-primary" />,
      label: 'Карта',
      value: `${receipt.card_brand || ''} •••• ${receipt.card_last4}`.trim(),
    });
  }

  if (receipt.issuer_bank) {
    rows.push({ icon: <CreditCardIcon className="w-4 h-4" className="text-muted-foreground" />, label: 'Банк', value: receipt.issuer_bank });
  }

  if (receipt.rrn) {
    rows.push({ icon: <HashtagIcon className="w-4 h-4" className="text-muted-foreground" />, label: 'RRN', value: String(receipt.rrn) });
  }

  if (receipt.payment_id) {
    rows.push({ icon: <HashtagIcon className="w-4 h-4" className="text-muted-foreground" />, label: 'ID платежа', value: receipt.payment_id });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ReceiptPercentIcon className="w-5 h-5" className="text-primary" />
            Чек оплаты
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{row.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="text-sm font-medium text-foreground break-all">{row.value}</p>
              </div>
            </div>
          ))}
          {receipt.status && (
            <div className="pt-2 border-t border-border/40">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-medium">
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                Оплачено
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
