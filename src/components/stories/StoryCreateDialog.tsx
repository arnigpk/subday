import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, LanguageIcon, PhotoIcon, SparklesIcon, PencilIcon } from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';;
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
  color: string;
  fontSize: number;
  posY: number;
}

const TEXT_COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ff2d55'];

const FILTERS: { name: string; label: string; css: string }[] = [
  { name: 'normal', label: 'Обычный', css: 'none' },
  { name: 'clarendon', label: 'Яркий', css: 'contrast(1.2) saturate(1.35)' },
  { name: 'gingham', label: 'Мягкий', css: 'brightness(1.05) hue-rotate(-10deg)' },
  { name: 'moon', label: 'Ч/Б', css: 'grayscale(1) contrast(1.1) brightness(1.1)' },
  { name: 'lark', label: 'Тёплый', css: 'contrast(0.9) saturate(1.1) sepia(0.1) brightness(1.1)' },
  { name: 'reyes', label: 'Винтаж', css: 'sepia(0.22) brightness(1.1) contrast(0.85) saturate(0.75)' },
  { name: 'juno', label: 'Насыщ.', css: 'contrast(1.15) saturate(1.8) brightness(1.05) sepia(0.05)' },
  { name: 'slumber', label: 'Сон', css: 'saturate(0.66) brightness(1.05) sepia(0.15)' },
];

const MAX_VIDEO_DURATION = 20;

export function StoryCreateDialog({ open, onOpenChange, onStoryCreated }: StoryCreateDialogProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [uploading, setUploading] = useState(false);
  const [textOverlay, setTextOverlay] = useState<TextOverlay | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const [selectedFilter, setSelectedFilter] = useState('normal');
  const [showFilters, setShowFilters] = useState(false);
  

  const inputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartPosY = useRef(0.5);
  const isDraggingText = useRef(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (f.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        const duration = video.duration;
        
        if (duration > MAX_VIDEO_DURATION) {
          toast.error(`Видео должно быть до ${MAX_VIDEO_DURATION} секунд. Выберите более короткое видео.`);
          return;
        }
        
        setFile(f);
        setPreview(URL.createObjectURL(f));
        setMediaType('video');
        setTextOverlay(null);
        setSelectedFilter('normal');
        setShowFilters(false);
      };
      video.src = URL.createObjectURL(f);
      return;
    }

    if (!f.type.startsWith('image/')) {
      toast.error('Выберите изображение или видео');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setMediaType('image');
    setTextOverlay(null);
    setSelectedFilter('normal');
  };

  const handleAddText = () => {
    if (mediaType === 'video') return;
    setEditingText(true);
    setTextDraft(textOverlay?.text || '');
    setSelectedColor(textOverlay?.color || '#ffffff');
    setTimeout(() => textInputRef.current?.focus(), 50);
  };

  const handleTextConfirm = () => {
    if (textDraft.trim()) {
      setTextOverlay({ text: textDraft.trim(), color: selectedColor, fontSize: 28, posY: textOverlay?.posY ?? 0.5 });
    } else {
      setTextOverlay(null);
    }
    setEditingText(false);
  };

  const handleTextTouchStart = (e: React.TouchEvent) => {
    if (!textOverlay || !imageContainerRef.current) return;
    e.stopPropagation();
    isDraggingText.current = true;
    dragStartY.current = e.touches[0].clientY;
    dragStartPosY.current = textOverlay.posY;
  };

  const handleTextTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingText.current || !textOverlay || !imageContainerRef.current) return;
    e.stopPropagation();
    const containerHeight = imageContainerRef.current.getBoundingClientRect().height;
    const deltaY = e.touches[0].clientY - dragStartY.current;
    const newPosY = Math.max(0.1, Math.min(0.9, dragStartPosY.current + deltaY / containerHeight));
    setTextOverlay(prev => prev ? { ...prev, posY: newPosY } : null);
  };

  const handleTextTouchEnd = () => {
    isDraggingText.current = false;
  };

  const getFilterCss = useCallback(() => {
    return FILTERS.find(f => f.name === selectedFilter)?.css || 'none';
  }, [selectedFilter]);

  const renderFinalImage = useCallback(async (): Promise<Blob> => {
    if (!file) throw new Error('No file');
    const compressed = await compressImage(file, { maxWidth: 1080, quality: 0.85 });

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

    const filterCss = getFilterCss();
    if (filterCss !== 'none') ctx.filter = filterCss;
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';

    if (textOverlay) {
      const fontSize = Math.round(canvas.width * 0.065);
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = fontSize * 0.4;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = textOverlay.color;

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

      const lineHeight = fontSize * 1.35;
      const centerY = canvas.height * textOverlay.posY;
      const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, i) => {
        ctx.fillText(line, canvas.width / 2, startY + i * lineHeight);
      });
    }

    URL.revokeObjectURL(img.src);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas failed')), 'image/jpeg', 0.88);
    });
  }, [file, textOverlay, getFilterCss]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let uploadBlob: Blob;
      let ext: string;

      if (mediaType === 'video') {
        uploadBlob = file;
        ext = file.name.split('.').pop() || 'mp4';
      } else {
        uploadBlob = await renderFinalImage();
        ext = getFileExtension(uploadBlob);
      }

      const path = `stories/${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('subflow-images')
        .upload(path, uploadBlob, { contentType: uploadBlob.type });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('subflow-images')
        .getPublicUrl(path);

      const { error: insertError } = await supabase
        .from('stories')
        .insert({ user_id: user.id, image_url: publicUrl, media_type: mediaType } as any);
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
    setMediaType('image');
    setTextOverlay(null);
    setEditingText(false);
    setTextDraft('');
    setSelectedFilter('normal');
    setShowFilters(false);
    onOpenChange(false);
  };


  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[99998] flex flex-col" style={{ backgroundColor: '#000' }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {!preview ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
          <div className="text-center">
            <h2 className="text-white text-xl font-bold mb-2">НОВЫЙ STORIES</h2>
            <p className="text-white/60 text-sm">Сделайте Фото/Видео или Выберите из Галереи</p>
          </div>

          <div className="flex gap-3 justify-center">
            {/* Camera button — opens native camera for photo or video */}
            <button
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.setAttribute('capture', 'environment');
                  inputRef.current.click();
                }
              }}
              className="flex flex-col items-center gap-2 px-6 py-5 rounded-2xl bg-white/10 backdrop-blur-sm active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                  <circle cx="12" cy="13" r="3"/>
                </svg>
              </div>
              <span className="text-white text-xs font-medium">Камера</span>
            </button>

            {/* Gallery button — opens file picker for image or video */}
            <button
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.removeAttribute('capture');
                  inputRef.current.click();
                }
              }}
              className="flex flex-col items-center gap-2 px-6 py-5 rounded-2xl bg-white/10 backdrop-blur-sm active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <PhotoIcon className="w-6 h-6" className="text-white" />
              </div>
              <span className="text-white text-xs font-medium">Галерея</span>
            </button>
          </div>

          <p className="text-white/40 text-xs">Видео до {MAX_VIDEO_DURATION} секунд</p>

          <button onClick={resetAndClose} className="mt-2 text-white/50 text-sm">
            Отмена
          </button>
        </div>
      ) : (
        <>
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2 safe-area-top z-20">
            <button onClick={resetAndClose} className="p-2 text-white active:scale-90 transition-transform">
              <XMarkIcon className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              {mediaType === 'image' && (
                <>
                  <button
                    onClick={handleAddText}
                    className={`p-2.5 rounded-full transition-all active:scale-90 ${textOverlay ? 'bg-white/30' : 'bg-white/10'}`}
                  >
                    <LanguageIcon className="w-5 h-5" className="text-white" />
                  </button>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-2.5 rounded-full transition-all active:scale-90 ${showFilters ? 'bg-white/30' : 'bg-white/10'}`}
                  >
                    <SparklesIcon className="w-5 h-5" className="text-white" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Media preview */}
          <div ref={imageContainerRef} className="flex-1 relative flex items-center justify-center overflow-hidden">
            {mediaType === 'video' ? (
              <video
                src={preview}
                className="w-full h-full object-contain"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img
                src={preview}
                alt="Preview"
                className="w-full h-full object-contain"
                style={{ filter: getFilterCss() }}
              />
            )}

            {/* Draggable text overlay (image only) */}
            {textOverlay && !editingText && mediaType === 'image' && (
              <div
                className="absolute left-0 right-0 flex justify-center px-6 cursor-grab active:cursor-grabbing"
                style={{ top: `${textOverlay.posY * 100}%`, transform: 'translateY(-50%)' }}
                onTouchStart={handleTextTouchStart}
                onTouchMove={handleTextTouchMove}
                onTouchEnd={handleTextTouchEnd}
                onDoubleClick={handleAddText}
              >
                <p
                  className="text-center font-bold leading-tight select-none"
                  style={{
                    color: textOverlay.color,
                    fontSize: '22px',
                    textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 0 4px rgba(0,0,0,0.3)',
                    wordBreak: 'break-word',
                    maxWidth: '85%',
                  }}
                >
                  {textOverlay.text}
                </p>
              </div>
            )}

            {/* Text editing overlay */}
            {editingText && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10 px-6"
                onClick={(e) => { if (e.target === e.currentTarget) handleTextConfirm(); }}
              >
                <input
                  ref={textInputRef}
                  value={textDraft}
                  onChange={e => setTextDraft(e.target.value)}
                  placeholder="Введите текст..."
                  maxLength={120}
                  className="w-full bg-transparent text-white text-center font-bold text-2xl outline-none placeholder:text-white/40"
                  style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}
                  onKeyDown={e => e.key === 'Enter' && handleTextConfirm()}
                />
                <div className="flex items-center gap-2.5 mt-6">
                  {TEXT_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`w-7 h-7 rounded-full transition-all ${selectedColor === color ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black/50' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <button
                  onClick={handleTextConfirm}
                  className="mt-6 px-6 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-medium active:scale-95 transition-transform"
                >
                  Готово
                </button>
              </div>
            )}
          </div>

          {/* Filter strip (image only) */}
          {showFilters && mediaType === 'image' && (
            <div className="px-2 py-3 overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 min-w-max px-2">
                {FILTERS.map(f => (
                  <button
                    key={f.name}
                    onClick={() => setSelectedFilter(f.name)}
                    className="flex flex-col items-center gap-1 shrink-0"
                  >
                    <div
                      className={`w-16 h-16 rounded-xl overflow-hidden ring-2 transition-all ${selectedFilter === f.name ? 'ring-white' : 'ring-transparent'}`}
                    >
                      <img
                        src={preview}
                        alt={f.label}
                        className="w-full h-full object-cover"
                        style={{ filter: f.css }}
                      />
                    </div>
                    <span className={`text-[10px] ${selectedFilter === f.name ? 'text-white font-bold' : 'text-white/60'}`}>
                      {f.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom bar */}
          <div className="px-4 pb-4 pt-2 safe-area-bottom flex items-center gap-3">
            <button
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.removeAttribute('capture');
                  inputRef.current.click();
                }
              }}
              className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
            >
              <PhotoIcon className="w-5 h-5" className="text-white" />
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex-1 h-12 rounded-full font-semibold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all backdrop-blur-xl border border-border/40 text-white"
              style={{
                background: 'hsl(var(--background) / 0.65)',
                boxShadow: '0 4px 24px hsl(var(--foreground) / 0.08), 0 1px 3px hsl(var(--foreground) / 0.06), inset 0 1px 0 hsl(var(--background) / 0.5)',
              }}
            >
              {uploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <PencilIcon className="w-4 h-4" />
                  <span>Опубликовать</span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
