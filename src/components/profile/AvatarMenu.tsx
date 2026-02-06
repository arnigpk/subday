import { useState, useRef } from 'react';
import { Camera, Image, Sparkles, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AvatarMenuProps {
  onAvatarChange: (file: File) => Promise<void>;
  isUploading: boolean;
}

export function AvatarMenu({ onAvatarChange, isUploading }: AvatarMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploadingStory, setIsUploadingStory] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsOpen(false);
    await onAvatarChange(file);
    
    // Reset input
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  const handleStorySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Выберите изображение');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой (максимум 5МБ)');
      return;
    }

    setIsUploadingStory(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('subflow-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('subflow-images')
        .getPublicUrl(fileName);

      // Create story record
      const { error: storyError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          image_url: publicUrl
        });

      if (storyError) throw storyError;

      toast.success('Сториз добавлен! 🎉');
      setIsOpen(false);
    } catch (error) {
      console.error('Error uploading story:', error);
      toast.error('Ошибка загрузки сториз');
    } finally {
      setIsUploadingStory(false);
      if (storyInputRef.current) {
        storyInputRef.current.value = '';
      }
    }
  };

  const isProcessing = isUploading || isUploadingStory;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isProcessing}
        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-accent flex items-center justify-center shadow-lg transition-transform hover:scale-110"
      >
        {isProcessing ? (
          <div className="w-4 h-4 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
        ) : (
          <Camera size={14} className="text-accent-foreground" />
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Menu */}
          <div className="absolute left-full top-0 ml-2 z-50 bg-card border border-border rounded-xl shadow-lg p-1.5 min-w-[180px] animate-slide-up">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border mb-1">
              <span className="text-xs font-medium text-muted-foreground">Выберите действие</span>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
            
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <Image size={18} className="text-primary" />
              <span className="font-medium">Поменять аватарку</span>
            </button>
            
            <button
              onClick={() => storyInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <Sparkles size={18} className="text-accent" />
              <span className="font-medium">Добавить сториз</span>
            </button>
          </div>
        </>
      )}

      {/* Hidden file inputs */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarSelect}
      />
      <input
        ref={storyInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleStorySelect}
      />
    </div>
  );
}
