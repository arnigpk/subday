import { useState } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ShopBadgeData {
  text: string;
  color: 'red' | 'green' | 'yellow';
}

interface BadgesEditorProps {
  badges: ShopBadgeData[];
  onChange: (badges: ShopBadgeData[]) => void;
  maxBadges?: number;
}

const colorOptions = [
  { value: 'red', label: '🔴 Красный' },
  { value: 'green', label: '🟢 Зелёный' },
  { value: 'yellow', label: '🟡 Жёлтый' },
];

export function BadgesEditor({ badges, onChange, maxBadges = 5 }: BadgesEditorProps) {
  const [newBadgeText, setNewBadgeText] = useState('');
  const [newBadgeColor, setNewBadgeColor] = useState<'red' | 'green' | 'yellow'>('green');

  const handleAddBadge = () => {
    if (!newBadgeText.trim()) return;
    if (badges.length >= maxBadges) return;
    
    onChange([...badges, { text: newBadgeText.trim(), color: newBadgeColor }]);
    setNewBadgeText('');
  };

  const handleRemoveBadge = (index: number) => {
    onChange(badges.filter((_, i) => i !== index));
  };

  const colorClasses: Record<string, string> = {
    red: 'bg-red-500/10 text-red-600 border-red-500/20',
    green: 'bg-green-500/10 text-green-600 border-green-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  };

  return (
    <div className="space-y-3">
      <Label>Бейджи ({badges.length}/{maxBadges})</Label>
      
      {/* Existing badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {badges.map((badge, index) => (
            <div
              key={index}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border ${colorClasses[badge.color]}`}
            >
              {badge.text}
              <button
                type="button"
                onClick={() => handleRemoveBadge(index)}
                className="hover:opacity-70 transition-opacity"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Add new badge */}
      {badges.length < maxBadges && (
        <div className="flex gap-2">
          <Input
            value={newBadgeText}
            onChange={(e) => setNewBadgeText(e.target.value)}
            placeholder="Текст бейджа"
            maxLength={15}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddBadge();
              }
            }}
          />
          <select
            value={newBadgeColor}
            onChange={(e) => setNewBadgeColor(e.target.value as 'red' | 'green' | 'yellow')}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            {colorOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button type="button" onClick={handleAddBadge} size="icon" variant="outline">
            <PlusIcon className="w-4 h-4" />
          </Button>
        </div>
      )}
      
      <p className="text-xs text-muted-foreground">
        Короткие метки: "Новинка", "Акция", "ТОП", "Скидки" и т.д.
      </p>
    </div>
  );
}
