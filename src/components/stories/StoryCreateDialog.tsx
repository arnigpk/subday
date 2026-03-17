import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, X, Type, Palette } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { compressImage, getFileExtension } from '@/utils/imageCompression';
import { toast } from 'sonner';

interface StoryCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStoryCreated: () => void;
}

interface TextOverlay {
  text: string;
  x: number; // percent
  y: number; // percent
  color: string;
  fontSize: number;
}

const TEXT_COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#34c759', '#007aff', '#af52de', '#ff2d55'];

export function StoryCreateDialog({ open, onOpenChange, onStoryCreated }: StoryCreateDialogProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [textOverlay, setTextOverlay] = useState<TextOverlay | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Выберите изображение');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setTextOverlay(null);
  };

  const handleAddText = () => {
    setShowTextInput(true);
    setTextDraft(textOverlay?.text || '');
    setSelectedColor(textOverlay?.color || '#ffffff');
    setTimeout(() => textInputRef.current?.focus(), 100);
  };

  const handleTextConfirm = () => {
    if (textDraft.trim()) {
      setTextOverlay({
        text: textDraft.trim(),
        x: 50,
        y: 50,
        color: selectedColor,
        fontSize: 28,
      });
    } else {
      setTextOverlay(null);
    }
    setShowTextInput(false);
  };

  const renderImageWithText = useCallback(async (): Promise<Blob> => {
    if (!file) throw new Error('No file');

    const compressed = await compressImage(file, { maxWidth: 1080, quality: 0.85 });

    if (!textOverlay) return compressed.blob;

    // Draw text on canvas
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = URL.createObjectURL(compressed.blob);
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    // Draw text with shadow
    const fontSize = Math.round((textOverlay.fontSize / 100) * canvas.width * 0.08);
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const tx = (textOverlay.x / 100) * canvas.width;
    const ty = (textOverlay.y / 100) * canvas.height;

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = fontSize * 0.3;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = textOverlay.color;

    // Word wrap
    const maxWidth = canvas.width * 0.85;
    const words = textOverlay.text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize * 1.3;
    const startY = ty - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, tx, startY + i * lineHeight);
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas failed')), 'image/jpeg', 0.85);
    });
  }, [file, textOverlay]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const finalBlob = await renderImageWithText();
      const ext = getFileExtension(finalBlob);
      const path = `stories/${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('subflow-images')
        .upload(path, finalBlob, { contentType: finalBlob.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('subflow-images')
        .getPublicUrl(path);

      const { error: insertError } = await supabase
        .from('stories')
        .insert({ user_id: user.id, image_url: publicUrl });

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
    setTextOverlay(null);
    setShowTextInput(false);
    setTextDraft('');
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
        <canvas ref={canvasRef} className="hidden" />

        {preview ? (
          <div className="space-y-3">
            {/* Preview with text overlay */}
            <div className="relative overflow-hidden rounded-xl">
              <img src={preview} alt="Preview" className="w-full aspect-[9/16] object-cover" />

              {/* Text overlay preview */}
              {textOverlay && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ padding: '8%' }}
                >
                  <p
                    className="text-center font-bold leading-tight"
                    style={{
                      color: textOverlay.color,
                      fontSize: `${textOverlay.fontSize * 0.6}px`,
                      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                      wordBreak: 'break-word',
                      top: `${textOverlay.y}%`,
                      position: 'absolute',
                      transform: 'translateY(-50%)',
                      maxWidth: '85%',
                    }}
                  >
                    {textOverlay.text}
                  </p>
                </div>
              )}

              {/* Remove image button */}
              <button
                onClick={() => { setPreview(null); setFile(null); setTextOverlay(null); }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Text input panel */}
            {showTextInput ? (
              <div className="space-y-3 p-3 rounded-xl bg-muted/50">
                <input
                  ref={textInputRef}
                  value={textDraft}
                  onChange={e => setTextDraft(e.target.value)}
                  placeholder="Введите текст..."
                  className="w-full bg-transparent text-foreground text-center font-bold text-lg outline-none placeholder:text-muted-foreground"
                  onKeyDown={e => e.key === 'Enter' && handleTextConfirm()}
                  maxLength={120}
                />
                {/* Color picker */}
                <div className="flex items-center justify-center gap-2">
                  <Palette size={14} className="text-muted-foreground" />
                  {TEXT_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`w-6 h-6 rounded-full transition-transform ${selectedColor === color ? 'scale-125 ring-2 ring-primary' : ''}`}
                      style={{ backgroundColor: color, border: '2px solid hsl(var(--border))' }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowTextInput(false)} className="flex-1">
                    Отмена
                  </Button>
                  <Button size="sm" onClick={handleTextConfirm} className="flex-1">
                    Готово
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleAddText} className="flex-1 gap-1.5">
                  <Type size={14} />
                  {textOverlay ? 'Изменить текст' : 'Добавить текст'}
                </Button>
              </div>
            )}

            {/* Upload button */}
            <Button onClick={handleUpload} disabled={uploading} className="w-full">
              {uploading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              {uploading ? 'Загрузка...' : 'Опубликовать'}
            </Button>
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
      </DialogContent>
    </Dialog>
  );
}
