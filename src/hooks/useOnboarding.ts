import { useCallback, useState } from 'react';

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  const maybeShowOnboarding = useCallback((isNewUser: boolean) => {
    if (isNewUser) setShowOnboarding(true);
  }, []);

  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  return { showOnboarding, maybeShowOnboarding, completeOnboarding };
}
