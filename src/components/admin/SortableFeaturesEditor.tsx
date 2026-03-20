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
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface SortableFeaturesEditorProps {
  features: string[];
  onChange: (features: string[]) => void;
  label?: string;
  placeholder?: string;
  variant?: 'feature' | 'exclusion';
}

interface SortableFeatureItemProps {
  id: string;
  index: number;
  value: string;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  placeholder?: string;
}

function SortableFeatureItem({ id, index, value, onChange, onRemove, canRemove, placeholder = 'Функция' }: SortableFeatureItemProps) {
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
    <div ref={setNodeRef} style={style} className="flex gap-2 items-center group">
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
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(index)}
        disabled={!canRemove}
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}

export function SortableFeaturesEditor({ features, onChange, label = 'Что входит (функции)', placeholder = 'Функция', variant = 'feature' }: SortableFeaturesEditorProps) {
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
    }
  };

  const handleFeatureChange = (index: number, value: string) => {
    const newFeatures = [...features];
    newFeatures[index] = value;
    onChange(newFeatures);
  };

  const handleRemoveFeature = (index: number) => {
    const newFeatures = features.filter((_, i) => i !== index);
    const newIds = ids.filter((_, i) => i !== index);
    setIds(newIds);
    onChange(newFeatures);
  };

  const handleAddFeature = () => {
    const newId = `feature-${features.length}-${Date.now()}`;
    setIds([...ids, newId]);
    onChange([...features, '']);
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
        Добавить функцию
      </Button>
    </div>
  );
}
