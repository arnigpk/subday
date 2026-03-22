import { useState, useRef } from 'react';
import { CameraIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface AvatarMenuProps {
  onAvatarChange: (file: File) => Promise<void>;
  isUploading: boolean;
}

export function AvatarMenu({ onAvatarChange, isUploading }: AvatarMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isUploading}
        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-accent flex items-center justify-center shadow-lg transition-transform hover:scale-110"
      >
        {isUploading ? (
          <div className="w-4 h-4 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
        ) : (
          <CameraIcon className="w-3.5 h-3.5" className="text-accent-foreground" />
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[100]" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Menu */}
          <div className="absolute left-0 top-full mt-2 z-[101] bg-card border border-border rounded-xl shadow-lg p-1.5 min-w-[180px] animate-slide-up">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border mb-1">
              <span className="text-xs font-medium text-muted-foreground">Выберите действие</span>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <PhotoIcon className="w-[18px] h-[18px]" className="text-primary" />
              <span className="font-medium">Поменять аватарку</span>
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
    </div>
  );
}
