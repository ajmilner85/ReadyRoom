// Structured award eligibility rules.
//
// Rules are stored as a JSON tree on awards.eligibility_rules (and per device
// tier in awards.device_config). Each rule tree is evaluated against one
// (pilot, cycle) pair using the metrics computed by awardEligibilityService.

// ---------- Metrics ----------

export type AwardMetricId =
  | 'events_attended'     // participation: roll call Present, or accepted RSVP when no roll call was taken (matches the dossier's cruise participation rule)
  | 'attendance_pct'      // roll call Present ÷ published past events in the cycle, as 0-100 (matches the dossier attendance card exactly)
  | 'active_member'       // 1 when the pilot held an active roster status overlapping the cycle's date range, else 0
  | 'events_total'        // published events in the cycle that have already occurred
  | 'students_flown'      // distinct enrolled students this pilot shared a mission flight with, or instructed/graded a syllabus attempt for, in the cycle; 0 for pilots who are themselves enrolled
  | 'students_graduated'; // of those students, how many went on to graduate (graduation record on/after the cycle start)

export interface AwardMetricValues {
  events_attended: number;
  attendance_pct: number;
  active_member: number; // 0 | 1
  events_total: number;
  students_flown: number;
  students_graduated: number;
}

export interface AwardMetricDefinition {
  id: AwardMetricId;
  label: string;
  /** Compact column header for the eligibility results table */
  shortLabel: string;
  /** boolean metrics render as a yes/no select instead of comparator + number */
  isBoolean: boolean;
  unit?: string;
}

export const AWARD_METRICS: AwardMetricDefinition[] = [
  { id: 'events_attended', label: 'Events attended in cycle', shortLabel: 'Attended', isBoolean: false },
  { id: 'attendance_pct', label: 'Roll-call attendance', shortLabel: 'Roll call', isBoolean: false, unit: '%' },
  { id: 'active_member', label: 'Active member during cycle', shortLabel: 'Active', isBoolean: true },
  { id: 'events_total', label: 'Events held in cycle', shortLabel: 'Events', isBoolean: false },
  { id: 'students_flown', label: 'Students flown with in cycle', shortLabel: 'Students', isBoolean: false },
  { id: 'students_graduated', label: 'Students flown with who graduated', shortLabel: 'Graduated', isBoolean: false }
];

export const awardMetricDefinition = (id: AwardMetricId): AwardMetricDefinition =>
  AWARD_METRICS.find(m => m.id === id) || AWARD_METRICS[0];

// ---------- Rule tree ----------

export type AwardRuleComparator = 'gte' | 'gt' | 'eq' | 'lte' | 'lt';

export const AWARD_COMPARATORS: Array<{ id: AwardRuleComparator; label: string }> = [
  { id: 'gte', label: 'at least' },
  { id: 'gt', label: 'more than' },
  { id: 'eq', label: 'exactly' },
  { id: 'lte', label: 'at most' },
  { id: 'lt', label: 'less than' }
];

export interface AwardRuleCondition {
  kind: 'condition';
  id: string;
  metric: AwardMetricId;
  comparator: AwardRuleComparator;
  value: number;
  /**
   * Cycle the metric is measured against. Null/absent = the cycle selected
   * when issuing (right for reusable awards like a deployment ribbon); a
   * cycle id pins the condition to that specific cycle (right for campaign
   * medals tied to one operation); ANY_QUALIFYING_CYCLE passes when the
   * comparison holds in at least one cycle of the award's qualifying types.
   */
  cycleId?: string | null;
}

/** Sentinel cycleId: the condition passes if it holds in any qualifying cycle */
export const ANY_QUALIFYING_CYCLE = 'any-qualifying-cycle';

export interface AwardRuleGroup {
  kind: 'group';
  id: string;
  op: 'and' | 'or';
  children: AwardRuleNode[];
}

export type AwardRuleNode = AwardRuleGroup | AwardRuleCondition;

/** Wrapper stored in awards.eligibility_rules */
export interface AwardEligibilityRules {
  version: 1;
  /** Cycle types this award can be earned in; empty = any cycle type */
  cycleTypes: string[];
  rules: AwardRuleGroup;
}

// ---------- Device (decoration) configuration ----------

/**
 * Repeat mode (e.g. Sea Service Deployment Ribbon): one issuance per
 * qualifying cycle; the display shows the award once with devices computed
 * from the issuance count — a bronze device per additional award, a silver
 * device in lieu of every `silverWorth` bronze.
 */
export interface AwardRepeatDeviceConfig {
  bronzeImageUrl: string;
  silverImageUrl: string | null;
  silverWorth: number; // silver replaces this many bronze (default 5)
  /** @deprecated legacy field, ignored — variant coverage is now automatic */
  maxAwards?: number;
}

/**
 * Composited variants are pre-generated up to this award count when a
 * repeat-device award is saved (11 = base ribbon through 2 silver stars at
 * the default silver worth of 5). When an issuance takes a pilot past the
 * generated coverage, ensureRepeatVariantCoverage() tops up the missing
 * variants on demand, bounded by the hard cap.
 */
export const REPEAT_VARIANT_BASELINE = 11;
export const REPEAT_VARIANT_HARD_CAP = 30;

/**
 * Tier mode (e.g. campaign medal attendance stars): each issuance carries at
 * most one device, chosen by evaluating each tier's rules against the same
 * (pilot, cycle) metrics. Tiers are ordered lowest → highest; the highest
 * tier whose rules pass applies.
 */
export interface AwardDeviceTier {
  id: string;
  name: string;
  imageUrl: string;
  rules: AwardRuleGroup;
}

export interface AwardDeviceConfig {
  version: 1;
  mode: 'repeat' | 'tier';
  repeat?: AwardRepeatDeviceConfig;
  tiers?: AwardDeviceTier[];
}

// ---------- Constructors ----------

export const newRuleId = (): string => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const emptyRuleGroup = (op: 'and' | 'or' = 'and'): AwardRuleGroup => ({
  kind: 'group',
  id: newRuleId(),
  op,
  children: []
});

export const newRuleCondition = (): AwardRuleCondition => ({
  kind: 'condition',
  id: newRuleId(),
  metric: 'events_attended',
  comparator: 'gte',
  value: 1
});

export const emptyEligibilityRules = (): AwardEligibilityRules => ({
  version: 1,
  cycleTypes: ['Cruise-WorkUp', 'Cruise-Mission'],
  rules: { ...emptyRuleGroup('and'), children: [newRuleCondition()] }
});

// ---------- Evaluation ----------

const compare = (actual: number, comparator: AwardRuleComparator, expected: number): boolean => {
  switch (comparator) {
    case 'gte': return actual >= expected;
    case 'gt': return actual > expected;
    case 'eq': return actual === expected;
    case 'lte': return actual <= expected;
    case 'lt': return actual < expected;
    default: return false;
  }
};

/**
 * Supplies a pilot's metrics for a condition's cycle scope: null = the cycle
 * selected at issuance, a cycle id = that specific cycle. For
 * ANY_QUALIFYING_CYCLE the resolver returns one metric set per qualifying
 * cycle, and the condition passes if the comparison holds for any of them.
 */
export type MetricsResolver = (cycleId: string | null) => AwardMetricValues | AwardMetricValues[];

const asResolver = (metrics: AwardMetricValues | MetricsResolver): MetricsResolver =>
  typeof metrics === 'function' ? metrics : () => metrics;

export function evaluateRuleNode(node: AwardRuleNode, metrics: AwardMetricValues | MetricsResolver): boolean {
  const resolve = asResolver(metrics);
  if (node.kind === 'condition') {
    const resolved = resolve(node.cycleId || null);
    const candidates = Array.isArray(resolved) ? resolved : [resolved];
    return candidates.some(candidate => {
      const actual = candidate[node.metric];
      return typeof actual === 'number' && compare(actual, node.comparator, node.value);
    });
  }
  // Empty groups pass for 'and' (no failed requirement) and fail for 'or'
  if (node.children.length === 0) return node.op === 'and';
  return node.op === 'and'
    ? node.children.every(child => evaluateRuleNode(child, resolve))
    : node.children.some(child => evaluateRuleNode(child, resolve));
}

/** Specific cycle ids referenced by conditions in a rule tree (excludes the any-cycle sentinel) */
export function collectRuleCycleIds(node: AwardRuleNode, out: Set<string> = new Set()): Set<string> {
  if (node.kind === 'condition') {
    if (node.cycleId && node.cycleId !== ANY_QUALIFYING_CYCLE) out.add(node.cycleId);
    return out;
  }
  node.children.forEach(child => collectRuleCycleIds(child, out));
  return out;
}

/** True when any condition in the tree uses the any-qualifying-cycle scope */
export function ruleTreeUsesAnyCycle(node: AwardRuleNode): boolean {
  if (node.kind === 'condition') return node.cycleId === ANY_QUALIFYING_CYCLE;
  return node.children.some(ruleTreeUsesAnyCycle);
}

/** Flat list of every condition in a rule tree */
export function collectRuleConditions(node: AwardRuleNode, out: AwardRuleCondition[] = []): AwardRuleCondition[] {
  if (node.kind === 'condition') {
    out.push(node);
    return out;
  }
  node.children.forEach(child => collectRuleConditions(child, out));
  return out;
}

/** True when the rule tree contains at least one condition */
export function ruleTreeHasConditions(node: AwardRuleNode): boolean {
  if (node.kind === 'condition') return true;
  return node.children.some(ruleTreeHasConditions);
}

/**
 * Picks the device tier earned for the given metrics. Tiers are ordered
 * lowest → highest; the highest passing tier wins. Returns null when no tier
 * applies (base award, no device).
 */
export function evaluateDeviceTier(config: AwardDeviceConfig | null | undefined, metrics: AwardMetricValues | MetricsResolver): AwardDeviceTier | null {
  if (!config || config.mode !== 'tier' || !config.tiers) return null;
  for (let i = config.tiers.length - 1; i >= 0; i--) {
    const tier = config.tiers[i];
    if (ruleTreeHasConditions(tier.rules) && evaluateRuleNode(tier.rules, metrics)) return tier;
  }
  return null;
}

// ---------- Repeat-mode device math ----------

export interface RepeatDeviceCounts {
  silver: number;
  bronze: number;
}

/**
 * Devices shown for the Nth award in repeat mode: the first award is the bare
 * ribbon; each additional award adds a bronze device, with a silver device
 * replacing every `silverWorth` bronze (when a silver image is configured).
 */
export function repeatDeviceCounts(totalAwards: number, config: AwardRepeatDeviceConfig): RepeatDeviceCounts {
  const stars = Math.max(0, totalAwards - 1);
  if (!config.silverImageUrl) return { silver: 0, bronze: stars };
  const worth = Math.max(2, config.silverWorth || 5);
  return { silver: Math.floor(stars / worth), bronze: stars % worth };
}

// ---------- Variant image keys ----------

/** Variant cache key for the Nth issuance of a repeat-mode award */
export const repeatVariantKey = (totalAwards: number): string => `r${totalAwards}`;

/** Variant cache key for a tier-mode device */
export const tierVariantKey = (tierId: string): string => `tier:${tierId}`;

// ---------- Human-readable rule summary ----------

export function describeRuleNode(node: AwardRuleNode, cycleNameById?: Record<string, string>): string {
  if (node.kind === 'condition') {
    const metric = awardMetricDefinition(node.metric);
    const cycleSuffix = node.cycleId === ANY_QUALIFYING_CYCLE
      ? ' [any qualifying cycle]'
      : node.cycleId
        ? ` [${cycleNameById?.[node.cycleId] || 'specific cycle'}]`
        : '';
    if (metric.isBoolean) {
      return (node.value >= 1 ? metric.label : `Not: ${metric.label.toLowerCase()}`) + cycleSuffix;
    }
    const comparator = AWARD_COMPARATORS.find(c => c.id === node.comparator)?.label || node.comparator;
    return `${metric.label} ${comparator} ${node.value}${metric.unit || ''}${cycleSuffix}`;
  }
  if (node.children.length === 0) return 'No conditions';
  const joiner = node.op === 'and' ? ' AND ' : ' OR ';
  return node.children
    .map(child => (child.kind === 'group' ? `(${describeRuleNode(child, cycleNameById)})` : describeRuleNode(child, cycleNameById)))
    .join(joiner);
}
