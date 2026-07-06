import React, { useState, useEffect, useCallback } from 'react';
import { BookUser } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePageLoading } from '../../context/PageLoadingContext';
import DossierDetailsCard from './DossierDetailsCard';
import DossierStatsCard from './DossierStatsCard';
import DossierTimelineCard from './DossierTimelineCard';
import DossierTrapSheetCard from './DossierTrapSheetCard';
import { dossierStyles } from './dossierStyles';
import {
  getDossierProfile,
  getDossierStats,
  getDossierCycles,
  getPilotTraps,
  type DossierProfile,
  type DossierStats,
  type DossierCycle,
  type TrapRecord
} from '../../utils/dossierService';
import { supabase } from '../../utils/supabaseClient';

const PilotDossier: React.FC = () => {
  const { userProfile } = useAuth();
  const { setPageLoading } = usePageLoading();

  const pilotId = userProfile?.pilot?.id;

  const [profile, setProfile] = useState<DossierProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [discordId, setDiscordId] = useState<string | null>(null);
  const [discordUsername, setDiscordUsername] = useState<string | null>(null);

  const [cycles, setCycles] = useState<DossierCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>(''); // '' = career
  const [stats, setStats] = useState<DossierStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [traps, setTraps] = useState<TrapRecord[]>([]);
  const [trapsLoading, setTrapsLoading] = useState(true);

  // Clear the nav loading indicator once data is in (same pattern as RosterManagement)
  useEffect(() => {
    if (!profileLoading) {
      setPageLoading('dossier', false);
    }
  }, [profileLoading, setPageLoading]);

  // Load pilot core record (for Discord identity), profile/timeline, cycles and traps
  useEffect(() => {
    if (!pilotId) {
      setProfileLoading(false);
      setStatsLoading(false);
      setTrapsLoading(false);
      return;
    }

    let isMounted = true;

    const loadAll = async () => {
      try {
        const { data: pilotRecord } = await supabase
          .from('pilots')
          .select('discord_id, discord_username')
          .eq('id', pilotId)
          .single();

        const pilotDiscordId = pilotRecord?.discord_id || null;
        if (!isMounted) return;
        setDiscordId(pilotDiscordId);
        setDiscordUsername(pilotRecord?.discord_username || null);

        const [profileResult, cyclesResult, trapsResult] = await Promise.all([
          getDossierProfile(pilotId, pilotDiscordId),
          getDossierCycles(),
          getPilotTraps(pilotId)
        ]);

        if (!isMounted) return;

        if (profileResult.error) {
          console.error('Error loading dossier profile:', profileResult.error);
        }
        setProfile(profileResult.data);
        setCycles(cyclesResult.data || []);
        setTraps(trapsResult.data || []);
      } catch (error) {
        console.error('Error loading dossier:', error);
      } finally {
        if (isMounted) {
          setProfileLoading(false);
          setTrapsLoading(false);
        }
      }
    };

    loadAll();

    return () => {
      isMounted = false;
    };
  }, [pilotId]);

  // Load stats whenever the cycle selection changes
  const loadStats = useCallback(async (cycleId: string, pilotDiscordId: string | null) => {
    if (!pilotId) return;
    setStatsLoading(true);
    try {
      const { data, error } = await getDossierStats(pilotId, pilotDiscordId, cycleId || undefined);
      if (error) {
        console.error('Error loading dossier stats:', error);
      }
      setStats(data);
    } finally {
      setStatsLoading(false);
    }
  }, [pilotId]);

  useEffect(() => {
    if (!pilotId || profileLoading) return;
    loadStats(selectedCycleId, discordId);
  }, [pilotId, profileLoading, selectedCycleId, discordId, loadStats]);

  // No linked pilot record — nothing to show
  if (!userProfile?.pilot) {
    return (
      <div style={dossierStyles.container}>
        <div style={{ ...dossierStyles.contentWrapper, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <BookUser size={96} style={{ color: '#D1D5DB' }} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1E293B', marginBottom: '12px' }}>
              No Pilot Record Linked
            </h2>
            <p style={{ fontSize: '14px', color: '#9CA3AF' }}>
              Your account is not linked to a pilot record, so there is no dossier to display.
              Contact your squadron administrator to have your Discord account linked to your pilot record.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={dossierStyles.container}>
      <div style={dossierStyles.contentWrapper}>
        <div style={dossierStyles.columnsContainer}>
          {/* Left column: pilot details */}
          <div style={{ width: '620px', flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <DossierDetailsCard
              callsign={userProfile.pilot.callsign}
              boardNumber={userProfile.pilot.boardNumber}
              discordUsername={discordUsername || userProfile.discordUsername}
              profile={profile}
              loading={profileLoading}
            />
          </div>

          {/* Center column: statistics + trap sheet */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            <DossierStatsCard
              stats={stats}
              cycles={cycles}
              selectedCycleId={selectedCycleId}
              onCycleChange={setSelectedCycleId}
              loading={statsLoading}
            />
            <DossierTrapSheetCard traps={traps} loading={trapsLoading} />
          </div>

          {/* Right column: timeline spanning the page height */}
          <DossierTimelineCard timeline={profile?.timeline || []} loading={profileLoading} />
        </div>
      </div>
    </div>
  );
};

export default PilotDossier;
