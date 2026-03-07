import { useState, useRef, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Trash2, Loader2, Eye } from 'lucide-react';

const BUCKET = 'app-assets';
const FILE_PATH = 'preloader.gif';

export default function AdminPreloaderPage() {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCurrent();
  }, []);

  const loadCurrent = async () => {
    setLoading(true);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(FILE_PATH);
    // Check if file actually exists by trying to fetch it
    try {
      const res = await fetch(data.publicUrl, { method: 'HEAD' });
      if (res.ok) {
        setCurrentUrl(data.publicUrl + '?t=' + Date.now());
      } else {
        setCurrentUrl(null);
      }
    } catch {
      setCurrentUrl(null);
    }
    setLoading(false);
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
    if (!confirm('Удалить текущий прелоадер? Будет использоваться стандартный.')) return;
    setUploading(true);
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([FILE_PATH]);
      if (error) throw error;
      toast.success('Прелоадер удалён');
      setCurrentUrl(null);
    } catch (err: any) {
      toast.error('Ошибка: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <AdminLayout title="Прелоадер">
      <div className="max-w-2xl space-y-6">
        {/* Current preloader */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Текущий прелоадер
          </h3>
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : currentUrl ? (
            <div className="bg-[#FAF9F6] rounded-lg flex items-center justify-center p-4 min-h-[200px]">
              <img
                src={currentUrl}
                alt="Current preloader"
                className="max-h-[300px] max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="bg-muted rounded-lg flex items-center justify-center h-48 text-muted-foreground text-sm">
              Не загружен (используется стандартный)
            </div>
          )}
          {currentUrl && (
            <Button
              variant="destructive"
              size="sm"
              className="mt-3"
              onClick={handleDelete}
              disabled={uploading}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Удалить
            </Button>
          )}
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
