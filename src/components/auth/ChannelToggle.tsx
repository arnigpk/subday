import { useLanguage } from '@/contexts/LanguageContext';
import { MessageSquare, Phone } from 'lucide-react';

export type OtpChannel = 'sms' | 'whatsapp';

interface ChannelToggleProps {
  channel: OtpChannel;
  onChange: (channel: OtpChannel) => void;
}

export function ChannelToggle({ channel, onChange }: ChannelToggleProps) {
  const { t } = useLanguage();

  return (
    <div className="flex rounded-xl bg-muted p-1 gap-1">
      <button
        type="button"
        onClick={() => onChange('sms')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
          channel === 'sms'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Phone className="w-4 h-4" />
        {t('auth.viaSms')}
      </button>
      <button
        type="button"
        onClick={() => onChange('whatsapp')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
          channel === 'whatsapp'
            ? 'bg-[#25D366] text-white shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <MessageSquare className="w-4 h-4" />
        {t('auth.viaWhatsapp')}
      </button>
    </div>
  );
}
