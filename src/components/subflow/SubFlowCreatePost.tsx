import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, Image, MapPin, Loader2, Plus, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { compressImage, getFileExtension, formatFileSize, getVideoDuration } from '@/utils/imageCompression';
import { useLanguage } from '@/contexts/LanguageContext';

interface Shop {
  id: string;
  name: string;
}

interface SubFlowCreatePostProps {
  onClose: () => void;
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

export function SubFlowCreatePost({ onClose, onPostCreated }: SubFlowCreatePostProps) {
  const [content, setContent] = useState('');
  const [placeholder] = useState(() => {
    const text = ROTATING_PLACEHOLDERS[placeholderIndex % ROTATING_PLACEHOLDERS.length];
    placeholderIndex++;
    return text;
  });
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [showShopPicker, setShowShopPicker] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    fetchShops();
  }, []);

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
          if (file.size > 50 * 1024 * 1024) {
            toast.error(t('subflow.videoTooLargeFile'));
            continue;
          }
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
          newMedia.push({ blob: file, preview: URL.createObjectURL(file), type: 'video' });
        } else if (file.type.startsWith('image/')) {
          if (file.size > 15 * 1024 * 1024) {
            toast.error(t('subflow.fileTooLarge'));
            continue;
          }
          const { blob } = await compressImage(file, { maxWidth: 1200, quality: 0.75 });
          console.log(`Compressed: ${formatFileSize(file.size)} → ${formatFileSize(blob.size)}`);
          newMedia.push({ blob, preview: URL.createObjectURL(blob), type: 'image' });
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
      const totalSteps = mediaFiles.length + 1;

      for (let i = 0; i < mediaFiles.length; i++) {
        const media = mediaFiles[i];
        const fileExt = getFileExtension(media.blob);
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('subflow-images')
          .upload(fileName, media.blob, {
            contentType: media.blob.type,
            cacheControl: '31536000'
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('subflow-images')
          .getPublicUrl(fileName);

        mediaUrls.push(publicUrl);
      }

      const { error: postError } = await supabase
        .from('subflow_posts')
        .insert({
          user_id: user.id,
          content: content.trim(),
          image_url: mediaUrls[0] || null,
          image_urls: mediaUrls,
          shop_id: selectedShop?.id || null,
          shop_name: selectedShop?.name || null,
        });

      if (postError) throw postError;

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
    <div className="card-static mb-4 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg text-foreground">{t('subflow.newPost')}</h2>
        <button onClick={onClose} className="p-1.5 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
          <X size={18} />
        </button>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-accent mb-3 transition-all"
      />

      {isCompressing && (
        <div className="mb-3 p-3 bg-secondary rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-foreground">{t('subflow.compressing')}</span>
            <span className="text-sm text-muted-foreground">{compressionProgress}%</span>
          </div>
          <Progress value={compressionProgress} className="h-2" />
        </div>
      )}

      {mediaFiles.length > 0 && (
        <div className="mb-3">
          <div className={`grid gap-2 ${mediaFiles.length === 1 ? 'grid-cols-1' : mediaFiles.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {mediaFiles.map((media, index) => (
              <div key={index} className="relative aspect-square">
                {media.type === 'video' ? (
                  <div className="w-full h-full rounded-xl bg-black flex items-center justify-center overflow-hidden">
                    <video src={media.preview} className="w-full h-full object-cover rounded-xl" muted />
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
                  className="absolute top-1 right-1 p-1 bg-foreground/50 rounded-full text-background disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {mediaFiles.length < MAX_MEDIA && !isCompressing && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square border-2 border-dashed border-border rounded-xl flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus size={24} />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-center">
            {mediaFiles.length}/{MAX_MEDIA} медиа
          </p>
        </div>
      )}

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

      {showShopPicker && (
        <div className="mb-3 p-2 bg-secondary rounded-xl max-h-40 overflow-y-auto">
          {shops.map(shop => (
            <button
              key={shop.id}
              onClick={() => { setSelectedShop(shop); setShowShopPicker(false); }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-background rounded-lg transition-colors"
            >
              {shop.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
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
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('subflow.publish')}
        </Button>
      </div>
    </div>
  );
}
