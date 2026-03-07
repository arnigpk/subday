import { useState, useRef, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Trash2, Loader2, Eye, Clock, Power } from 'lucide-react';
import defaultPreloader from '@/assets/preloader.gif';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

const BUCKET = 'app-assets';
const FILE_PATH = 'preloader.gif';
const CONFIG_PATH = 'preloader-config.json';

export default function AdminPreloaderPage() {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(2);
  const [savedDuration, setSavedDuration] = useState(2);
  const [enabled, setEnabled] = useState(true);
  const [savedEnabled, setSavedEnabled] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCurrent();
    loadConfig();
  }, []);

  const loadCurrent = async () => {
    setLoading(true);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(FILE_PATH);
    try {
      const res = await fetch(data.publicUrl, { method: 'HEAD' });
      if (res.ok) {
        setCurrentUrl(data.publicUrl + '?t=' + Date.now());
        setIsCustom(true);
      } else {
        setCurrentUrl(null);
        setIsCustom(false);
      }
    } catch {
      setCurrentUrl(null);
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

  const saveConfig = async (newDuration: number) => {
    try {
      const blob = new Blob([JSON.stringify({ duration: newDuration })], { type: 'application/json' });
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(CONFIG_PATH, blob, { upsert: true, cacheControl: '0' });
      if (error) throw error;
      setSavedDuration(newDuration);
      toast.success(`Длительность прелоадера: ${newDuration} сек.`);
    } catch (err: any) {
      toast.error('Ошибка сохранения: ' + err.message);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Выберите файл изображения (GIF, PNG, WEBP)');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(FILE_PATH, file, { upsert: true, cacheControl: '0' });
      if (error) throw error;
      toast.success('Прелоадер успешно обновлён');
      setFile(null);
      setPreview(null);
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
      setCurrentUrl(null);
      setIsCustom(false);
    } catch (err: any) {
      toast.error('Ошибка: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = isCustom ? currentUrl : defaultPreloader;

  return (
    <AdminLayout title="Прелоадер">
      <div className="max-w-2xl space-y-6">
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
          ) : displayUrl ? (
            <div className="bg-[#FAF9F6] rounded-lg flex items-center justify-center p-4 min-h-[200px]">
              <img
                src={displayUrl}
                alt="Current preloader"
                className="max-h-[300px] max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="bg-muted rounded-lg flex items-center justify-center h-48 text-muted-foreground text-sm">
              Не удалось загрузить
            </div>
          )}
          {isCustom && (
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
              />
              <span className="text-lg font-semibold w-16 text-right">{duration} сек</span>
            </div>
            <Button
              onClick={() => saveConfig(duration)}
              disabled={duration === savedDuration}
              size="sm"
            >
              Сохранить
            </Button>
          </div>
        </Card>

        {/* Upload new */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Загрузить новый прелоадер
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Рекомендуется GIF-анимация. Поддерживаются форматы: GIF, PNG, WEBP.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            Выбрать файл
          </Button>

          {preview && (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium">Предпросмотр:</p>
              <div className="bg-[#FAF9F6] rounded-lg flex items-center justify-center p-4 min-h-[200px]">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-[300px] max-w-full object-contain"
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
                    setPreview(null);
                  }}
                  disabled={uploading}
                >
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
