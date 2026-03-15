import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, Image, MapPin, Loader2, Plus, Play, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { compressImage, getFileExtension, formatFileSize, getVideoDuration } from '@/utils/imageCompression';
import { uploadWithProgress } from '@/utils/xhrUpload';
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

interface MediaFile {
  blob: Blob;
  preview: string;
  type: 'image' | 'video';
}

const MAX_MEDIA = 5;
const MAX_VIDEO_DURATION = 30;

const ROTATING_PLACEHOLDERS = [
  'Сохрани этот момент здесь',
  'Начни новый пост',
  'Что происходит вокруг тебя сейчас?',
  'Добавь новый след дня..',
  'Что происходит прямо сейчас?',
  'Этот момент стоит сохранить',
  'Этот момент — твой!',
  'Этот момент начинается здесь...',
];

let placeholderIndex = 0;

export function SubFlowCreatePostDialog({ open, onOpenChange, onPostCreated }: SubFlowCreatePostDialogProps) {
  const [content, setContent] = useState('');
  const [placeholder, setPlaceholder] = useState('');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [showShopPicker, setShowShopPicker] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const shopPickerRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (open) {
      fetchShops();
      setPlaceholder(ROTATING_PLACEHOLDERS[placeholderIndex % ROTATING_PLACEHOLDERS.length]);
      placeholderIndex++;
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setContent('');
      setSelectedShop(null);
      setShowShopPicker(false);
      setMediaFiles(prev => {
        prev.forEach(m => URL.revokeObjectURL(m.preview));
        return [];
      });
      setIsCompressing(false);
      setCompressionProgress(0);
    }
  }, [open]);

  useEffect(() => {
    if (!showShopPicker) return;
    const container = contentScrollRef.current;
    if (!container) return;
    const previousOverflowY = container.style.overflowY;
    const previousTouchAction = container.style.touchAction;
    container.style.overflowY = 'hidden';
    container.style.touchAction = 'none';
    return () => {
      container.style.overflowY = previousOverflowY;
      container.style.touchAction = previousTouchAction;
    };
  }, [showShopPicker]);

  useEffect(() => {
    if (!showShopPicker) return;
    const picker = shopPickerRef.current;
    if (!picker) return;
    let touchStartY = 0;
    const handleTouchStart = (event: TouchEvent) => { touchStartY = event.touches[0]?.clientY ?? 0; };
    const handleTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY ?? touchStartY;
      const deltaY = currentY - touchStartY;
      const isAtTop = picker.scrollTop <= 0;
      const isAtBottom = Math.ceil(picker.scrollTop + picker.clientHeight) >= picker.scrollHeight;
      if ((isAtTop && deltaY > 0) || (isAtBottom && deltaY < 0)) event.preventDefault();
      event.stopPropagation();
    };
    picker.addEventListener('touchstart', handleTouchStart, { passive: true });
    picker.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      picker.removeEventListener('touchstart', handleTouchStart);
      picker.removeEventListener('touchmove', handleTouchMove);
    };
  }, [showShopPicker]);

  const fetchShops = async () => {
    const { data } = await supabase.from('shops').select('id, name').eq('is_active', true).order('sort_order');
    setShops(data || []);
  };

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = MAX_MEDIA - mediaFiles.length;
    if (remainingSlots <= 0) {
      toast.error(`Максимум ${MAX_MEDIA} медиа`);
      return;
    }

    setIsCompressing(true);
    setCompressionProgress(0);

    const newMedia: MediaFile[] = [];
    const filesToProcess = files.slice(0, remainingSlots);

    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];

        if (file.type.startsWith('video/')) {
          try {
            const duration = await getVideoDuration(file);
            if (duration > MAX_VIDEO_DURATION) {
              toast.error(t('subflow.videoTooLong'));
              continue;
            }
          } catch {
            toast.error('Не удалось прочитать видео');
            continue;
          }
          newMedia.push({
            blob: file,
            preview: URL.createObjectURL(file),
            type: 'video',
          });
        } else if (file.type.startsWith('image/')) {
          const { blob } = await compressImage(file, { maxWidth: 1200, quality: 0.75 });
          console.log(`Compressed: ${formatFileSize(file.size)} → ${formatFileSize(blob.size)}`);
          newMedia.push({
            blob,
            preview: URL.createObjectURL(blob),
            type: 'image',
          });
        } else {
          toast.error(t('subflow.selectImage'));
          continue;
        }

        setCompressionProgress(Math.round(((i + 1) / filesToProcess.length) * 100));
      }

      setMediaFiles(prev => [...prev, ...newMedia]);
    } catch (error) {
      console.error('Media processing error:', error);
      toast.error(t('subflow.compressionError'));
    } finally {
      setIsCompressing(false);
      setCompressionProgress(0);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const CAPTION_STYLES = [
    { id: 'fun', label: 'Весёлый', prompt: 'Пиши весело, с юмором и лёгкостью.' },
    { id: 'minimal', label: 'Минималистичный', prompt: 'Пиши очень коротко, лаконично, одно предложение максимум.' },
    { id: 'info', label: 'Информативный', prompt: 'Пиши информативно, опиши что происходит на фото.' },
  ];

  const handleAiCaption = async (styleId: string) => {
    setShowStylePicker(false);
    const firstImage = mediaFiles.find(m => m.type === 'image');
    if (!firstImage) return;

    const style = CAPTION_STYLES.find(s => s.id === styleId);
    setIsGeneratingCaption(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(firstImage.blob);
      });

      const { data, error } = await supabase.functions.invoke('subflow-ai-caption', {
        body: { image: base64, style: style?.prompt || '' },
      });

      if (error) throw error;
      if (data?.caption) {
        setContent(prev => prev ? `${prev}\n${data.caption}` : data.caption);
        toast.success('Текст сгенерирован ✨');
      }
    } catch (err) {
      console.error('AI caption error:', err);
      toast.error('Не удалось сгенерировать текст');
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error(t('subflow.writeText'));
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const mediaUrls: string[] = [];
      const totalBytes = mediaFiles.reduce((sum, m) => sum + m.blob.size, 0);
      let uploadedBytes = 0;

      for (let i = 0; i < mediaFiles.length; i++) {
        const media = mediaFiles[i];
        const fileExt = getFileExtension(media.blob);
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const mediaSizeBefore = uploadedBytes;

        const { publicUrl } = await uploadWithProgress({
          bucket: 'subflow-images',
          path: fileName,
          blob: media.blob,
          contentType: media.blob.type,
          onProgress: (_percent, loaded) => {
            const currentTotal = mediaSizeBefore + loaded;
            const overallPercent = totalBytes > 0 
              ? Math.round((currentTotal / totalBytes) * 95)
              : Math.round(((i + 1) / (mediaFiles.length + 1)) * 100);
            setUploadProgress(Math.min(overallPercent, 95));
          },
        });

        uploadedBytes += media.blob.size;
        mediaUrls.push(publicUrl);
      }

      setUploadProgress(96);
      const { error: postError, data: postData } = await supabase
        .from('subflow_posts')
        .insert({
          user_id: user.id,
          content: content.trim(),
          image_url: mediaUrls[0] || null,
          image_urls: mediaUrls,
          shop_id: selectedShop?.id || null,
          shop_name: selectedShop?.name || null,
        })
        .select('id')
        .single();

      if (postError) throw postError;

      if (postData?.id) {
        supabase.functions.invoke('subflow-notify', {
          body: { type: 'new_post', postId: postData.id, actorId: user.id }
        }).catch(() => {});
      }

      setUploadProgress(100);
      toast.success(t('subflow.posted'));
      onPostCreated();
    } catch (error) {
      console.error('Post error:', error);
      toast.error(t('subflow.postError'));
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[calc(100%-1rem)] rounded-2xl p-0 gap-0 border-border/50 max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/30 shrink-0">
          <DialogTitle className="text-lg font-bold text-foreground text-center">
            {t('subflow.newPost')}
          </DialogTitle>
        </DialogHeader>

        <div ref={contentScrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            rows={4}
            autoFocus
            className="w-full px-4 py-3 bg-secondary/50 border border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all text-[16px]"
          />

          {isCompressing && (
            <div className="p-3 bg-secondary/50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">{t('subflow.compressing')}</span>
                <span className="text-sm text-muted-foreground">{compressionProgress}%</span>
              </div>
              <Progress value={compressionProgress} className="h-2" />
            </div>
          )}

          {mediaFiles.length > 0 && (
            <div>
              <div className={`grid gap-2 ${mediaFiles.length === 1 ? 'grid-cols-1' : mediaFiles.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {mediaFiles.map((media, index) => (
                  <div key={index} className="relative aspect-square">
                    {media.type === 'video' ? (
                      <div className="w-full h-full rounded-xl bg-black flex items-center justify-center overflow-hidden">
                        <video
                          src={media.preview}
                          className="w-full h-full object-cover rounded-xl"
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Play size={32} className="text-white/80" fill="white" />
                        </div>
                      </div>
                    ) : (
                      <img src={media.preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover rounded-xl" />
                    )}
                    <button
                      onClick={() => removeMedia(index)}
                      disabled={isCompressing}
                      className="absolute top-1.5 right-1.5 p-1 bg-foreground/60 rounded-full text-background disabled:opacity-50 hover:bg-foreground/80 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {mediaFiles.length < MAX_MEDIA && !isCompressing && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-border/60 rounded-xl flex items-center justify-center text-muted-foreground hover:border-accent hover:text-accent transition-colors"
                  >
                    <Plus size={24} />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                {mediaFiles.length}/{MAX_MEDIA} медиа
              </p>
            </div>
          )}

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

          {showShopPicker && (
            <div
              ref={shopPickerRef}
              onWheel={(event) => event.stopPropagation()}
              className="p-2 bg-secondary/50 rounded-xl max-h-48 overflow-y-auto border border-border/30 overscroll-contain touch-pan-y"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {shops.map(shop => (
                <button
                  key={shop.id}
                  onClick={() => { setSelectedShop(shop); setShowShopPicker(false); }}
                  className="w-full text-left px-3 py-2.5 text-sm text-foreground hover:bg-background rounded-lg transition-colors"
                >
                  {shop.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 sm:px-5 py-3 sm:py-4 border-t border-border/30 flex items-center gap-1 sm:gap-2 shrink-0 bg-background">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={handleMediaSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-0.5 p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors min-w-[44px]"
          >
            <Image size={18} className="sm:w-5 sm:h-5" />
            <span className="text-[9px] sm:text-[10px] whitespace-nowrap">{t('subflow.hintPhoto')}</span>
          </button>
          <button
            onClick={() => setShowShopPicker(!showShopPicker)}
            className={`flex flex-col items-center gap-0.5 p-1.5 sm:p-2 rounded-xl transition-colors min-w-[44px] ${selectedShop ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
          >
            <MapPin size={18} className="sm:w-5 sm:h-5" />
            <span className="text-[9px] sm:text-[10px] whitespace-nowrap">{t('subflow.hintLocation')}</span>
          </button>
          <div className="relative">
            <button
              onClick={() => {
                if (mediaFiles.some(m => m.type === 'image') && !isGeneratingCaption) {
                  setShowStylePicker(!showStylePicker);
                }
              }}
              disabled={!mediaFiles.some(m => m.type === 'image') || isGeneratingCaption || isSubmitting}
              className={`flex flex-col items-center gap-0.5 p-1.5 sm:p-2 rounded-xl transition-colors min-w-[44px] ${
                mediaFiles.some(m => m.type === 'image') && !isGeneratingCaption
                  ? 'text-accent hover:bg-accent/10'
                  : 'text-muted-foreground/40'
              }`}
            >
              {isGeneratingCaption ? <Loader2 size={18} className="animate-spin sm:w-5 sm:h-5" /> : <Wand2 size={18} className="sm:w-5 sm:h-5" />}
              <span className="text-[9px] sm:text-[10px]">AI</span>
            </button>
            {showStylePicker && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 mb-2 p-1.5 bg-card border border-border rounded-xl shadow-lg min-w-[170px] z-50 animate-slide-up">
                {CAPTION_STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => handleAiCaption(style.id)}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {isSubmitting && (
            <div className="flex-1 flex items-center gap-1.5 mx-1">
              <Progress value={uploadProgress} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{uploadProgress}%</span>
            </div>
          )}
          {!isSubmitting && <div className="flex-1" />}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isCompressing || !content.trim()}
            className="btn-accent rounded-xl px-4 sm:px-6 text-sm shrink-0"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('subflow.publish')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
