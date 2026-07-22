import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Доступ в B2B-кабинет: у пользователя есть роль b2b_admin.
export function useB2BAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isB2BAdmin, setIsB2BAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setIsLoading(false); return; }
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'b2b_admin')
        .maybeSingle();
      if (!cancelled) {
        setIsB2BAdmin(!!data);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { isLoading, isB2BAdmin };
}
