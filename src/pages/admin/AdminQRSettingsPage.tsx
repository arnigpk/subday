import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { Loader2, Save, QrCode } from 'lucide-react';

interface QRSetting {
  id: string;
  setting_key: string;
  setting_value: string;
}

interface SubscriptionType {
  id: string;
  name: string;
  type: string;
  max_volume: string | null;
}

const SETTING_LABELS: Record<string, string> = {
  qr_title: 'Заголовок QR (напр. "Ваш QR")',
  qr_barista_text: 'Текст для бариста',
  qr_validity_text: 'Текст таймера ({seconds} = секунды)',
  qr_remaining_text: 'Текст остатка ({count} = кол-во, {type} = тип)',
};

export default function AdminQRSettingsPage() {
  const { canManage } = useAdminAuth();
  const [settings, setSettings] = useState<QRSetting[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({});
  const [editedVolumes, setEditedVolumes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, subsRes] = await Promise.all([
        supabase.from('qr_settings').select('*').order('setting_key'),
        supabase.from('subscription_types').select('id, name, type, max_volume').eq('is_active', true).order('sort_order'),
      ]);

      if (settingsRes.data) {
        setSettings(settingsRes.data as any);
        const edited: Record<string, string> = {};
        (settingsRes.data as any).forEach((s: QRSetting) => {
          edited[s.setting_key] = s.setting_value;
        });
        setEditedSettings(edited);
      }

      if (subsRes.data) {
        setSubscriptions(subsRes.data as any);
        const volumes: Record<string, string> = {};
        (subsRes.data as any).forEach((s: SubscriptionType) => {
          volumes[s.id] = s.max_volume || '';
        });
        setEditedVolumes(volumes);
      }
    } catch (err) {
      console.error(err);
      toast.error('Ошибка загрузки');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save QR settings
      for (const [key, value] of Object.entries(editedSettings)) {
        const existing = settings.find(s => s.setting_key === key);
        if (existing) {
          await supabase.from('qr_settings').update({ setting_value: value, updated_at: new Date().toISOString() }).eq('id', existing.id);
        }
      }

      // Save subscription volumes
      for (const [id, volume] of Object.entries(editedVolumes)) {
        await supabase.from('subscription_types').update({ max_volume: volume || null }).eq('id', id);
      }

      toast.success('Настройки QR сохранены');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Настройки QR">
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Настройки QR">
      <div className="space-y-8 max-w-2xl">
        {/* QR Text Settings */}
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
            <QrCode size={20} /> Тексты вокруг QR-кода
          </h3>
          <div className="space-y-4">
            {Object.entries(SETTING_LABELS).map(([key, label]) => (
              <div key={key}>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">{label}</label>
                <Input
                  value={editedSettings[key] || ''}
                  onChange={(e) => setEditedSettings(prev => ({ ...prev, [key]: e.target.value }))}
                  disabled={!canManage}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Volume per subscription */}
        <div>
          <h3 className="text-lg font-bold mb-4">Допустимый объём по тарифам</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Укажите допустимый объём напитка для каждого тарифа (напр. "300 мл", "0.3 л"). Отображается на экране QR.
          </p>
          <div className="space-y-3">
            {subscriptions.map(sub => (
              <div key={sub.id} className="flex items-center gap-3 p-3 bg-secondary rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{sub.name}</p>
                  <p className="text-xs text-muted-foreground">{sub.type === 'coffee' ? '☕ Кофе' : '🍽 Ланч'}</p>
                </div>
                <Input
                  value={editedVolumes[sub.id] || ''}
                  onChange={(e) => setEditedVolumes(prev => ({ ...prev, [sub.id]: e.target.value }))}
                  placeholder="напр. 300 мл"
                  className="w-40"
                />
              </div>
            ))}
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Сохранить настройки
        </Button>
      </div>
    </AdminLayout>
  );
}
