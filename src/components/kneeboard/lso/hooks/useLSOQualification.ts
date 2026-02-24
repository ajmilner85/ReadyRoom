import { useState, useEffect } from 'react';
import { supabase } from '../../../../utils/supabaseClient';

const LSO_QUALIFICATION_ID = '39b173aa-7f41-4388-838c-7bad63a742cf';

export function useLSOQualification(pilotId: string | null) {
  const [isLSO, setIsLSO] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pilotId) {
      setIsLSO(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const check = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('pilot_qualifications')
          .select('id')
          .eq('pilot_id', pilotId)
          .eq('qualification_id', LSO_QUALIFICATION_ID)
          .eq('is_current', true)
          .maybeSingle();

        if (!cancelled) {
          setIsLSO(!error && !!data);
        }
      } catch {
        if (!cancelled) setIsLSO(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [pilotId]);

  return { isLSO, loading };
}
