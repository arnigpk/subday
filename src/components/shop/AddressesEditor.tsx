import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, X, MapPin, Navigation, Clock } from 'lucide-react';

export interface AddressWithCoords {
  address: string;
  lat: number | null;
  lng: number | null;
  working_hours?: string;
}

interface AddressesEditorProps {
  addresses: AddressWithCoords[];
  onChange: (addresses: AddressWithCoords[]) => void;
  label?: string;
}

export function AddressesEditor({ addresses, onChange, label = 'Адреса' }: AddressesEditorProps) {
  const [newAddress, setNewAddress] = useState('');

  const handleAdd = () => {
    const trimmed = newAddress.trim();
    if (trimmed && !addresses.some(a => a.address === trimmed)) {
      onChange([...addresses, { address: trimmed, lat: null, lng: null }]);
      setNewAddress('');
    }
  };

  const handleRemove = (index: number) => {
    onChange(addresses.filter((_, i) => i !== index));
  };

  const handleAddressChange = (index: number, value: string) => {
    const updated = [...addresses];
    updated[index] = { ...updated[index], address: value };
    onChange(updated);
  };

  const handleCoordsChange = (index: number, field: 'lat' | 'lng', value: string) => {
    const updated = [...addresses];
    const numValue = value === '' ? null : parseFloat(value);
    updated[index] = { ...updated[index], [field]: isNaN(numValue as number) ? null : numValue };
    onChange(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      
      {/* Existing addresses */}
      {addresses.length > 0 && (
        <div className="space-y-3">
          {addresses.map((item, index) => (
            <div key={index} className="bg-secondary/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-muted-foreground shrink-0" />
                <Input
                  value={item.address}
                  onChange={(e) => handleAddressChange(index, e.target.value)}
                  placeholder="Адрес"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleRemove(index)}
                >
                  <X size={14} />
                </Button>
              </div>
              
              {/* Coordinates row */}
              <div className="flex items-center gap-2 pl-6">
                <Navigation size={14} className="text-accent shrink-0" />
                <div className="flex gap-2 flex-1">
                  <Input
                    type="number"
                    step="any"
                    value={item.lat ?? ''}
                    onChange={(e) => handleCoordsChange(index, 'lat', e.target.value)}
                    placeholder="Широта (lat)"
                    className="flex-1 text-sm h-8"
                  />
                  <Input
                    type="number"
                    step="any"
                    value={item.lng ?? ''}
                    onChange={(e) => handleCoordsChange(index, 'lng', e.target.value)}
                    placeholder="Долгота (lng)"
                    className="flex-1 text-sm h-8"
                  />
                </div>
              </div>
              {(item.lat === null || item.lng === null) && (
                <p className="text-xs text-muted-foreground pl-6">
                  Найти координаты: Google Maps → правый клик на точке → Что здесь?
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Add new address */}
      <div className="flex gap-2">
        <Input
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ул. Сатпаева 20"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleAdd}
          disabled={!newAddress.trim()}
        >
          <Plus size={16} />
        </Button>
      </div>
      
      {addresses.length === 0 && (
        <p className="text-xs text-muted-foreground">Добавьте хотя бы один адрес</p>
      )}
    </div>
  );
}
