import type { Deviation, GradeType, OutcomeType, ApproachPhase, DeviationSeverity } from '../types/lsoTypes';
import { GRADE_DISPLAY, PHASE_ORDER, ALL_THE_WAY_PHASES } from '../types/lsoTypes';
import { COMMENT_BUTTONS } from '../data/padConfig';

// Severity notation wrappers per NATOPS
const SEVERITY_PREFIX: Record<DeviationSeverity, string> = {
  a_little: '(',
  reasonable: '',
  gross: '_',
};

const SEVERITY_SUFFIX: Record<DeviationSeverity, string> = {
  a_little: ')',
  reasonable: '',
  gross: '_',
};

// Internal symbol → NATOPS shorthand notation (where internal key differs from display label)
const SYMBOL_ALIASES: Record<string, string> = {
  'BLTR': 'B', // Arrestment bolter — avoids clash with GLIDE SLOPE 'B' symbol
};

function formatSymbol(symbol: string, severity: DeviationSeverity, isOC?: boolean): string {
  const pre = SEVERITY_PREFIX[severity];
  const suf = SEVERITY_SUFFIX[severity];
  const ocPfx = isOC ? 'OC' : '';
  const notation = SYMBOL_ALIASES[symbol] ?? symbol;
  return `${ocPfx}${pre}${notation}${suf}`;
}

/**
 * Builds the deviation tokens applying consecutive-phase consolidation.
 *
 * Rules:
 * - Same symbol + severity + isOC in consecutive phases → range notation: HIX-IM
 * - If the run spans all of X, IM, IC, AR (the core groove) → AW notation: HIAW
 * - Non-consolidated deviations in the same phase are concatenated before the phase: LO(S)X
 */
function buildDeviationTokens(deviations: Deviation[]): string[] {
  if (deviations.length === 0) return [];

  // Step 1: Group by (symbol, severity, isOC) key
  type Group = { symbol: string; severity: DeviationSeverity; isOC: boolean; phases: ApproachPhase[] };
  const groups = new Map<string, Group>();

  for (const dev of deviations) {
    const key = `${dev.symbol}|${dev.severity}|${dev.isOC ? '1' : '0'}`;
    if (!groups.has(key)) {
      groups.set(key, { symbol: dev.symbol, severity: dev.severity, isOC: dev.isOC ?? false, phases: [] });
    }
    groups.get(key)!.phases.push(dev.phase);
  }

  // Step 2: Sort each group's phases by PHASE_ORDER index
  for (const g of groups.values()) {
    g.phases.sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b));
  }

  // Step 3: Split each group into consecutive runs
  type Token = { startIdx: number; text: string; phases: Set<ApproachPhase> };
  const tokens: Token[] = [];
  const consolidatedPairs = new Set<string>(); // "symbol|phase" pairs covered by consolidated tokens

  for (const g of groups.values()) {
    const runs: ApproachPhase[][] = [];
    let run: ApproachPhase[] = [g.phases[0]];

    for (let i = 1; i < g.phases.length; i++) {
      const prevIdx = PHASE_ORDER.indexOf(g.phases[i - 1]);
      const currIdx = PHASE_ORDER.indexOf(g.phases[i]);
      if (currIdx === prevIdx + 1) {
        run.push(g.phases[i]);
      } else {
        runs.push(run);
        run = [g.phases[i]];
      }
    }
    runs.push(run);

    for (const r of runs) {
      const startPhase = r[0];
      const endPhase = r[r.length - 1];
      const startIdx = PHASE_ORDER.indexOf(startPhase);

      if (r.length >= 2) {
        // Check for "all the way" — run must include all four core groove phases
        const runSet = new Set(r);
        const isAllTheWay = ALL_THE_WAY_PHASES.every(p => runSet.has(p));

        let text: string;
        if (isAllTheWay) {
          text = `${formatSymbol(g.symbol, g.severity, g.isOC)}AW`;
        } else {
          text = `${formatSymbol(g.symbol, g.severity, g.isOC)}${startPhase}-${endPhase}`;
        }

        // Mark all these (symbol, phase) pairs as consolidated
        for (const p of r) {
          consolidatedPairs.add(`${g.symbol}|${p}`);
        }

        tokens.push({ startIdx, text, phases: new Set(r) });
      }
      // Single-phase runs are NOT added here — handled in Step 4
    }
  }

  // Step 4: For non-consolidated (single-phase) deviations, group by phase and concatenate
  const byPhase = new Map<ApproachPhase, Deviation[]>();
  for (const dev of deviations) {
    const key = `${dev.symbol}|${dev.phase}`;
    if (!consolidatedPairs.has(key)) {
      if (!byPhase.has(dev.phase)) byPhase.set(dev.phase, []);
      byPhase.get(dev.phase)!.push(dev);
    }
  }

  for (const [phase, devs] of byPhase.entries()) {
    const startIdx = PHASE_ORDER.indexOf(phase);

    // Merge CB with its host (US or OS) so severity wraps the full compound: (USCB), not (US)CB
    const cb = devs.find(d => d.symbol === 'CB');
    const host = devs.find(d => d.symbol === 'US' || d.symbol === 'OS');
    let processedDevs: typeof devs;
    if (cb && host) {
      const compound = host.symbol + 'CB'; // USCB or OSCB
      processedDevs = devs
        .filter(d => d !== cb)
        .map(d => d === host ? { ...host, symbol: compound } : d);
    } else {
      processedDevs = devs;
    }

    // Merge R modifiers (P, N, W, RR, A) into R compound; suppress R if no modifiers present
    const R_MODIFIER_ORDER = ['P', 'N', 'W', 'RR', 'A'];
    const rDev = processedDevs.find(d => d.symbol === 'R');
    const activeRMods = processedDevs.filter(d => R_MODIFIER_ORDER.includes(d.symbol));
    if (rDev) {
      if (activeRMods.length > 0) {
        const modSuffix = R_MODIFIER_ORDER
          .filter(s => activeRMods.some(m => m.symbol === s))
          .join('');
        processedDevs = processedDevs
          .filter(d => !R_MODIFIER_ORDER.includes(d.symbol))
          .map(d => d === rDev ? { ...rDev, symbol: 'R' + modSuffix } : d);
      } else {
        // R alone — suppress from shorthand
        processedDevs = processedDevs.filter(d => d !== rDev);
      }
    }

    // Merge WU modifiers (P, A) into WU compound; suppress WU if no modifiers present
    // (P/A already consumed by R compound above if R was active)
    const WU_MODIFIER_ORDER = ['P', 'A'];
    const wuDev = processedDevs.find(d => d.symbol === 'WU');
    const activeWUMods = processedDevs.filter(d => WU_MODIFIER_ORDER.includes(d.symbol));
    if (wuDev) {
      if (activeWUMods.length > 0) {
        const modSuffix = WU_MODIFIER_ORDER
          .filter(s => activeWUMods.some(m => m.symbol === s))
          .join('');
        processedDevs = processedDevs
          .filter(d => !WU_MODIFIER_ORDER.includes(d.symbol))
          .map(d => d === wuDev ? { ...wuDev, symbol: 'WU' + modSuffix } : d);
      } else {
        // WU alone — suppress from shorthand
        processedDevs = processedDevs.filter(d => d !== wuDev);
      }
    }

    if (processedDevs.length === 0) continue;
    const symbolParts = processedDevs.map(d => formatSymbol(d.symbol, d.severity, d.isOC));
    tokens.push({ startIdx, text: `${symbolParts.join('')}${phase}`, phases: new Set([phase]) });
  }

  // Sort by start phase index
  tokens.sort((a, b) => a.startIdx - b.startIdx);

  return tokens.map(t => t.text);
}

/**
 * Generates the LSO grading shorthand string from the current grade state.
 *
 * Format: {OPENER} [BC] {PHASE_DEVIATIONS} {GROOVE_CHARS} {WIRE_OR_OUTCOME}
 *
 * Opener:
 *   - TRAP pass:            grade display (OK, (OK), _OK_, --, C, NC)
 *   - Bolter:               B
 *   - Wave-off:             WO
 *   - Own wave-off:         OWO
 *   - Wave-off foul deck:   WOFD
 *   - Landed on WO (trap):  C  (forced to Cut, "LANDED ON WO" appended)
 *   - Landed on WO (bolter): C (forced to Cut, "LANDED ON WO" appended)
 *
 * NESA / LIG / AA appear after phase deviations without phase suffix.
 * Wire # appears last for TRAPs only (or when a trap follows a WO).
 * Comments (TTH, AFU, etc.) appear at the very end.
 */
export function generateShorthand(
  deviations: Deviation[],
  grade: GradeType | null,
  wireNumber: number | null,
  outcomeType: OutcomeType | null,
  hasBallCall: boolean = false,
  hasWaveOff: boolean = false,
  twaSeverity: DeviationSeverity | null = null,
  tcaSeverity: DeviationSeverity | null = null,
  nesaSeverity: DeviationSeverity | null = null,
  ligSeverity: DeviationSeverity | null = null,
  aaSeverity: DeviationSeverity | null = null,
  comments: Record<string, number> = {}
): string {
  const parts: string[] = [];

  // Outcome deviation symbols — used for opener, excluded from phase-tagged tokens
  const OUTCOME_DEV_SYMS = new Set(['BLTR', 'HS', 'T&G', 'WO', 'WOFD', 'OWO']);

  // Detect active outcome deviations
  const woActive = hasWaveOff || deviations.some(d => d.symbol === 'WO');
  const bolterDev = deviations.find(d => ['BLTR', 'HS', 'T&G'].includes(d.symbol));
  const wofdActive = deviations.some(d => d.symbol === 'WOFD');
  const owoActive = deviations.some(d => d.symbol === 'OWO');

  // "Landed on WO" = WO active but pilot still trapped or boltered
  const landedOnWO = woActive && (outcomeType === 'TRAP' || !!bolterDev || outcomeType === 'BOLTER');

  // 1. Opener
  if (landedOnWO) {
    parts.push('C'); // Cut — always for landing on WO
  } else if (woActive && !bolterDev && outcomeType !== 'TRAP') {
    parts.push('WO');
  } else if (wofdActive) {
    parts.push('WOFD');
  } else if (owoActive) {
    parts.push('OWO');
  } else if (bolterDev) {
    parts.push(SYMBOL_ALIASES[bolterDev.symbol] ?? bolterDev.symbol); // B, HS, or T&G
  } else if (outcomeType === 'BOLTER') {
    parts.push('B'); // backward compat
  } else if (outcomeType === 'WAVE_OFF') {
    parts.push('WO');
  } else if (outcomeType === 'OWN_WAVE_OFF') {
    parts.push('OWO');
  } else if (outcomeType === 'WOFD') {
    parts.push('WOFD');
  } else if (grade) {
    parts.push(GRADE_DISPLAY[grade]);
  }

  // 2. Ball call marker
  if (hasBallCall) {
    parts.push('[BC]');
  }

  // 3. Pattern deviations (no phase suffix — they precede the groove)
  if (twaSeverity) parts.push(formatSymbol('TWA', twaSeverity));
  if (tcaSeverity) parts.push(formatSymbol('TCA', tcaSeverity));

  // 4. Phase deviations (with consecutive consolidation; outcome deviations excluded from tokens)
  const regularDeviations = deviations.filter(d => !OUTCOME_DEV_SYMS.has(d.symbol));
  const deviationTokens = buildDeviationTokens(regularDeviations);
  parts.push(...deviationTokens);

  // 5. Global groove/approach characteristics (no phase suffix)
  if (nesaSeverity) {
    parts.push(formatSymbol('NESA', nesaSeverity));
  }
  if (ligSeverity) {
    parts.push(formatSymbol('LIG', ligSeverity));
  }
  if (aaSeverity) {
    parts.push(formatSymbol('AA', aaSeverity));
  }

  // 6. Outcome / wire (normal TRAP pass — not when landed on WO, handled below)
  if (outcomeType === 'TRAP' && wireNumber && !landedOnWO) {
    parts.push(`WIRE#${wireNumber}`);
  }

  // 7. Landed-on-WO remark
  if (landedOnWO) {
    if (outcomeType === 'TRAP' && wireNumber) {
      parts.push(`WIRE#${wireNumber}`);
    }
    parts.push('LANDED ON WO');
  }

  // 8. Comments — appended in button order
  for (const def of COMMENT_BUTTONS) {
    const state = comments[def.key] ?? 0;
    if (state > 0) {
      const label = state === 2 && def.label2 ? def.label2 : def.label1;
      parts.push(label);
    }
  }

  return parts.join(' ');
}
