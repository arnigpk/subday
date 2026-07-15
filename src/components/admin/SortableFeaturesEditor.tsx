import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface SortableFeaturesEditorProps {
  features: string[];
  onChange: (features: string[]) => void;
  label?: string;
  placeholder?: string;
  variant?: 'feature' | 'exclusion';
  // Необязательные пояснения к каждому пункту (иконка «!» на клиенте). Параллельны features.
  hints?: string[];
  onHintsChange?: (hints: string[]) => void;
}

interface SortableFeatureItemProps {
  id: string;
  index: number;
  value: string;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  placeholder?: string;
  hint?: string;
  onHintChange?: (index: number, value: string) => void;
}

function SortableFeatureItem({ id, index, value, onChange, onRemove, canRemove, placeholder = 'Функция', hint, onHintChange }: SortableFeatureItemProps) {
  const [showHint, setShowHint] = useState(!!hint);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group">
      <div className="flex gap-2 items-center">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted opacity-50 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(index, e.target.value)}
          placeholder={`${placeholder} ${index + 1}`}
          className="flex-1"
        />
        {onHintChange && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowHint((s) => !s)}
            title="Пояснение к пункту"
            className={hint?.trim() || showHint ? 'text-primary' : 'text-muted-foreground'}
          >
            <Info className="w-4 h-4" />
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(index)} disabled={!canRemove}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
      {onHintChange && showHint && (
        <div className="ml-8 mt-1.5 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-primary shrink-0" />
          <Input
            value={hint || ''}
            onChange={(e) => onHintChange(index, e.target.value)}
            placeholder="Пояснение (напр. айс латте, айс капучино, айс батч брю…)"
            className="flex-1 text-sm"
          />
        </div>
      )}
    </div>
  );
}

export function SortableFeaturesEditor({ features, onChange, label = 'Что входит (функции)', placeholder = 'Функция', variant = 'feature', hints, onHintsChange }: SortableFeaturesEditorProps) {
  // hints параллельны features; поддерживаем ту же длину.
  const safeHints = onHintsChange ? features.map((_, i) => hints?.[i] || '') : undefined;
  // Generate stable IDs for features
  const [featureIds] = useState(() => 
    features.map((_, i) => `feature-${i}-${Date.now()}`)
  );
  
  const [ids, setIds] = useState<string[]>(() => 
    features.map((_, i) => featureIds[i] || `feature-${i}-${Date.now()}`)
  );

  // Keep IDs in sync with features length
  if (ids.length !== features.length) {
    const newIds = features.map((_, i) => ids[i] || `feature-${i}-${Date.now()}`);
    setIds(newIds);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);

      const newFeatures = arrayMove(features, oldIndex, newIndex);
      const newIds = arrayMove(ids, oldIndex, newIndex);

      setIds(newIds);
      onChange(newFeatures);
      if (onHintsChange && safeHints) onHintsChange(arrayMove(safeHints, oldIndex, newIndex));
    }
  };

  const handleFeatureChange = (index: number, value: string) => {
    const newFeatures = [...features];
    newFeatures[index] = value;
    onChange(newFeatures);
  };

  const handleHintChange = (index: number, value: string) => {
    if (!onHintsChange || !safeHints) return;
    const next = [...safeHints];
    next[index] = value;
    onHintsChange(next);
  };

  const handleRemoveFeature = (index: number) => {
    const newFeatures = features.filter((_, i) => i !== index);
    const newIds = ids.filter((_, i) => i !== index);
    setIds(newIds);
    onChange(newFeatures);
    if (onHintsChange && safeHints) onHintsChange(safeHints.filter((_, i) => i !== index));
  };

  const handleAddFeature = () => {
    const newId = `feature-${features.length}-${Date.now()}`;
    setIds([...ids, newId]);
    onChange([...features, '']);
    if (onHintsChange && safeHints) onHintsChange([...safeHints, '']);
  };

  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      <p className="text-xs text-muted-foreground mb-2">
        Перетащите для изменения порядка
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {features.map((feature, index) => (
              <SortableFeatureItem
                key={ids[index]}
                id={ids[index]}
                index={index}
                value={feature}
                onChange={handleFeatureChange}
                onRemove={handleRemoveFeature}
                canRemove={variant === 'exclusion' || features.length > 1}
                placeholder={placeholder}
                hint={safeHints?.[index]}
                onHintChange={onHintsChange ? handleHintChange : undefined}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={handleAddFeature}
      >
        <Plus className="w-4 h-4 mr-1" />
        {variant === 'exclusion' ? 'Добавить исключение' : 'Добавить функцию'}
      </Button>
    </div>
  );
}
