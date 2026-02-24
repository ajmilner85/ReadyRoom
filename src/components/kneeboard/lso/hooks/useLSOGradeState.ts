import { useState, useCallback } from 'react';
import type {
  GradeEntry,
  GradeType,
  OutcomeType,
  ApproachPhase,
  Deviation,
  DeviationSeverity,
} from '../types/lsoTypes';
import { GRADE_POINTS } from '../types/lsoTypes';
import { DEFAULT_PAD_BUTTONS } from '../data/padConfig';
import { generateShorthand } from '../utils/shorthandGenerator';
import { supabase } from '../../../../utils/supabaseClient';

export type GradeUIState = 'pre_ball_call' | 'grading' | 'saving';

const INITIAL_ENTRY: GradeEntry = {
  carrierId: '',
  missionId: null,
  boardNumber: '',
  aircraftType: '',
  fuelState: '',
  pilotId: null,
  pilotCallsign: null,
  isNight: false,
  currentPhase: null,
  deviations: [],
  wireNumber: null,
  outcomeType: null,
  overallGrade: null,
  grooveTimeSeconds: null,
  hasBallCall: false,
  hasWaveOff: false,
  pendingOC: false,
  twaSeverity: null,
  tcaSeverity: null,
  nesaSeverity: null,
  ligSeverity: null,
  aaSeverity: null,
  comments: {},
  remarks: '',
};

// Severity tap cycle: none -> a_little -> reasonable -> gross -> none
const SEVERITY_CYCLE: (DeviationSeverity | null)[] = [null, 'a_little', 'reasonable', 'gross'];

function getNextSeverity(current: DeviationSeverity | null): DeviationSeverity | null {
  const idx = SEVERITY_CYCLE.indexOf(current);
  const nextIdx = (idx + 1) % SEVERITY_CYCLE.length;
  return SEVERITY_CYCLE[nextIdx];
}

// Symbols handled as global state (not phase-associated deviations)
const GLOBAL_SYMBOLS = new Set(['NESA', 'LIG', 'AA']);

export function useLSOGradeState(lsoPilotId: string | null) {
  const [entry, setEntry] = useState<GradeEntry>(INITIAL_ENTRY);
  const [uiState, setUIState] = useState<GradeUIState>('pre_ball_call');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Shorthand string generated from current state
  const shorthand = generateShorthand(
    entry.deviations,
    entry.overallGrade,
    entry.wireNumber,
    entry.outcomeType,
    entry.hasBallCall,
    entry.hasWaveOff,
    entry.twaSeverity,
    entry.tcaSeverity,
    entry.nesaSeverity,
    entry.ligSeverity,
    entry.aaSeverity,
    entry.comments
  );

  // --- Pre-ball-call setters ---

  const setCarrierId = useCallback((carrierId: string) => {
    setEntry(prev => ({ ...prev, carrierId }));
  }, []);

  const setMissionId = useCallback((missionId: string | null) => {
    setEntry(prev => ({ ...prev, missionId }));
  }, []);

  const setBoardNumber = useCallback((boardNumber: string) => {
    setEntry(prev => ({ ...prev, boardNumber }));
  }, []);

  const setAircraftType = useCallback((aircraftType: string) => {
    setEntry(prev => ({ ...prev, aircraftType }));
  }, []);

  const setFuelState = useCallback((fuelState: string) => {
    setEntry(prev => ({ ...prev, fuelState }));
  }, []);

  const setPilotInfo = useCallback((pilotId: string | null, pilotCallsign: string | null) => {
    setEntry(prev => ({ ...prev, pilotId, pilotCallsign }));
  }, []);

  const toggleNight = useCallback(() => {
    setEntry(prev => ({ ...prev, isNight: !prev.isNight }));
  }, []);

  // --- Phase selection ---

  const selectPhase = useCallback((phase: ApproachPhase) => {
    setEntry(prev => ({
      ...prev,
      currentPhase: phase,
      // Clear pendingOC when switching phases — it was waiting for a deviation in the old phase
      pendingOC: false,
    }));
    setUIState(prev => prev === 'pre_ball_call' ? 'grading' : prev);
  }, []);

  // --- Deviation toggle (tap cycle) ---

  const toggleDeviation = useCallback((symbol: string) => {
    // --- Global groove/approach characteristics (not phase-associated) ---
    if (symbol === 'AA') {
      setEntry(prev => ({ ...prev, aaSeverity: prev.aaSeverity ? null : 'reasonable' }));
      return;
    }

    if (symbol === 'NESA') {
      setEntry(prev => ({
        ...prev,
        nesaSeverity: getNextSeverity(prev.nesaSeverity),
        ligSeverity: null, // NESA and LIG are exclusive
      }));
      return;
    }

    if (symbol === 'LIG') {
      setEntry(prev => ({
        ...prev,
        ligSeverity: getNextSeverity(prev.ligSeverity),
        nesaSeverity: null, // NESA and LIG are exclusive
      }));
      return;
    }

    // --- OC prefix modifier ---
    if (symbol === 'OC') {
      setEntry(prev => {
        const phase = prev.currentPhase;
        if (!phase) return prev;

        // Find the most recent deviation in the current phase
        let lastPhaseDevIdx = -1;
        for (let i = prev.deviations.length - 1; i >= 0; i--) {
          if (prev.deviations[i].phase === phase) {
            lastPhaseDevIdx = i;
            break;
          }
        }

        if (lastPhaseDevIdx >= 0) {
          // Toggle isOC on the most recent phase deviation
          const newDeviations = [...prev.deviations];
          newDeviations[lastPhaseDevIdx] = {
            ...newDeviations[lastPhaseDevIdx],
            isOC: !newDeviations[lastPhaseDevIdx].isOC,
          };
          return { ...prev, deviations: newDeviations };
        } else {
          // No deviations yet in this phase — set pending; next deviation gets OC
          return { ...prev, pendingOC: !prev.pendingOC };
        }
      });
      return;
    }

    // --- Standard phase deviations ---
    setEntry(prev => {
      const phase = prev.currentPhase;
      if (!phase) return prev;

      const buttonDef = DEFAULT_PAD_BUTTONS.find(b => b.symbol === symbol);
      const isBinary = !!buttonDef?.binaryToggle;

      const existingIdx = prev.deviations.findIndex(
        d => d.phase === phase && d.symbol === symbol
      );

      let newDeviations = [...prev.deviations];

      if (existingIdx >= 0) {
        if (isBinary) {
          // Binary toggle: always remove on second tap
          newDeviations.splice(existingIdx, 1);
        } else {
          // Cycle severity
          const current = newDeviations[existingIdx].severity;
          const next = getNextSeverity(current);
          if (next === null) {
            newDeviations.splice(existingIdx, 1);
          } else {
            newDeviations[existingIdx] = { ...newDeviations[existingIdx], severity: next };
          }
        }
      } else {
        // New deviation — handle exclusive groups
        if (buttonDef?.exclusiveGroup) {
          const conflicting = DEFAULT_PAD_BUTTONS
            .filter(b => b.exclusiveGroup === buttonDef.exclusiveGroup && b.symbol !== symbol)
            .map(b => b.symbol);
          newDeviations = newDeviations.filter(
            d => !(d.phase === phase && conflicting.includes(d.symbol))
          );
        }

        // Apply pendingOC if set
        const newDev: Deviation = {
          phase,
          symbol,
          severity: isBinary ? 'reasonable' : 'a_little',
          isOC: prev.pendingOC || undefined,
        };
        newDeviations.push(newDev);
      }

      return {
        ...prev,
        deviations: newDeviations,
        pendingOC: false, // Consumed by this deviation (or cleared if cycling existing)
      };
    });
  }, []);

  // --- Wire/Outcome ---

  const selectWire = useCallback((wire: number) => {
    setEntry(prev => ({
      ...prev,
      wireNumber: wire,
      outcomeType: 'TRAP',
    }));
  }, []);

  const selectOutcome = useCallback((outcome: OutcomeType) => {
    setEntry(prev => ({
      ...prev,
      outcomeType: outcome,
      wireNumber: outcome === 'TRAP' ? prev.wireNumber : null,
      // OWO and WOFD are mutually exclusive with WO
      hasWaveOff: (outcome === 'OWN_WAVE_OFF' || outcome === 'WOFD') ? false : prev.hasWaveOff,
    }));
  }, []);

  const toggleWaveOff = useCallback(() => {
    setEntry(prev => ({
      ...prev,
      hasWaveOff: !prev.hasWaveOff,
      // Activating WO clears OWO and WOFD
      outcomeType: !prev.hasWaveOff && (prev.outcomeType === 'OWN_WAVE_OFF' || prev.outcomeType === 'WOFD') ? null : prev.outcomeType,
    }));
  }, []);

  const toggleNoHook = useCallback(() => {
    setEntry(prev => ({
      ...prev,
      wireNumber: null,
      outcomeType: null,
    }));
  }, []);

  // --- Comments ---

  // Toggle a comment button. hasTwoStates = true for dual-label buttons (cycles 0→1→2→0).
  const toggleComment = useCallback((key: string, hasTwoStates: boolean) => {
    setEntry(prev => {
      const current = prev.comments[key] ?? 0;
      const next = hasTwoStates ? (current + 1) % 3 : (current === 0 ? 1 : 0);
      const newComments = { ...prev.comments };
      if (next === 0) {
        delete newComments[key];
      } else {
        newComments[key] = next;
      }
      return { ...prev, comments: newComments };
    });
  }, []);

  // --- Grade ---

  const selectGrade = useCallback((grade: GradeType) => {
    setEntry(prev => ({
      ...prev,
      overallGrade: prev.overallGrade === grade ? null : grade,
    }));
  }, []);

  // --- Groove ---

  const setGrooveTime = useCallback((seconds: number) => {
    setEntry(prev => ({ ...prev, grooveTimeSeconds: seconds }));
  }, []);

  // --- Ball call ---

  const setBallCall = useCallback((value: boolean) => {
    setEntry(prev => ({ ...prev, hasBallCall: value }));
  }, []);

  // --- Remarks ---

  const setRemarks = useCallback((remarks: string) => {
    setEntry(prev => ({ ...prev, remarks }));
  }, []);

  // --- Reset ---

  const resetGrade = useCallback(() => {
    setEntry(prev => ({
      ...INITIAL_ENTRY,
      carrierId: prev.carrierId,
      missionId: prev.missionId,
      isNight: prev.isNight, // Preserve day/night setting
    }));
    setUIState('pre_ball_call');
    setSaveError(null);
  }, []);

  // --- Save ---

  const saveGrade = useCallback(async (): Promise<boolean> => {
    // Derive effective outcome: wire selection sets outcomeType directly;
    // ARRESTMENT/WAVE OFF deviation buttons set it implicitly
    let effectiveOutcome = entry.outcomeType;
    if (!effectiveOutcome) {
      if (entry.deviations.some(d => ['BLTR', 'HS', 'T&G'].includes(d.symbol))) {
        effectiveOutcome = 'BOLTER';
      } else if (entry.deviations.some(d => d.symbol === 'WOFD')) {
        effectiveOutcome = 'WOFD';
      } else if (entry.deviations.some(d => d.symbol === 'OWO')) {
        effectiveOutcome = 'OWN_WAVE_OFF';
      } else if (entry.deviations.some(d => d.symbol === 'WO') || entry.hasWaveOff) {
        effectiveOutcome = 'WAVE_OFF';
      }
    }

    if (!lsoPilotId || !entry.carrierId || !entry.boardNumber || !entry.overallGrade || !effectiveOutcome) {
      setSaveError('Missing required fields');
      return false;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const { error } = await supabase.from('lso_grades').insert({
        mission_id: entry.missionId,
        carrier_id: entry.carrierId,
        pilot_id: entry.pilotId,
        grading_lso_id: lsoPilotId,
        board_number: entry.boardNumber,
        aircraft_type: entry.aircraftType,
        fuel_state: entry.fuelState ? parseFloat(entry.fuelState) : null,
        overall_grade: entry.overallGrade,
        grade_points: GRADE_POINTS[entry.overallGrade],
        wire_number: entry.wireNumber,
        outcome_type: effectiveOutcome,
        deviations: entry.deviations,
        lso_comment: shorthand,
        groove_time_seconds: entry.grooveTimeSeconds,
        is_night: entry.isNight,
        remarks: entry.remarks || null,
      });

      if (error) {
        setSaveError(error.message);
        return false;
      }

      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  }, [lsoPilotId, entry, shorthand]);

  // Get deviation state for a symbol in the current phase
  const getDeviationState = useCallback((symbol: string): DeviationSeverity | null => {
    // Global characteristics
    if (symbol === 'NESA') return entry.nesaSeverity;
    if (symbol === 'LIG') return entry.ligSeverity;
    if (symbol === 'AA') return entry.aaSeverity;

    // OC: active when pendingOC OR when last phase deviation has isOC
    if (symbol === 'OC') {
      if (entry.pendingOC) return 'reasonable';
      const phase = entry.currentPhase;
      if (!phase) return null;
      for (let i = entry.deviations.length - 1; i >= 0; i--) {
        if (entry.deviations[i].phase === phase) {
          return entry.deviations[i].isOC ? 'reasonable' : null;
        }
      }
      return null;
    }

    if (!entry.currentPhase) return null;
    const dev = entry.deviations.find(
      d => d.phase === entry.currentPhase && d.symbol === symbol
    );
    return dev?.severity ?? null;
  }, [entry.deviations, entry.currentPhase, entry.nesaSeverity, entry.ligSeverity, entry.aaSeverity, entry.pendingOC]);

  // Toggle a pattern deviation (TWA/TCA) — phase-independent, mutually exclusive with each other
  const togglePatternDeviation = useCallback((symbol: 'TWA' | 'TCA') => {
    setEntry(prev => {
      if (symbol === 'TWA') {
        const next = getNextSeverity(prev.twaSeverity);
        return { ...prev, twaSeverity: next, tcaSeverity: next !== null ? null : prev.tcaSeverity };
      } else {
        const next = getNextSeverity(prev.tcaSeverity);
        return { ...prev, tcaSeverity: next, twaSeverity: next !== null ? null : prev.twaSeverity };
      }
    });
  }, []);

  return {
    entry,
    uiState,
    shorthand,
    saving,
    saveError,

    // Pre-ball-call
    setCarrierId,
    setMissionId,
    setBoardNumber,
    setAircraftType,
    setFuelState,
    setPilotInfo,
    toggleNight,
    setBallCall,

    // Grading
    selectPhase,
    toggleDeviation,
    selectWire,
    selectOutcome,
    toggleWaveOff,
    toggleNoHook,
    toggleComment,
    selectGrade,
    setGrooveTime,
    setRemarks,
    getDeviationState,
    togglePatternDeviation,

    // Actions
    resetGrade,
    saveGrade,
  };
}
