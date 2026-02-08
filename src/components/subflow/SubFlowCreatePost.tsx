import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, Image, MapPin, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { compressImage, getFileExtension, formatFileSize } from '@/utils/imageCompression';

interface Shop {
  id: string;
  name: string;
}

interface SubFlowCreatePostProps {
  onClose: () => void;
  onPostCreated: () => void;
}

const MAX_IMAGES = 5;

export function SubFlowCreatePost({ onClose, onPostCreated }: SubFlowCreatePostProps) {
  const [content, setContent] = useState('');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [showShopPicker, setShowShopPicker] = useState(false);
  const [imageFiles, setImageFiles] = useState<Blob[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    const { data } = await supabase
      .from('shops')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order');
    
    setShops(data || []);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = MAX_IMAGES - imageFiles.length;
    if (remainingSlots <= 0) {
      toast.error(`Максимум ${MAX_IMAGES} фото`);
      return;
    }

    // Filter valid files first
    const validFiles: File[] = [];
    for (const file of files.slice(0, remainingSlots)) {
      if (!file.type.startsWith('image/')) {
        toast.error('Выберите изображение');
        continue;
      }

      if (file.size > 15 * 1024 * 1024) {
        toast.error('Максимум 15МБ на фото');
        continue;
      }

      validFiles.push(file);
    }

    if (!validFiles.length) return;

    // Compress images
    setIsCompressing(true);
    setCompressionProgress(0);
    
    const compressedBlobs: Blob[] = [];
    const newPreviews: string[] = [];
    
    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const originalSize = file.size;
        
        const { blob } = await compressImage(file, {
          maxWidth: 1200,
          quality: 0.75
        });
        
        const compressedSize = blob.size;
        console.log(`Compressed: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}`);
        
        compressedBlobs.push(blob);
        newPreviews.push(URL.createObjectURL(blob));
        setCompressionProgress(Math.round(((i + 1) / validFiles.length) * 100));
      }
      
      setImageFiles(prev => [...prev, ...compressedBlobs]);
      setImagePreviews(prev => [...prev, ...newPreviews]);
    } catch (error) {
      console.error('Compression error:', error);
      toast.error('Ошибка обработки изображения');
    } finally {
      setIsCompressing(false);
      setCompressionProgress(0);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error('Напишите что-нибудь');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const imageUrls: string[] = [];

      // Upload all compressed images
      for (const imageBlob of imageFiles) {
        const fileExt = getFileExtension(imageBlob);
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('subflow-images')
          .upload(fileName, imageBlob, {
            contentType: imageBlob.type,
            cacheControl: '31536000' // 1 year cache
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('subflow-images')
          .getPublicUrl(fileName);

        imageUrls.push(publicUrl);
      }

      // Create post with image_urls array
      const { error: postError } = await supabase
        .from('subflow_posts')
        .insert({
          user_id: user.id,
          content: content.trim(),
          image_url: imageUrls[0] || null, // Keep for backward compatibility
          image_urls: imageUrls,
          shop_id: selectedShop?.id || null,
          shop_name: selectedShop?.name || null,
        });

      if (postError) throw postError;

      toast.success('Пост опубликован!');
      onPostCreated();
    } catch (error) {
      console.error('Post error:', error);
      toast.error('Ошибка публикации');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card-static mb-4 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg text-foreground">Новый пост ✨</h2>
        <button onClick={onClose} className="p-1.5 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Content input */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Какой кофе сегодня? Расскажи! ☕"
        rows={3}
        className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-accent mb-3 transition-all"
      />

      {/* Compression progress */}
      {isCompressing && (
        <div className="mb-3 p-3 bg-secondary rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-foreground">Сжатие фото...</span>
            <span className="text-sm text-muted-foreground">{compressionProgress}%</span>
          </div>
          <Progress value={compressionProgress} className="h-2" />
        </div>
      )}

      {/* Image previews */}
      {imagePreviews.length > 0 && (
        <div className="mb-3">
          <div className={`grid gap-2 ${imagePreviews.length === 1 ? 'grid-cols-1' : imagePreviews.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {imagePreviews.map((preview, index) => (
              <div key={index} className="relative aspect-square">
                <img
                  src={preview}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-full object-cover rounded-xl"
                />
                <button
                  onClick={() => removeImage(index)}
                  disabled={isCompressing}
                  className="absolute top-1 right-1 p-1 bg-foreground/50 rounded-full text-background disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {imageFiles.length < MAX_IMAGES && !isCompressing && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square border-2 border-dashed border-border rounded-xl flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus size={24} />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-center">
            {imageFiles.length}/{MAX_IMAGES} фото
          </p>
        </div>
      )}

      {/* Shop tag */}
      {selectedShop && (
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
            <MapPin size={14} />
            {selectedShop.name}
            <button onClick={() => setSelectedShop(null)} className="ml-1">
              <X size={14} />
            </button>
          </span>
        </div>
      )}

      {/* Shop picker */}
      {showShopPicker && (
        <div className="mb-3 p-2 bg-secondary rounded-xl max-h-40 overflow-y-auto">
          {shops.map(shop => (
            <button
              key={shop.id}
              onClick={() => {
                setSelectedShop(shop);
                setShowShopPicker(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-background rounded-lg transition-colors"
            >
              {shop.name}
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <Image size={22} />
        </button>
        <button
          onClick={() => setShowShopPicker(!showShopPicker)}
          className={`p-2 rounded-lg transition-colors ${selectedShop ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
        >
          <MapPin size={22} />
        </button>
        <div className="flex-1" />
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || isCompressing || !content.trim()}
          className="btn-primary"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Опубликовать'
          )}
        </Button>
      </div>
    </div>
  );
}
