import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PlusIcon, XMarkIcon, MapPinIcon } from '@heroicons/react/24/outline';

interface SimpleAddressesEditorProps {
  addresses: string[];
  onChange: (addresses: string[]) => void;
  label?: string;
}

/**
 * Simple addresses editor without coordinates (for partner dashboard)
 */
export function SimpleAddressesEditor({ addresses, onChange, label = 'Адреса' }: SimpleAddressesEditorProps) {
  const [newAddress, setNewAddress] = useState('');

  const handleAdd = () => {
    const trimmed = newAddress.trim();
    if (trimmed && !addresses.includes(trimmed)) {
      onChange([...addresses, trimmed]);
      setNewAddress('');
    }
  };

  const handleRemove = (index: number) => {
    onChange(addresses.filter((_, i) => i !== index));
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
        <div className="space-y-2">
          {addresses.map((address, index) => (
            <div key={index} className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2">
              <MapPinIcon className="w-4 h-4" className="text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm">{address}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleRemove(index)}
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </Button>
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
          <PlusIcon className="w-4 h-4" />
        </Button>
      </div>
      
      {addresses.length === 0 && (
        <p className="text-xs text-muted-foreground">Добавьте хотя бы один адрес</p>
      )}
    </div>
  );
}
