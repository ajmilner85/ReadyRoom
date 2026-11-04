import { supabase } from './supabaseClient';
import { CommsPlanEntry, generateInitialCommsData, normalizeCommsEntries } from '../types/CommsTypes';

// Tables added in supabase/migrations/missions/add_comms_card_templates.sql.
// Not yet present in the generated Database types, hence the `as any` casts.
const db = supabase as any;

export type NewMissionCommsSource = 'previous_mission' | 'default_template';

export interface CommsCardTemplate {
  id: string;
  title: string;
  description: string | null;
  entries: CommsPlanEntry[];
  is_shared: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Display name of the creator (callsign / Discord name), when readable */
  creator_name?: string;
}

export interface MissionPrepSettings {
  new_mission_comms_source: NewMissionCommsSource;
  default_comms_template_id: string | null;
}

export interface CommsTemplateInput {
  title: string;
  description?: string | null;
  entries: CommsPlanEntry[];
  is_shared: boolean;
}

export interface CycleOption {
  id: string;
  name: string;
  start_date: string;
}

export interface EventWithComms {
  event_id: string;
  event_name: string;
  start_datetime: string;
  mission_id: string;
  comms_plan: CommsPlanEntry[];
}

const DEFAULT_SETTINGS: MissionPrepSettings = {
  new_mission_comms_source: 'previous_mission',
  default_comms_template_id: null
};

const getCurrentProfileId = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;
  const { data } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  return data?.id ?? null;
};

const hasComms = (plan: unknown): plan is any[] => Array.isArray(plan) && plan.length > 0;

const rowToTemplate = (row: any): CommsCardTemplate => {
  const pilot = row.creator?.pilot;
  const creatorName = pilot?.callsign
    ? `${pilot.boardNumber ? `${pilot.boardNumber} ` : ''}${pilot.callsign}`
    : row.creator?.discord_username || undefined;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    entries: normalizeCommsEntries(row.entries),
    is_shared: !!row.is_shared,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    creator_name: creatorName
  };
};

// ============================================================================
// Templates
// ============================================================================

/** All templates visible to the current user (own + shared + org default), sorted by title. */
export const listCommsTemplates = async (): Promise<CommsCardTemplate[]> => {
  const { data, error } = await db
    .from('comms_card_templates')
    .select(`
      *,
      creator:user_profiles!comms_card_templates_created_by_fkey(
        discord_username,
        pilot:pilots(callsign, boardNumber)
      )
    `)
    .order('title', { ascending: true });

  if (error) {
    // Fall back to a join-free query in case the creator embed is blocked
    console.warn('[COMMS TEMPLATES] Creator join failed, retrying without it:', error.message);
    const retry = await db.from('comms_card_templates').select('*').order('title', { ascending: true });
    if (retry.error) throw new Error(retry.error.message);
    return (retry.data || []).map(rowToTemplate);
  }
  return (data || []).map(rowToTemplate);
};

export const createCommsTemplate = async (input: CommsTemplateInput): Promise<CommsCardTemplate> => {
  const profileId = await getCurrentProfileId();
  if (!profileId) throw new Error('No user profile found');

  const { data, error } = await db
    .from('comms_card_templates')
    .insert({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      entries: normalizeCommsEntries(input.entries),
      is_shared: input.is_shared,
      created_by: profileId
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToTemplate(data);
};

export const updateCommsTemplate = async (
  id: string,
  patch: Partial<CommsTemplateInput>
): Promise<CommsCardTemplate> => {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.entries !== undefined) update.entries = normalizeCommsEntries(patch.entries);
  if (patch.is_shared !== undefined) update.is_shared = patch.is_shared;

  const { data, error } = await db
    .from('comms_card_templates')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToTemplate(data);
};

export const deleteCommsTemplate = async (id: string): Promise<void> => {
  const { error } = await db.from('comms_card_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// ============================================================================
// Org-wide Mission Prep settings (singleton row)
// ============================================================================

export const getMissionPrepSettings = async (): Promise<MissionPrepSettings> => {
  const { data, error } = await db
    .from('mission_prep_settings')
    .select('new_mission_comms_source, default_comms_template_id')
    .eq('id', true)
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn('[COMMS TEMPLATES] Could not load mission prep settings:', error.message);
    return { ...DEFAULT_SETTINGS };
  }
  return {
    new_mission_comms_source: data.new_mission_comms_source === 'default_template' ? 'default_template' : 'previous_mission',
    default_comms_template_id: data.default_comms_template_id ?? null
  };
};

export const updateMissionPrepSettings = async (patch: Partial<MissionPrepSettings>): Promise<MissionPrepSettings> => {
  const profileId = await getCurrentProfileId();
  const { data, error } = await db
    .from('mission_prep_settings')
    .update({ ...patch, updated_by: profileId })
    .eq('id', true)
    .select('new_mission_comms_source, default_comms_template_id')
    .single();

  if (error) throw new Error(error.message);
  return data as MissionPrepSettings;
};

// ============================================================================
// Previous missions (for copy + new-mission initialisation)
// ============================================================================

/** Non-deleted cycles, newest first. */
export const listCycles = async (): Promise<CycleOption[]> => {
  const { data, error } = await supabase
    .from('cycles')
    .select('id, name, start_date')
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as CycleOption[];
};

/**
 * Events (newest first) in the given cycle — or standalone events when cycleId is null —
 * whose mission has a saved comms plan.
 */
export const listEventsWithComms = async (
  cycleId: string | null,
  options: { excludeEventId?: string; beforeDatetime?: string; limit?: number } = {}
): Promise<EventWithComms[]> => {
  let eventsQuery = supabase
    .from('events')
    .select('id, name, start_datetime')
    .is('deleted_at', null)
    .order('start_datetime', { ascending: false })
    .limit(options.limit ?? 100);

  eventsQuery = cycleId ? eventsQuery.eq('cycle_id', cycleId) : eventsQuery.is('cycle_id', null);
  if (options.beforeDatetime) eventsQuery = eventsQuery.lt('start_datetime', options.beforeDatetime);
  if (options.excludeEventId) eventsQuery = eventsQuery.neq('id', options.excludeEventId);

  const { data: events, error: eventsError } = await eventsQuery;
  if (eventsError) throw new Error(eventsError.message);
  if (!events || events.length === 0) return [];

  const { data: missions, error: missionsError } = await supabase
    .from('missions')
    .select('id, event_id, mission_settings')
    .in('event_id', events.map(e => e.id));
  if (missionsError) throw new Error(missionsError.message);

  const missionByEvent = new Map<string, any>();
  (missions || []).forEach(m => { if (m.event_id) missionByEvent.set(m.event_id, m); });

  const result: EventWithComms[] = [];
  for (const event of events) {
    const mission = missionByEvent.get(event.id);
    const plan = (mission?.mission_settings as any)?.comms_plan;
    if (mission && hasComms(plan)) {
      result.push({
        event_id: event.id,
        event_name: event.name,
        start_datetime: event.start_datetime,
        mission_id: mission.id,
        comms_plan: normalizeCommsEntries(plan)
      });
    }
  }
  return result;
};

/** Comms plan of the most recent earlier mission in the same cycle, or null (standalone / first in cycle). */
export const findPreviousCycleMissionComms = async (eventId: string): Promise<CommsPlanEntry[] | null> => {
  const { data: event, error } = await supabase
    .from('events')
    .select('id, cycle_id, start_datetime')
    .eq('id', eventId)
    .maybeSingle();

  if (error || !event?.cycle_id) return null;

  const previous = await listEventsWithComms(event.cycle_id, {
    excludeEventId: event.id,
    beforeDatetime: event.start_datetime,
    limit: 50
  });
  return previous.length > 0 ? previous[0].comms_plan : null;
};

/** Entries of the org default template, or null if none is set / readable. */
export const getDefaultTemplateEntries = async (settings?: MissionPrepSettings): Promise<CommsPlanEntry[] | null> => {
  const s = settings ?? await getMissionPrepSettings();
  if (!s.default_comms_template_id) return null;

  const { data, error } = await db
    .from('comms_card_templates')
    .select('entries')
    .eq('id', s.default_comms_template_id)
    .maybeSingle();

  if (error || !data || !hasComms(data.entries)) return null;
  return normalizeCommsEntries(data.entries);
};

/**
 * Comms plan a new (or empty) mission should start with, per the org setting:
 *  - 'previous_mission': most recent earlier mission in the same cycle, else default template
 *  - 'default_template': default template
 * Falls back to the built-in card if no default template exists.
 */
export const resolveNewMissionCommsPlan = async (eventId?: string | null): Promise<CommsPlanEntry[]> => {
  try {
    const settings = await getMissionPrepSettings();

    if (settings.new_mission_comms_source === 'previous_mission' && eventId) {
      const previous = await findPreviousCycleMissionComms(eventId);
      if (previous) return previous;
    }

    const defaults = await getDefaultTemplateEntries(settings);
    if (defaults) return defaults;
  } catch (err) {
    console.warn('[COMMS TEMPLATES] Failed to resolve new mission comms plan, using built-in default:', err);
  }
  return generateInitialCommsData();
};
