import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPinIcon, ChevronRightIcon, CheckIcon } from '@heroicons/react/24/outline';;
import { COUNTRY_OPTIONS, getCitiesForCountry, type CountryInfo } from '@/utils/countries';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { useLanguage } from '@/contexts/LanguageContext';

interface CountryCityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCountry: string | null;
  currentCity: string | null;
  onSaved: () => void;
}

export function CountryCityDialog({ open, onOpenChange, currentCountry, currentCity, onSaved }: CountryCityDialogProps) {
  const [step, setStep] = useState<'country' | 'city'>('country');
  const [selectedCountry, setSelectedCountry] = useState(currentCountry || 'KZ');
  const [isSaving, setIsSaving] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (open) {
      setStep('country');
      setSelectedCountry(currentCountry || 'KZ');
    }
  }, [open, currentCountry]);

  const handleCountrySelect = (code: string) => {
    setSelectedCountry(code);
    setStep('city');
  };

  const handleCitySelect = async (city: string) => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ country: selectedCountry, city })
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Город обновлён');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving city:', err);
      toast.error('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  const cities = getCitiesForCountry(selectedCountry);
  const countryInfo = COUNTRY_OPTIONS.find(c => c.code === selectedCountry);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <MapPinIcon className="w-5 h-5" className="text-accent" />
            {step === 'country' ? 'Выберите страну' : `Города: ${countryInfo?.flag} ${countryInfo?.name}`}
          </DialogTitle>
        </DialogHeader>
        
        {step === 'country' ? (
          <div className="px-3 pb-4 space-y-1 max-h-[50vh] overflow-y-auto">
            {COUNTRY_OPTIONS.map((c) => (
              <button
                key={c.code}
                onClick={() => handleCountrySelect(c.code)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                  selectedCountry === c.code 
                    ? 'bg-accent/10 ring-1 ring-accent' 
                    : 'hover:bg-muted'
                }`}
              >
                <span className="text-2xl">{c.flag}</span>
                <span className="flex-1 font-medium text-foreground">{c.name}</span>
                <ChevronRightIcon className="w-[18px] h-[18px]" className="text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 pb-4 space-y-1 max-h-[50vh] overflow-y-auto">
            <button
              onClick={() => setStep('country')}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-accent font-medium mb-2"
            >
              ← Назад к выбору страны
            </button>
            {cities.map((city) => (
              <button
                key={city}
                onClick={() => handleCitySelect(city)}
                disabled={isSaving}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                  currentCity === city && currentCountry === selectedCountry
                    ? 'bg-accent/10 ring-1 ring-accent'
                    : 'hover:bg-muted'
                }`}
              >
                <span className="flex-1 font-medium text-foreground">{city}</span>
                {currentCity === city && currentCountry === selectedCountry && (
                  <CheckIcon className="w-[18px] h-[18px]" className="text-accent" />
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
