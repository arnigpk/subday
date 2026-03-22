import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SparklesIcon, BoltIcon, TrophyIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface SubscriptionBadgeData {
  text: string;
  color: 'amber' | 'green' | 'blue' | 'red' | 'purple';
}

interface SubscriptionBadgeEditorProps {
  badge: string | null;
  badgeColor?: string | null;
  onChange: (badge: string | null, color: string | null) => void;
}

const PRESET_BADGES = [
  { value: 'Хит', icon: SparklesIcon, color: 'green' },
  { value: 'Выгодно', icon: BoltIcon, color: 'green' },
  { value: 'Максимум', icon: TrophyIcon, color: 'amber' },
  { value: 'Новинка', icon: SparklesIcon, color: 'blue' },
];

const COLOR_OPTIONS = [
  { value: 'amber', label: '🟠 Оранжевый', gradient: 'from-amber-500 to-orange-500' },
  { value: 'green', label: '🟢 Зелёный', gradient: 'from-green-500 to-emerald-500' },
  { value: 'blue', label: '🔵 Синий', gradient: 'from-blue-500 to-cyan-500' },
  { value: 'red', label: '🔴 Красный', gradient: 'from-red-500 to-rose-500' },
  { value: 'purple', label: '🟣 Фиолетовый', gradient: 'from-purple-500 to-pink-500' },
];

export function getSubscriptionBadgeStyle(badge: string | null, color?: string | null) {
  if (!badge) return 'bg-muted text-muted-foreground';
  
  // If color is provided, use it
  if (color) {
    const colorOption = COLOR_OPTIONS.find(c => c.value === color);
    if (colorOption) {
      return `bg-gradient-to-r ${colorOption.gradient} text-white`;
    }
  }
  
  // Fallback to preset badge colors
  switch (badge) {
    case 'Максимум':
      return 'bg-gradient-to-r from-amber-500 to-orange-500 text-white';
    case 'Выгодно':
      return 'bg-gradient-to-r from-green-500 to-lime-500 text-white';
    case 'Хит':
      return 'bg-gradient-to-r from-green-500 to-emerald-500 text-white';
    case 'Новинка':
      return 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white';
    default:
      return 'bg-gradient-to-r from-green-500 to-emerald-500 text-white';
  }
}

export function SubscriptionBadgeEditor({ badge, badgeColor, onChange }: SubscriptionBadgeEditorProps) {
  const [customText, setCustomText] = useState(badge || '');
  const [selectedColor, setSelectedColor] = useState(badgeColor || 'green');
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    // Determine if this is a custom badge
    const isPreset = PRESET_BADGES.some(p => p.value === badge);
    setIsCustom(!!badge && !isPreset);
    setCustomText(badge || '');
    setSelectedColor(badgeColor || 'green');
  }, [badge, badgeColor]);

  const handlePresetClick = (presetValue: string, presetColor: string) => {
    if (badge === presetValue) {
      // Deselect
      onChange(null, null);
      setCustomText('');
    } else {
      onChange(presetValue, presetColor);
      setCustomText(presetValue);
      setSelectedColor(presetColor);
      setIsCustom(false);
    }
  };

  const handleCustomTextChange = (text: string) => {
    setCustomText(text);
    if (text.trim()) {
      onChange(text, selectedColor);
      setIsCustom(true);
    } else {
      onChange(null, null);
      setIsCustom(false);
    }
  };

  const handleColorChange = (color: string) => {
    setSelectedColor(color);
    if (customText.trim()) {
      onChange(customText, color);
    }
  };

  const handleClear = () => {
    setCustomText('');
    onChange(null, null);
    setIsCustom(false);
  };

  const selectedPreset = PRESET_BADGES.find(p => p.value === badge && !isCustom);

  return (
    <div className="space-y-3">
      <Label>Бейдж</Label>
      
      {/* Preset badges */}
      <div className="flex flex-wrap gap-2">
        {PRESET_BADGES.map((preset) => {
          const isSelected = selectedPreset?.value === preset.value;
          const colorOption = COLOR_OPTIONS.find(c => c.value === preset.color);
          
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => handlePresetClick(preset.value, preset.color)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all',
                isSelected
                  ? `bg-gradient-to-r ${colorOption?.gradient} text-white ring-2 ring-offset-2 ring-primary`
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <preset.icon size={12} />
              {preset.value}
            </button>
          );
        })}
      </div>

      {/* Custom badge input */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            value={customText}
            onChange={(e) => handleCustomTextChange(e.target.value)}
            placeholder="Свой бейдж..."
            maxLength={15}
            className="pr-8"
          />
          {customText && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Color picker (shows only when there's text) */}
      {customText.trim() && (
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => handleColorChange(color.value)}
              className={cn(
                'w-8 h-8 rounded-full bg-gradient-to-r transition-all',
                color.gradient,
                selectedColor === color.value 
                  ? 'ring-2 ring-offset-2 ring-primary scale-110'
                  : 'opacity-60 hover:opacity-100'
              )}
              title={color.label}
            />
          ))}
        </div>
      )}

      {/* Preview */}
      {customText.trim() && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Превью:</span>
          <span className={cn(
            'inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full',
            getSubscriptionBadgeStyle(customText, selectedColor)
          )}>
            <SparklesIcon className="w-[10px] h-[10px]" />
            {customText}
          </span>
        </div>
      )}
    </div>
  );
}
