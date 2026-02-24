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

interface EligibleOffer {
  offer: SpecialOffer;
  eligibleUntil: Date | null;
}

interface UseSpecialOfferResult {
  /** First eligible offer (backward compat) */
  offer: SpecialOffer | null;
  /** All eligible offers */
  eligibleOffers: EligibleOffer[];
  isEligible: boolean;
  eligibleUntil: Date | null;
  showPopup: boolean;
  popupOffer: EligibleOffer | null;
  isLoading: boolean;
  dismissPopup: () => Promise<void>;
}

export function useSpecialOffer(): UseSpecialOfferResult {
  const [eligibleOffers, setEligibleOffers] = useState<EligibleOffer[]>([]);
  const [popupOffer, setPopupOffer] = useState<EligibleOffer | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkEligibility();
  }, []);

  const checkEligibility = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('created_at, special_offer_redeemed_at, popup_shown_offer_ids')
        .eq('user_id', user.id)
        .single();

      if (!profile) { setIsLoading(false); return; }

      // Get ALL active offers
      const { data: offers } = await supabase
        .from('special_offers')
        .select('*')
        .eq('is_active', true);

      if (!offers || offers.length === 0) { setIsLoading(false); return; }

      // Get user's active subscriptions for expiring_soon check
      const { data: activeSubs } = await supabase
        .from('user_subscriptions')
        .select('subscription_type_id, expires_at')
        .eq('user_id', user.id)
        .eq('is_active', true);

      // Get user's redeemed offers
      const { data: redemptions } = await supabase
        .from('user_offer_redemptions')
        .select('offer_id')
        .eq('user_id', user.id);
      
      const redeemedIds = new Set((redemptions || []).map(r => r.offer_id));
      const shownPopupIds: string[] = (profile as any).popup_shown_offer_ids || [];

      const createdAt = new Date(profile.created_at);
      const now = new Date();
      const matched: EligibleOffer[] = [];
      let firstUnshownOffer: EligibleOffer | null = null;

      for (const raw of offers) {
        const o = raw as SpecialOffer;
        if (redeemedIds.has(o.id)) continue;

        let eligible = false;
        let eligUntil: Date | null = null;

        if (o.eligibility_type === 'new_users') {
          eligUntil = new Date(createdAt.getTime() + o.eligibility_days * 24 * 60 * 60 * 1000);
          eligible = now < eligUntil;
        } else if (o.eligibility_type === 'all_users') {
          eligible = true;
        } else if (o.eligibility_type === 'no_subscription') {
          eligible = !activeSubs || activeSubs.length === 0;
        } else if (o.eligibility_type === 'expiring_soon') {
          // Users whose subscription expires within 5 days
          if (activeSubs && activeSubs.length > 0) {
            for (const sub of activeSubs) {
              if (!sub.expires_at) continue;
              const expiresAt = new Date(sub.expires_at);
              const daysLeft = (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
              if (daysLeft <= 5 && daysLeft > 0) {
                eligible = true;
                eligUntil = expiresAt;
                break;
              }
            }
          }
        }

        if (eligible) {
          const eo: EligibleOffer = { offer: o, eligibleUntil: eligUntil };
          matched.push(eo);

          // Check if popup was NOT shown for this offer
          if (!firstUnshownOffer && !shownPopupIds.includes(o.id)) {
            firstUnshownOffer = eo;
          }
        }
      }

      setEligibleOffers(matched);

      if (firstUnshownOffer) {
        setPopupOffer(firstUnshownOffer);
        setShowPopup(true);
      }
    } catch (err) {
      console.error('Error checking special offer eligibility:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const dismissPopup = useCallback(async () => {
    const offerId = popupOffer?.offer.id;
    setShowPopup(false);
    setPopupOffer(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && offerId) {
        // Get current shown ids
        const { data: profile } = await supabase
          .from('profiles')
          .select('popup_shown_offer_ids')
          .eq('user_id', user.id)
          .single();
        
        const current: string[] = (profile as any)?.popup_shown_offer_ids || [];
        if (!current.includes(offerId)) {
          await supabase
            .from('profiles')
            .update({ popup_shown_offer_ids: [...current, offerId] } as any)
            .eq('user_id', user.id);
        }
      }
    } catch (err) {
      console.error('Error dismissing popup:', err);
    }
  }, [popupOffer]);

  const first = eligibleOffers[0] || null;
  return {
    offer: first?.offer || null,
    eligibleOffers,
    isEligible: eligibleOffers.length > 0,
    eligibleUntil: first?.eligibleUntil || null,
    showPopup,
    popupOffer,
    isLoading,
    dismissPopup,
  };
}
