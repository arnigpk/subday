import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { compressImage, getFileExtension } from '@/utils/imageCompression';
import { toast } from 'sonner';

interface StoryCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStoryCreated: () => void;
}

export function StoryCreateDialog({ open, onOpenChange, onStoryCreated }: StoryCreateDialogProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Выберите изображение');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const compressed = await compressImage(file, { maxWidth: 1080, quality: 0.8 });
      const ext = getFileExtension(compressed.blob);
      const path = `stories/${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('subflow-images')
        .upload(path, compressed.blob, { contentType: compressed.blob.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('subflow-images')
        .getPublicUrl(path);

      const { error: insertError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          image_url: publicUrl,
        });

      if (insertError) throw insertError;

      toast.success('Сториз опубликован!');
      resetAndClose();
      onStoryCreated();
    } catch (err) {
      console.error('Story upload error:', err);
      toast.error('Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  };

  const resetAndClose = () => {
    setPreview(null);
    setFile(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>Новая история</DialogTitle>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {preview ? (
          <div className="relative">
            <img src={preview} alt="Preview" className="w-full rounded-xl aspect-[9/16] object-cover" />
            <button
              onClick={() => { setPreview(null); setFile(null); }}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full aspect-[9/16] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Camera size={40} />
            <span className="text-sm font-medium">Выбрать фото</span>
          </button>
        )}

        {preview && (
          <Button onClick={handleUpload} disabled={uploading} className="w-full">
            {uploading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            {uploading ? 'Загрузка...' : 'Опубликовать'}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
