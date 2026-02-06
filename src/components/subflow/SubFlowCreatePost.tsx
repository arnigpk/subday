import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, Image, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Shop {
  id: string;
  name: string;
}

interface SubFlowCreatePostProps {
  onClose: () => void;
  onPostCreated: () => void;
}

export function SubFlowCreatePost({ onClose, onPostCreated }: SubFlowCreatePostProps) {
  const [content, setContent] = useState('');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [showShopPicker, setShowShopPicker] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Выберите изображение');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Максимум 5МБ');
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
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

      let imageUrl: string | null = null;

      // Upload image if selected
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('subflow-images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('subflow-images')
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      // Create post
      const { error: postError } = await supabase
        .from('subflow_posts')
        .insert({
          user_id: user.id,
          content: content.trim(),
          image_url: imageUrl,
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
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-foreground">Новый пост</h2>
        <button onClick={onClose} className="p-1 text-muted-foreground">
          <X size={20} />
        </button>
      </div>

      {/* Content input */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Поделитесь впечатлениями..."
        rows={3}
        className="w-full px-3 py-2 bg-secondary rounded-xl text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 mb-3"
      />

      {/* Image preview */}
      {imagePreview && (
        <div className="relative mb-3">
          <img
            src={imagePreview}
            alt="Preview"
            className="w-full h-48 object-cover rounded-xl"
          />
          <button
            onClick={() => {
              setImageFile(null);
              setImagePreview(null);
            }}
            className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white"
          >
            <X size={16} />
          </button>
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
          className="hidden"
          onChange={handleImageSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Image size={22} />
        </button>
        <button
          onClick={() => setShowShopPicker(!showShopPicker)}
          className={`p-2 transition-colors ${selectedShop ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <MapPin size={22} />
        </button>
        <div className="flex-1" />
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !content.trim()}
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
