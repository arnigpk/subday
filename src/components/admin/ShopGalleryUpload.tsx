import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowUpTrayIcon, XMarkIcon, Bars3Icon } from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';;
import { toast } from '@/hooks/use-toast';
import { compressImage, getFileExtension } from '@/utils/imageCompression';

interface ShopGalleryUploadProps {
  currentGalleryUrls: string[];
  onGalleryChange: (urls: string[]) => void;
  shopId?: string;
  maxImages?: number;
  maxSizeMb?: number;
}

export function ShopGalleryUpload({
  currentGalleryUrls,
  onGalleryChange,
  shopId,
  maxImages = 4,
  maxSizeMb = 15,
}: ShopGalleryUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [galleryUrls, setGalleryUrls] = useState<string[]>(currentGalleryUrls);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = maxImages - galleryUrls.length;
    if (remainingSlots <= 0) {
      toast({ title: `Максимум ${maxImages} фото`, variant: 'destructive' });
      return;
    }

    const filesToUpload = files.slice(0, remainingSlots);
    setIsUploading(true);

    try {
      const newUrls: string[] = [];

      for (const file of filesToUpload) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast({ title: 'Выберите изображение', variant: 'destructive' });
          continue;
        }

        // Validate file size
        const maxSizeBytes = maxSizeMb * 1024 * 1024;
        if (file.size > maxSizeBytes) {
          toast({ title: `Максимальный размер файла ${maxSizeMb}MB`, variant: 'destructive' });
          continue;
        }

        // Compress image
        const { blob } = await compressImage(file, {
          maxWidth: 1200,
          quality: 0.8,
        });

        // Create unique filename
        const fileExt = getFileExtension(blob);
        const fileName = `${shopId || 'new'}-gallery-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `gallery/${fileName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('shop-logos')
          .upload(filePath, blob, { 
            upsert: true,
            contentType: blob.type,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('shop-logos')
          .getPublicUrl(filePath);

        newUrls.push(publicUrl);
      }

      const updatedUrls = [...galleryUrls, ...newUrls];
      setGalleryUrls(updatedUrls);
      onGalleryChange(updatedUrls);
      toast({ title: `${newUrls.length} фото загружено` });
    } catch (error) {
      console.error('Error uploading gallery:', error);
      toast({ title: 'Ошибка загрузки', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    const updatedUrls = galleryUrls.filter((_, i) => i !== index);
    setGalleryUrls(updatedUrls);
    onGalleryChange(updatedUrls);
  };

  const handleMoveImage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= galleryUrls.length) return;
    const updatedUrls = [...galleryUrls];
    const [movedItem] = updatedUrls.splice(fromIndex, 1);
    updatedUrls.splice(toIndex, 0, movedItem);
    setGalleryUrls(updatedUrls);
    onGalleryChange(updatedUrls);
  };

  return (
    <div className="space-y-3">
      <Label>Фотогалерея (до {maxImages} фото)</Label>
      <p className="text-xs text-muted-foreground">
        Первое фото будет показываться как аватар кофейни
      </p>
      
      {/* Gallery preview */}
      {galleryUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {galleryUrls.map((url, index) => (
            <div key={index} className="relative group">
              <img
                src={url}
                alt={`Галерея ${index + 1}`}
                className={`w-full aspect-video rounded-lg object-cover border ${
                  index === 0 ? 'ring-2 ring-primary' : ''
                }`}
              />
              {index === 0 && (
                <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-medium rounded">
                  Главное
                </span>
              )}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => handleMoveImage(index, index - 1)}
                    className="w-6 h-6 bg-background/80 rounded flex items-center justify-center hover:bg-background"
                  >
                    <Bars3Icon className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  className="w-6 h-6 bg-destructive text-destructive-foreground rounded flex items-center justify-center"
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {galleryUrls.length < maxImages && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            id="gallery-upload"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Загрузка...
              </>
            ) : (
              <>
                <ArrowUpTrayIcon className="w-4 h-4 mr-2" />
                Добавить фото ({galleryUrls.length}/{maxImages})
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-1">До {maxSizeMb} МБ на файл</p>
        </div>
      )}
    </div>
  );
}
