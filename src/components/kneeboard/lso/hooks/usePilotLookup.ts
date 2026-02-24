import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../../utils/supabaseClient';
import type { ResolvedPilot } from '../types/lsoTypes';

/**
 * Looks up a pilot by board number. Returns pilot info including
 * callsign and squadron/wing insignia for display.
 */
export function usePilotLookup(boardNumber: string) {
  const [pilot, setPilot] = useState<ResolvedPilot | null>(null);
  const [loading, setLoading] = useState(false);
  const lastLookupRef = useRef('');

  useEffect(() => {
    // Only lookup when we have a complete board number (typically 3 digits)
    // and it's different from the last successful lookup
    if (boardNumber.length < 1 || boardNumber === lastLookupRef.current) {
      if (boardNumber.length < 1) {
        setPilot(null);
        lastLookupRef.current = '';
      }
      return;
    }

    let cancelled = false;

    const lookup = async () => {
      setLoading(true);
      try {
        // Query pilot by board number with squadron/wing info
        const { data, error } = await supabase
          .from('pilots')
          .select(`
            id,
            callsign,
            boardNumber,
            pilot_assignments!inner(
              org_squadrons!inner(
                designation,
                squadronInsigniaUrl:insignia_url,
                org_wings!inner(
                  name,
                  wingInsigniaUrl:insignia_url
                )
              )
            )
          `)
          .eq('boardNumber', parseInt(boardNumber, 10))
          .is('pilot_assignments.end_date', null)
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          // Try without the join in case pilot has no squadron assignment
          const { data: basicData } = await supabase
            .from('pilots')
            .select('id, callsign, boardNumber')
            .eq('boardNumber', parseInt(boardNumber, 10))
            .limit(1)
            .maybeSingle();

          if (!cancelled && basicData) {
            setPilot({
              id: basicData.id,
              callsign: basicData.callsign || '',
              boardNumber: basicData.boardNumber,
              wingInsigniaUrl: null,
              squadronInsigniaUrl: null,
              squadronDesignation: null,
            });
            lastLookupRef.current = boardNumber;
          } else if (!cancelled) {
            setPilot(null);
          }
          return;
        }

        // Extract squadron/wing data from nested join
        const assignment = (data as any).pilot_assignments?.[0];
        const squadron = assignment?.org_squadrons;
        const wing = squadron?.org_wings;

        setPilot({
          id: data.id,
          callsign: data.callsign || '',
          boardNumber: data.boardNumber,
          wingInsigniaUrl: (wing as any)?.wingInsigniaUrl || null,
          squadronInsigniaUrl: (squadron as any)?.squadronInsigniaUrl || null,
          squadronDesignation: squadron?.designation || null,
        });
        lastLookupRef.current = boardNumber;
      } catch {
        if (!cancelled) setPilot(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    lookup();
    return () => { cancelled = true; };
  }, [boardNumber]);

  return { pilot, loading };
}

/**
 * Looks up LSO's own pilot info for the header display.
 */
export function useLSOPilotInfo(pilotId: string | null) {
  const [lsoInfo, setLsoInfo] = useState<ResolvedPilot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pilotId) {
      setLsoInfo(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('pilots')
          .select(`
            id,
            callsign,
            boardNumber,
            pilot_assignments(
              org_squadrons(
                designation,
                squadronInsigniaUrl:insignia_url,
                org_wings(
                  name,
                  wingInsigniaUrl:insignia_url
                )
              )
            )
          `)
          .eq('id', pilotId)
          .is('pilot_assignments.end_date', null)
          .single();

        if (cancelled) return;

        if (error || !data) {
          setLsoInfo(null);
          return;
        }

        const assignment = (data as any).pilot_assignments?.[0];
        const squadron = assignment?.org_squadrons;
        const wing = squadron?.org_wings;

        setLsoInfo({
          id: data.id,
          callsign: data.callsign || '',
          boardNumber: data.boardNumber,
          wingInsigniaUrl: (wing as any)?.wingInsigniaUrl || null,
          squadronInsigniaUrl: (squadron as any)?.squadronInsigniaUrl || null,
          squadronDesignation: squadron?.designation || null,
        });
      } catch {
        if (!cancelled) setLsoInfo(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [pilotId]);

  return { lsoInfo, loading };
}
