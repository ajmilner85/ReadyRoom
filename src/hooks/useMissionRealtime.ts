import { useEffect, useRef, useCallback, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../utils/supabaseClient';

/**
 * Presence state for a user editing a mission
 */
export interface MissionPresenceUser {
  user_id: string;
  user_name: string;
  editing_field?: string;
  online_at: string;
}

interface UseMissionRealtimeConfig {
  /** The mission ID to subscribe to. When falsy, no subscription is created. */
  missionId: string | undefined;
  /** Called when a remote UPDATE to the missions row is received */
  onRemoteMissionUpdate: (newRow: Record<string, any>) => void;
  /** Current user info for presence */
  currentUserId: string | undefined;
  currentUserName: string | undefined;
  /** Whether the hook is enabled (e.g. set false during initial load) */
  enabled?: boolean;
}

/**
 * Hook that subscribes to Supabase Realtime for:
 * 1. postgres_changes on the missions table (filtered to a single mission)
 * 2. Presence tracking (who's editing this mission)
 *
 * Uses Supabase's built-in Presence feature on the channel —
 * no separate database table needed.
 */
export const useMissionRealtime = ({
  missionId,
  onRemoteMissionUpdate,
  currentUserId,
  currentUserName,
  enabled = true
}: UseMissionRealtimeConfig) => {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<MissionPresenceUser[]>([]);

  // Stable ref for the callback so the channel subscription doesn't
  // tear down and re-create on every render
  const onRemoteUpdateRef = useRef(onRemoteMissionUpdate);
  onRemoteUpdateRef.current = onRemoteMissionUpdate;

  // Track presence via the channel's built-in Presence feature
  const updatePresence = useCallback((editingField?: string) => {
    const channel = channelRef.current;
    if (!channel || !currentUserId) return;

    channel.track({
      user_id: currentUserId,
      user_name: currentUserName || 'Unknown',
      editing_field: editingField || null,
      online_at: new Date().toISOString()
    });
  }, [currentUserId, currentUserName]);

  useEffect(() => {
    if (!missionId || !enabled || !currentUserId) {
      // Clean up any existing channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setIsConnected(false);
        setActiveUsers([]);
      }
      return;
    }

    const channelName = `mission-collab:${missionId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: currentUserId } }
    });

    // Listen for postgres_changes on this mission row
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'missions',
        filter: `id=eq.${missionId}`
      },
      (payload) => {
        onRemoteUpdateRef.current(payload.new);
      }
    );

    // Presence sync: track who is online
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<MissionPresenceUser>();
      const users: MissionPresenceUser[] = [];
      for (const presences of Object.values(state)) {
        for (const p of presences) {
          // Exclude self
          if (p.user_id !== currentUserId) {
            users.push(p);
          }
        }
      }
      setActiveUsers(users);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        // Announce our presence
        await channel.track({
          user_id: currentUserId,
          user_name: currentUserName || 'Unknown',
          editing_field: null,
          online_at: new Date().toISOString()
        });
      } else {
        setIsConnected(false);
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
      setActiveUsers([]);
    };
    // Only re-subscribe when these values change
  }, [missionId, currentUserId, currentUserName, enabled]);

  return { isConnected, activeUsers, updatePresence };
};
