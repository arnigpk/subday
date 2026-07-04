import { supabase } from '@/integrations/supabase/client';

/**
 * Клиентская часть конфига гео-уведомлений, редактируемая в админке
 * (auto_notification_templates → trigger_type = 'geo_proximity').
 *
 * radius_meters и local_cooldown_minutes влияют на клиент (когда дёргать
 * geo-notify). Остальные условия (кулдаун 12ч, лимит, часы) проверяет сервер.
 */
export interface GeoClientConfig {
  radiusMeters: number;
  localCooldownMs: number;
}

const DEFAULTS: GeoClientConfig = {
  radiusMeters: 250,
  localCooldownMs: 30 * 60 * 1000,
};

export async function fetchGeoClientConfig(): Promise<GeoClientConfig> {
  try {
    const { data } = await supabase
      .from('auto_notification_templates')
      .select('trigger_config')
      .eq('trigger_type', 'geo_proximity')
      .eq('is_active', true)
      .maybeSingle();
    const cfg = ((data as any)?.trigger_config) || {};
    return {
      radiusMeters: Number(cfg.radius_meters) > 0 ? Number(cfg.radius_meters) : DEFAULTS.radiusMeters,
      localCooldownMs: Number(cfg.local_cooldown_minutes) > 0
        ? Number(cfg.local_cooldown_minutes) * 60 * 1000
        : DEFAULTS.localCooldownMs,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
