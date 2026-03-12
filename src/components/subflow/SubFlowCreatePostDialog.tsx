import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, Image, MapPin, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { compressImage, getFileExtension, formatFileSize } from '@/utils/imageCompression';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Shop {
  id: string;
  name: string;
}

interface SubFlowCreatePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPostCreated: () => void;
}

const MAX_IMAGES = 5;

export function SubFlowCreatePostDialog({ open, onOpenChange, onPostCreated }: SubFlowCreatePostDialogProps) {
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
  const { t } = useLanguage();

  useEffect(() => {
    if (open) {
      fetchShops();
    }
  }, [open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setContent('');
      setSelectedShop(null);
      setShowShopPicker(false);
      setImageFiles([]);
      setImagePreviews(prev => {
        prev.forEach(url => URL.revokeObjectURL(url));
        return [];
      });
      setIsCompressing(false);
      setCompressionProgress(0);
    }
  }, [open]);

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

    const validFiles: File[] = [];
    for (const file of files.slice(0, remainingSlots)) {
      if (!file.type.startsWith('image/')) {
        toast.error(t('subflow.selectImage'));
        continue;
      }
      if (file.size > 15 * 1024 * 1024) {
        toast.error(t('subflow.fileTooLarge'));
        continue;
      }
      validFiles.push(file);
    }

    if (!validFiles.length) return;

    setIsCompressing(true);
    setCompressionProgress(0);

    const compressedBlobs: Blob[] = [];
    const newPreviews: string[] = [];

    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const { blob } = await compressImage(file, { maxWidth: 1200, quality: 0.75 });
        console.log(`Compressed: ${formatFileSize(file.size)} → ${formatFileSize(blob.size)}`);
        compressedBlobs.push(blob);
        newPreviews.push(URL.createObjectURL(blob));
        setCompressionProgress(Math.round(((i + 1) / validFiles.length) * 100));
      }
      setImageFiles(prev => [...prev, ...compressedBlobs]);
      setImagePreviews(prev => [...prev, ...newPreviews]);
    } catch (error) {
      console.error('Compression error:', error);
      toast.error(t('subflow.compressionError'));
    } finally {
      setIsCompressing(false);
      setCompressionProgress(0);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
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
      toast.error(t('subflow.writeText'));
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const imageUrls: string[] = [];

      for (const imageBlob of imageFiles) {
        const fileExt = getFileExtension(imageBlob);
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('subflow-images')
          .upload(fileName, imageBlob, {
            contentType: imageBlob.type,
            cacheControl: '31536000',
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('subflow-images')
          .getPublicUrl(fileName);

        imageUrls.push(publicUrl);
      }

      const { error: postError, data: postData } = await supabase
        .from('subflow_posts')
        .insert({
          user_id: user.id,
          content: content.trim(),
          image_url: imageUrls[0] || null,
          image_urls: imageUrls,
          shop_id: selectedShop?.id || null,
          shop_name: selectedShop?.name || null,
        })
        .select('id')
        .single();

      if (postError) throw postError;

      // Fire-and-forget notification to followers
      if (postData?.id) {
        supabase.functions.invoke('subflow-notify', {
          body: { type: 'new_post', postId: postData.id, actorId: user.id }
        }).catch(() => {});
      }

      toast.success(t('subflow.posted'));
      onPostCreated();
    } catch (error) {
      console.error('Post error:', error);
      toast.error(t('subflow.postError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] rounded-2xl p-0 gap-0 border-border/50 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/30 shrink-0">
          <DialogTitle className="text-lg font-bold text-foreground text-center">
            {t('subflow.newPost')}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Content input */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('subflow.placeholder')}
            rows={4}
            autoFocus
            className="w-full px-4 py-3 bg-secondary/50 border border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all text-[16px]"
          />

          {/* Compression progress */}
          {isCompressing && (
            <div className="p-3 bg-secondary/50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">{t('subflow.compressing')}</span>
                <span className="text-sm text-muted-foreground">{compressionProgress}%</span>
              </div>
              <Progress value={compressionProgress} className="h-2" />
            </div>
          )}

          {/* Image previews */}
          {imagePreviews.length > 0 && (
            <div>
              <div className={`grid gap-2 ${imagePreviews.length === 1 ? 'grid-cols-1' : imagePreviews.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative aspect-square">
                    <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover rounded-xl" />
                    <button
                      onClick={() => removeImage(index)}
                      disabled={isCompressing}
                      className="absolute top-1.5 right-1.5 p-1 bg-foreground/60 rounded-full text-background disabled:opacity-50 hover:bg-foreground/80 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {imageFiles.length < MAX_IMAGES && !isCompressing && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-border/60 rounded-xl flex items-center justify-center text-muted-foreground hover:border-accent hover:text-accent transition-colors"
                  >
                    <Plus size={24} />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                {imageFiles.length}/{MAX_IMAGES} фото
              </p>
            </div>
          )}

          {/* Shop tag */}
          {selectedShop && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm">
                <MapPin size={14} />
                {selectedShop.name}
                <button onClick={() => setSelectedShop(null)} className="ml-1 hover:opacity-70 transition-opacity">
                  <X size={14} />
                </button>
              </span>
            </div>
          )}

          {/* Shop picker */}
          {showShopPicker && (
            <div className="p-2 bg-secondary/50 rounded-xl max-h-36 overflow-y-auto border border-border/30">
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
        </div>

        {/* Bottom actions bar */}
        <div className="px-5 py-4 border-t border-border/30 flex items-center gap-2 shrink-0 bg-background">
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
            className="flex flex-col items-center gap-0.5 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors"
          >
            <Image size={20} />
            <span className="text-[10px]">{t('subflow.hintPhoto')}</span>
          </button>
          <button
            onClick={() => setShowShopPicker(!showShopPicker)}
            className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-colors ${selectedShop ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
          >
            <MapPin size={20} />
            <span className="text-[10px]">{t('subflow.hintLocation')}</span>
          </button>
          <div className="flex-1" />
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isCompressing || !content.trim()}
            className="btn-accent rounded-xl px-6"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              t('subflow.publish')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
