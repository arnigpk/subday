import { useState, useRef, useEffect, useCallback } from 'react';
import Lottie from 'lottie-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Trash2, Loader2, Eye, Clock, Power, Play } from 'lucide-react';
import defaultPreloaderAnimation from '@/assets/preloader.json';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useAdminAuth } from '@/hooks/useAdminAuth';

const BUCKET = 'app-assets';
const FILE_PATH = 'preloader.json';
const CONFIG_PATH = 'preloader-config.json';

export default function AdminPreloaderPage() {
  const { canManage } = useAdminAuth();
  const [customAnimation, setCustomAnimation] = useState<any>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [previewAnimation, setPreviewAnimation] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(2);
  const [savedDuration, setSavedDuration] = useState(2);
  const [enabled, setEnabled] = useState(true);
  const [savedEnabled, setSavedEnabled] = useState(true);
  const [isDemoing, setIsDemoing] = useState(false);
  const [demoProgress, setDemoProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const startDemo = useCallback(() => {
    setIsDemoing(true);
    setDemoProgress(0);
    const totalMs = duration * 1000;
    const interval = 50;
    let elapsed = 0;
    const tick = setInterval(() => {
      elapsed += interval;
      setDemoProgress(Math.min((elapsed / totalMs) * 100, 100));
      if (elapsed >= totalMs) {
        clearInterval(tick);
        setTimeout(() => {
          setIsDemoing(false);
          setDemoProgress(0);
        }, 300);
      }
    }, interval);
  }, [duration]);

  useEffect(() => {
    loadCurrent();
    loadConfig();
  }, []);

  const loadCurrent = async () => {
    setLoading(true);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(FILE_PATH);
    try {
      const res = await fetch(data.publicUrl + '?t=' + Date.now());
      if (res.ok) {
        const json = await res.json();
        setCustomAnimation(json);
        setIsCustom(true);
      } else {
        setCustomAnimation(null);
        setIsCustom(false);
      }
    } catch {
      setCustomAnimation(null);
      setIsCustom(false);
    }
    setLoading(false);
  };

  const loadConfig = async () => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(CONFIG_PATH);
    try {
      const res = await fetch(data.publicUrl + '?t=' + Date.now());
      if (res.ok) {
        const config = await res.json();
        if (config.duration) {
          setDuration(config.duration);
          setSavedDuration(config.duration);
        }
        if (typeof config.enabled === 'boolean') {
          setEnabled(config.enabled);
          setSavedEnabled(config.enabled);
        }
      }
    } catch {
      // keep defaults
    }
  };

  const saveConfig = async (newDuration: number, newEnabled?: boolean) => {
    const enabledValue = newEnabled !== undefined ? newEnabled : enabled;
    try {
      const blob = new Blob([JSON.stringify({ duration: newDuration, enabled: enabledValue })], { type: 'application/json' });
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(CONFIG_PATH, blob, { upsert: true, cacheControl: '0' });
      if (error) throw error;
      setSavedDuration(newDuration);
      setSavedEnabled(enabledValue);
      toast.success(enabledValue ? `Прелоадер включён (${newDuration} сек.)` : 'Прелоадер выключен');
    } catch (err: any) {
      toast.error('Ошибка сохранения: ' + err.message);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const isJson = f.type === 'application/json' || f.name.toLowerCase().endsWith('.json');
    if (!isJson) {
      toast.error('Можно загрузить только Lottie-анимацию (.json)');
      return;
    }
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      // Минимальная валидация Lottie
      if (!json || typeof json !== 'object' || !('layers' in json) || !('v' in json)) {
        toast.error('Файл не похож на Lottie-анимацию');
        return;
      }
      setFile(f);
      setPreviewAnimation(json);
    } catch {
      toast.error('Невалидный JSON-файл');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(FILE_PATH, file, {
          upsert: true,
          cacheControl: '0',
          contentType: 'application/json',
        });
      if (error) throw error;
      toast.success('Прелоадер успешно обновлён');
      setFile(null);
      setPreviewAnimation(null);
      await loadCurrent();
    } catch (err: any) {
      toast.error('Ошибка загрузки: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить кастомный прелоадер? Будет использоваться стандартный.')) return;
    setUploading(true);
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([FILE_PATH]);
      if (error) throw error;
      toast.success('Кастомный прелоадер удалён');
      setCustomAnimation(null);
      setIsCustom(false);
    } catch (err: any) {
      toast.error('Ошибка: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const displayAnimation = isCustom && customAnimation ? customAnimation : defaultPreloaderAnimation;

  return (
    <AdminLayout title="Прелоадер">
      <div className="max-w-2xl space-y-6">
        {/* Enable/Disable toggle */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Power className="w-5 h-5" />
              <div>
                <h3 className="font-semibold">Прелоадер</h3>
                <p className="text-sm text-muted-foreground">
                  {enabled ? 'Прелоадер включён — показывается при загрузке' : 'Прелоадер выключен — приложение загружается сразу'}
                </p>
              </div>
            </div>
            {canManage ? (
              <Switch
                checked={enabled}
                onCheckedChange={(val) => {
                  setEnabled(val);
                  saveConfig(duration, val);
                }}
              />
            ) : (
              <span className="text-sm text-muted-foreground">{enabled ? 'Вкл' : 'Выкл'}</span>
            )}
          </div>
        </Card>

        {/* Current preloader */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Текущий прелоадер
            {!isCustom && (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">стандартный</span>
            )}
            {isCustom && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">кастомный</span>
            )}
          </h3>
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="preloader-preview-bg rounded-lg flex items-center justify-center p-4 min-h-[200px]">
              <Lottie
                animationData={displayAnimation}
                loop
                autoplay
                style={{ width: 240, height: 240 }}
              />
            </div>
          )}
          {isCustom && canManage && (
            <Button
              variant="destructive"
              size="sm"
              className="mt-3"
              onClick={handleDelete}
              disabled={uploading}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Удалить кастомный
            </Button>
          )}
        </Card>

        {/* Duration setting */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Длительность показа
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Минимальное время показа прелоадера перед загрузкой приложения.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Slider
                value={[duration]}
                onValueChange={([v]) => setDuration(v)}
                min={1}
                max={10}
                step={0.5}
                className="flex-1"
                disabled={!canManage}
              />
              <span className="text-lg font-semibold w-16 text-right">{duration} сек</span>
            </div>
            {canManage && (
              <Button
                onClick={() => saveConfig(duration)}
                disabled={duration === savedDuration}
                size="sm"
              >
                Сохранить
              </Button>
            )}
          </div>
        </Card>

        {/* Live Demo */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Play className="w-5 h-5" />
            Предпросмотр с таймером
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Посмотрите как прелоадер будет выглядеть с текущей длительностью ({duration} сек).
          </p>

          {isDemoing ? (
            <div className="space-y-4">
              <div className="bg-[#FAF9F6] rounded-lg flex items-center justify-center min-h-[300px] relative overflow-hidden">
                <Lottie
                  animationData={displayAnimation}
                  loop
                  autoplay
                  className="w-full h-full max-h-[300px]"
                />
              </div>
              <Progress value={demoProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {Math.ceil(duration - (demoProgress / 100) * duration)} сек. осталось
              </p>
            </div>
          ) : (
            <Button onClick={startDemo} variant="outline">
              <Play className="w-4 h-4 mr-2" />
              Запустить демо ({duration} сек)
            </Button>
          )}
        </Card>

        {/* Upload new */}
        {canManage && (
          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Загрузить новый прелоадер
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Поддерживается <strong>только формат Lottie (.json)</strong>. Экспортируйте анимацию из After Effects через плагин Bodymovin или скачайте с LottieFiles.
            </p>

            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="hidden"
            />

            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              Выбрать .json файл
            </Button>

            {previewAnimation && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium">Предпросмотр:</p>
                <div className="bg-[#FAF9F6] rounded-lg flex items-center justify-center p-4 min-h-[200px]">
                  <Lottie
                    animationData={previewAnimation}
                    loop
                    autoplay
                    className="max-h-[300px] max-w-full"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleUpload} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Загрузка...
                      </>
                    ) : (
                      'Сохранить'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setFile(null);
                      setPreviewAnimation(null);
                    }}
                    disabled={uploading}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
