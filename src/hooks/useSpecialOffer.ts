import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SpecialOffer {
  id: string;
  name: string;
  description: string | null;
  target_subscription_type_id: string;
  offer_price: number;
  offer_cups_count: number;
  offer_duration_days: number;
  badge_text: string | null;
  eligibility_type: string;
  eligibility_days: number;
}

interface UseSpecialOfferResult {
  offer: SpecialOffer | null;
  isEligible: boolean;
  eligibleUntil: Date | null;
  showPopup: boolean;
  isLoading: boolean;
  dismissPopup: () => Promise<void>;
}

export function useSpecialOffer(): UseSpecialOfferResult {
  const [offer, setOffer] = useState<SpecialOffer | null>(null);
  const [isEligible, setIsEligible] = useState(false);
  const [eligibleUntil, setEligibleUntil] = useState<Date | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkEligibility();
  }, []);

  const checkEligibility = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('created_at, special_offer_popup_shown_at, special_offer_redeemed_at')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        setIsLoading(false);
        return;
      }

      // Get active offers for new users
      const { data: offers } = await supabase
        .from('special_offers')
        .select('*')
        .eq('is_active', true)
        .eq('eligibility_type', 'new_users');

      if (!offers || offers.length === 0) {
        setIsLoading(false);
        return;
      }

      const activeOffer = offers[0] as SpecialOffer;
      const createdAt = new Date(profile.created_at);
      const eligibleUntilDate = new Date(createdAt.getTime() + activeOffer.eligibility_days * 24 * 60 * 60 * 1000);
      const now = new Date();

      // Check if user has already redeemed this specific offer
      const { data: redemptions } = await supabase
        .from('user_offer_redemptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('offer_id', activeOffer.id)
        .limit(1);

      const hasRedeemed = (redemptions && redemptions.length > 0) || !!profile.special_offer_redeemed_at;

      if (now < eligibleUntilDate && !hasRedeemed) {
        setOffer(activeOffer);
        setIsEligible(true);
        setEligibleUntil(eligibleUntilDate);
        
        // Show popup only once
        if (!profile.special_offer_popup_shown_at) {
          setShowPopup(true);
        }
      }
    } catch (err) {
      console.error('Error checking special offer eligibility:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const dismissPopup = useCallback(async () => {
    setShowPopup(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ special_offer_popup_shown_at: new Date().toISOString() })
          .eq('user_id', user.id);
      }
    } catch (err) {
      console.error('Error dismissing popup:', err);
    }
  }, []);

  return { offer, isEligible, eligibleUntil, showPopup, isLoading, dismissPopup };
}
