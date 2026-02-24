import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { Sun, Moon } from 'lucide-react';
import LSOGradingHeader from './LSOGradingHeader';
import LSOPhaseSelector from './LSOPhaseSelector';
import LSOPreBallCallPad from './LSOPreBallCallPad';
import LSOGradingPad from './LSOGradingPad';
import LSOWireOutcomeRow from './LSOWireOutcomeRow';
import LSOGrooveRow from './LSOGrooveRow';
import LSOGradeRow from './LSOGradeRow';
import LSOCommentsRow from './LSOCommentsRow';
import LSOGradingString from './LSOGradingString';
import { useLSOGradeState } from './hooks/useLSOGradeState';
import { useGrooveTimer } from './hooks/useGrooveTimer';
import { usePilotLookup, useLSOPilotInfo } from './hooks/usePilotLookup';
import { fetchCarriers } from '../../../utils/supabaseClient';
import type { Carrier } from './types/lsoTypes';

const GAP = 6;

interface LSOGradingKneeboardProps {
  theme: 'light' | 'dark';
  colors: Record<string, string>;
  currentPilotId: string | null;
  selectedMissionId: string | null;
}

const LSOGradingKneeboard: React.FC<LSOGradingKneeboardProps> = ({
  theme,
  colors,
  currentPilotId,
  selectedMissionId,
}) => {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const hasStartedTimer = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(0);

  // Fixed cell size: 9 columns × 142px + 8 gaps = 1326px, 13 rows × 142px + 13 gaps = 1924px
  useLayoutEffect(() => {
    setCellSize(142);
  }, []);

  const gridWidth = 9 * cellSize + 8 * GAP;

  // Core state hook
  const gradeState = useLSOGradeState(currentPilotId);

  // Groove timer
  const grooveTimer = useGrooveTimer();

  // LSO's own pilot info for header
  const { lsoInfo } = useLSOPilotInfo(currentPilotId);

  // Pilot lookup from entered board number
  const { pilot: resolvedPilot } = usePilotLookup(gradeState.entry.boardNumber);

  // Sync resolved pilot info into grade state
  useEffect(() => {
    if (resolvedPilot) {
      gradeState.setPilotInfo(resolvedPilot.id, resolvedPilot.callsign);
    } else {
      gradeState.setPilotInfo(null, null);
    }
  }, [resolvedPilot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync mission ID into grade state
  useEffect(() => {
    gradeState.setMissionId(selectedMissionId);
  }, [selectedMissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch carriers on mount
  useEffect(() => {
    const loadCarriers = async () => {
      const data = await fetchCarriers();
      if (data && data.length > 0) {
        setCarriers(data as Carrier[]);
        if (!gradeState.entry.carrierId) {
          gradeState.setCarrierId(data[0].id);
        }
      }
    };
    loadCarriers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance to X phase when all pre-ball-call fields are complete
  const { boardNumber, aircraftType, fuelState, currentPhase } = gradeState.entry;
  useEffect(() => {
    if (boardNumber && aircraftType && /^\d+\.\d+$/.test(fuelState) && !currentPhase) {
      gradeState.selectPhase('X');
    }
  }, [boardNumber, aircraftType, fuelState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle first keypress on pre-ball-call pads (starts groove timer)
  const handleKeyPress = useCallback(() => {
    if (!hasStartedTimer.current && !grooveTimer.isRunning) {
      grooveTimer.start();
      hasStartedTimer.current = true;
    }
  }, [grooveTimer]);

  // Handle ball call (BC button)
  const handleBallCall = useCallback(() => {
    if (!grooveTimer.isRunning) {
      grooveTimer.start();
      hasStartedTimer.current = true;
    }
    gradeState.setBallCall(true);
    gradeState.selectPhase('X');
  }, [grooveTimer, gradeState]);

  // Handle timer toggle from phase selector
  const handleTimerToggle = useCallback(() => {
    if (grooveTimer.isRunning) {
      grooveTimer.reset();
      hasStartedTimer.current = false;
    } else {
      grooveTimer.start();
      hasStartedTimer.current = true;
    }
  }, [grooveTimer]);

  // Handle wire/outcome selection (stops groove timer)
  const handleWireSelect = useCallback((wire: number) => {
    gradeState.selectWire(wire);
    if (grooveTimer.isRunning) {
      const elapsed = grooveTimer.stop();
      gradeState.setGrooveTime(elapsed);
    }
  }, [gradeState, grooveTimer]);

  // Handle ARRESTMENT/WAVE OFF deviation toggles (stops groove timer on selection)
  const handleOutcomeDeviation = useCallback((symbol: string) => {
    gradeState.toggleDeviation(symbol);
    if (grooveTimer.isRunning) {
      const elapsed = grooveTimer.stop();
      gradeState.setGrooveTime(elapsed);
    }
  }, [gradeState, grooveTimer]);

  const handleNoHook = useCallback(() => {
    gradeState.toggleNoHook();
    if (grooveTimer.isRunning) {
      const elapsed = grooveTimer.stop();
      gradeState.setGrooveTime(elapsed);
    }
  }, [gradeState, grooveTimer]);

  // Handle delete (reset all)
  const handleDelete = useCallback(() => {
    gradeState.resetGrade();
    grooveTimer.reset();
    hasStartedTimer.current = false;
  }, [gradeState, grooveTimer]);

  // Handle save
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (grooveTimer.elapsedSeconds > 0) {
      gradeState.setGrooveTime(grooveTimer.elapsedSeconds);
    }
    const success = await gradeState.saveGrade();
    if (success) {
      grooveTimer.reset();
      hasStartedTimer.current = false;
      gradeState.resetGrade();
    }
    return success;
  }, [gradeState, grooveTimer]);

  // Day/night toggle
  const handleNightToggle = useCallback(() => {
    gradeState.toggleNight();
  }, [gradeState]);

  // Outcome deviations: ARRESTMENT (B/HS/T&G) and WAVE OFF (WO/WOFD/OWO)
  const OUTCOME_DEV_SYMBOLS = ['BLTR', 'HS', 'T&G', 'WO', 'WOFD', 'OWO'];
  const hasOutcomeDev = gradeState.entry.deviations.some(d => OUTCOME_DEV_SYMBOLS.includes(d.symbol));

  // Can save: need board number, aircraft type, grade, and an outcome (wire trap OR outcome deviation)
  const canSave = !!(
    gradeState.entry.boardNumber &&
    gradeState.entry.aircraftType &&
    gradeState.entry.overallGrade &&
    (gradeState.entry.outcomeType || hasOutcomeDev) &&
    gradeState.entry.carrierId
  );

  // No-hook: no wire, no outcome set, no outcome deviation
  const isNoHook = gradeState.entry.wireNumber === null &&
    gradeState.entry.outcomeType === null &&
    !hasOutcomeDev;

  const isGrading = gradeState.uiState === 'grading';

  // Pattern row deviation state
  const twaSeverity = gradeState.entry.twaSeverity;
  const tcaSeverity = gradeState.entry.tcaSeverity;

  const sqBase: React.CSSProperties = {
    width: `${cellSize}px`,
    height: `${cellSize}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '32px',
  };

  const deviationBtn = (severity: typeof twaSeverity): React.CSSProperties => ({
    ...sqBase,
    backgroundColor: severity
      ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.15)')
      : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb'),
    border: severity ? `2px solid ${colors.success}` : `1px solid ${colors.border}`,
    color: severity ? colors.text : colors.textSecondary,
    fontWeight: severity ? 700 : 500,
  });

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        backgroundColor: colors.background,
        position: 'relative',
      }}
    >
      {cellSize > 0 && (
        <div style={{
          width: `${gridWidth}px`,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: `${GAP}px`,
          paddingTop: `${GAP}px`,
        }}>
          {/* Row 1: Header */}
          <LSOGradingHeader
            theme={theme}
            colors={colors}
            lsoInfo={lsoInfo}
            carriers={carriers}
            selectedCarrierId={gradeState.entry.carrierId}
            onCarrierChange={gradeState.setCarrierId}
            cellSize={cellSize}
          />

          {/* Row 2: Pattern deviations + Day/Night toggle */}
          <div style={{
            display: 'flex',
            gap: `${GAP}px`,
            flexShrink: 0,
          }}>
            <div style={{
              ...sqBase,
              cursor: 'default',
              fontSize: '24px',
              fontWeight: 600,
              color: colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
              lineHeight: '1.3',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
            }}>
              PATTERN
            </div>
            <button onClick={() => gradeState.togglePatternDeviation('TWA')} style={deviationBtn(twaSeverity)}>
              {twaSeverity === 'a_little' ? '(TWA)' : twaSeverity === 'gross' ? '_TWA_' : 'TWA'}
            </button>
            <button onClick={() => gradeState.togglePatternDeviation('TCA')} style={deviationBtn(tcaSeverity)}>
              {tcaSeverity === 'a_little' ? '(TCA)' : tcaSeverity === 'gross' ? '_TCA_' : 'TCA'}
            </button>
            <div style={{ width: `${cellSize}px`, height: `${cellSize}px`, flexShrink: 0 }} />
            <div style={{ width: `${cellSize}px`, height: `${cellSize}px`, flexShrink: 0 }} />
            <div style={{ width: `${cellSize}px`, height: `${cellSize}px`, flexShrink: 0 }} />
            <div style={{ width: `${cellSize}px`, height: `${cellSize}px`, flexShrink: 0 }} />
            <button onClick={handleNightToggle} style={{
              ...sqBase,
              backgroundColor: !gradeState.entry.isNight
                ? (theme === 'dark' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.15)')
                : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb'),
              border: !gradeState.entry.isNight ? `2px solid ${colors.warning}` : `1px solid ${colors.border}`,
              color: !gradeState.entry.isNight ? colors.warning : colors.textSecondary,
            }}>
              <Sun size={48} strokeWidth={2.5} />
            </button>
            <button onClick={handleNightToggle} style={{
              ...sqBase,
              backgroundColor: gradeState.entry.isNight
                ? (theme === 'dark' ? 'rgba(124, 58, 237, 0.3)' : 'rgba(124, 58, 237, 0.15)')
                : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb'),
              border: gradeState.entry.isNight ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
              color: gradeState.entry.isNight ? colors.accent : colors.textSecondary,
            }}>
              <Moon size={48} strokeWidth={2.5} />
            </button>
          </div>

          {/* Row 3: Phase Selector */}
          <LSOPhaseSelector
            theme={theme}
            colors={colors}
            currentPhase={gradeState.entry.currentPhase}
            onPhaseSelect={gradeState.selectPhase}
            timerRunning={grooveTimer.isRunning}
            onTimerToggle={handleTimerToggle}
            cellSize={cellSize}
          />

          {/* Rows 4-11: Content area */}
          {!isGrading ? (
            <LSOPreBallCallPad
              theme={theme}
              colors={colors}
              boardNumber={gradeState.entry.boardNumber}
              aircraftType={gradeState.entry.aircraftType}
              fuelState={gradeState.entry.fuelState}
              onBoardNumberChange={gradeState.setBoardNumber}
              onAircraftTypeChange={gradeState.setAircraftType}
              onFuelStateChange={gradeState.setFuelState}
              onBallCall={handleBallCall}
              onKeyPress={handleKeyPress}
              cellSize={cellSize}
            />
          ) : (
            <>
              <LSOGradingPad
                theme={theme}
                colors={colors}
                currentPhase={gradeState.entry.currentPhase!}
                getDeviationState={gradeState.getDeviationState}
                onToggleDeviation={gradeState.toggleDeviation}
                cellSize={cellSize}
              />

              <LSOWireOutcomeRow
                theme={theme}
                colors={colors}
                wireNumber={gradeState.entry.wireNumber}
                onWireSelect={handleWireSelect}
                getDeviationState={gradeState.getDeviationState}
                onToggleDeviation={handleOutcomeDeviation}
                cellSize={cellSize}
              />

              <LSOGrooveRow
                theme={theme}
                colors={colors}
                formattedTime={grooveTimer.formattedTime}
                isTimerRunning={grooveTimer.isRunning}
                nesaState={gradeState.getDeviationState('NESA')}
                ligState={gradeState.getDeviationState('LIG')}
                isNoHook={isNoHook}
                onToggleNESA={() => gradeState.toggleDeviation('NESA')}
                onToggleLIG={() => gradeState.toggleDeviation('LIG')}
                onNoHook={handleNoHook}
                getDeviationState={gradeState.getDeviationState}
                onToggleDeviation={handleOutcomeDeviation}
                cellSize={cellSize}
              />

              <LSOGradeRow
                theme={theme}
                colors={colors}
                selectedGrade={gradeState.entry.overallGrade}
                onGradeSelect={gradeState.selectGrade}
                cellSize={cellSize}
              />

              <LSOCommentsRow
                theme={theme}
                colors={colors}
                comments={gradeState.entry.comments}
                onToggle={gradeState.toggleComment}
                cellSize={cellSize}
              />
            </>
          )}

          {/* Row 12: Footer */}
          <LSOGradingString
            theme={theme}
            colors={colors}
            shorthand={gradeState.shorthand}
            pilotBoardNumber={gradeState.entry.boardNumber}
            pilotCallsign={resolvedPilot?.callsign || null}
            canSave={canSave}
            saving={gradeState.saving}
            onDelete={handleDelete}
            onSave={handleSave}
            cellSize={cellSize}
          />
        </div>
      )}

      {/* Error display */}
      {gradeState.saveError && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '8px 16px',
          backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)',
          borderTop: `1px solid ${colors.error}`,
          color: colors.error,
          fontSize: '12px',
          textAlign: 'center',
        }}>
          {gradeState.saveError}
        </div>
      )}
    </div>
  );
};

export default LSOGradingKneeboard;
