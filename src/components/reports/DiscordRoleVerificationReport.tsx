import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Download, Filter, X, AlertCircle, Wrench } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import { supabase } from '../../utils/supabaseClient';
import { fetchDiscordGuildRoles } from '../../utils/discordService';
import PilotIDBadgeSm from '../ui/PilotIDBadgeSm';
import { useAppSettings } from '../../context/AppSettingsContext';
import { dateInputToLocalDate } from '../../utils/dateUtils';

interface DiscordRoleVerificationReportProps {
  error: string | null;
  setError: (error: string | null) => void;
}

interface Squadron {
  id: string;
  name: string;
  designation: string;
  insignia_url?: string | null;
  tail_code?: string | null;
  color_palette?: {
    primary?: string;
  } | null;
  discord_integration?: {
    selectedGuildId?: string;
    roleMappings?: RoleMapping[];
  };
}

interface RoleMapping {
  id: string;
  discordRoleId: string;
  discordRoleName: string;
  appPermission?: 'admin' | 'flight_lead' | 'member' | 'guest';
  qualification?: string;
  qualificationName?: string;
  squadronId?: string;
  squadronName?: string;
  teamId?: string;
  teamName?: string;
  isIgnoreUsers?: boolean;
  priority: number;
}

interface Pilot {
  id: string;
  board_number: string;
  callsign: string | null;
  discord_id: string | null;
  currentSquadron?: {
    id: string;
    name: string;
    designation: string;
    tail_code?: string | null;
    insignia_url?: string | null;
    color_palette?: {
      primary?: string;
    } | null;
  };
  discordRoles?: string[];
  standings?: any[];
  qualifications?: any[];
  teams?: any[];
}

interface MissingItem {
  type: 'qualification' | 'team';
  displayText: string;
  mapping: RoleMapping;
}

interface VerificationIssue {
  pilotId: string;
  boardNumber: string;
  callsign: string | null;
  squadronDesignation: string;
  missingFromRecord: MissingItem[]; // Has Discord role but missing from pilot record
  missingDiscordRole: string[]; // Has in pilot record but missing Discord role
}

const DiscordRoleVerificationReport: React.FC<DiscordRoleVerificationReportProps> = ({ setError }) => {
  const { settings } = useAppSettings();
  const [squadrons, setSquadrons] = useState<Squadron[]>([]);
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSquadronIds, setSelectedSquadronIds] = useState<string[]>([]);

  // Repair dialog states
  const [showRepairDialog, setShowRepairDialog] = useState(false);
  const [repairDialogData, setRepairDialogData] = useState<{
    pilotId: string;
    item: MissingItem;
    earnedDate: string;
  } | null>(null);

  // Load squadrons
  useEffect(() => {
    const loadSquadrons = async () => {
      try {
        setLoading(true);
        const { data, error: sqError } = await supabase
          .from('org_squadrons')
          .select('id, name, designation, insignia_url, tail_code, color_palette, discord_integration')
          .is('deactivated_date', null)
          .order('designation');

        if (sqError) throw sqError;
        setSquadrons((data || []) as Squadron[]);

        // Select all squadrons by default
        if (data) {
          setSelectedSquadronIds(data.map(sq => sq.id));
        }
      } catch (err: any) {
        console.error('Error loading squadrons:', err);
        setError('Failed to load squadrons');
      } finally {
        setLoading(false);
      }
    };

    loadSquadrons();
  }, [setError]);

  // Load pilots and their Discord roles
  const loadPilots = async () => {
    try {
      setRefreshing(true);

      // Fetch pilots with their squadron, qualifications, teams, and Discord member data
      const { data: pilotsData, error: pilotsError } = await supabase
        .from('pilots')
        .select(`
          id,
          boardNumber,
          callsign,
          discord_id,
          pilot_assignments!left (
            id,
            squadron_id,
            start_date,
            end_date,
            org_squadrons (
              id,
              name,
              designation,
              tail_code,
              insignia_url,
              color_palette
            )
          ),
          pilot_standings!left (
            standing_id
          ),
          pilot_qualifications!left (
            qualification_id
          ),
          pilot_teams!left (
            team_id,
            end_date
          )
        `)
        .order('boardNumber', { ascending: true });

      if (pilotsError) throw pilotsError;

      // Process pilot data to extract current squadron from assignments
      const processedPilots = pilotsData?.map((pilot: any) => {
        // Find active squadron assignment (no end_date)
        const activeAssignment = pilot.pilot_assignments?.find((a: any) => !a.end_date);
        const currentSquadron = activeAssignment?.org_squadrons || null;

        // Extract standings, qualifications, teams
        const standings = pilot.pilot_standings || [];
        const qualifications = pilot.pilot_qualifications || [];
        const teams = pilot.pilot_teams || [];

        return {
          id: pilot.id,
          board_number: pilot.boardNumber,
          callsign: pilot.callsign,
          discord_id: pilot.discord_id,
          currentSquadron,
          standings,
          qualifications,
          teams
        };
      }) || [];

      // Fetch Discord guild members for pilots with discord_id
      const pilotsWithDiscord = processedPilots.filter(p => p.discord_id);
      const pilotsByDiscordId = new Map(pilotsWithDiscord.map(p => [p.discord_id, p]));

      // Get unique squadron guild IDs
      const guildIds = Array.from(new Set(
        squadrons
          .filter(sq => sq.discord_integration?.selectedGuildId)
          .map(sq => sq.discord_integration!.selectedGuildId!)
      ));

      // Fetch Discord members and roles for each guild
      const discordMembersByPilotId = new Map<string, string[]>();

      for (const guildId of guildIds) {
        try {
          // Fetch guild roles using utility function
          const rolesResult = await fetchDiscordGuildRoles(guildId);

          if (rolesResult.error) {
            console.error(`Error fetching roles for guild ${guildId}:`, rolesResult.error);
            continue;
          }

          const roles = rolesResult.roles || [];

          // Fetch guild members - build full URL using VITE_API_URL (same pattern as fetchDiscordGuildRoles)
          const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          const response = await fetch(
            `${apiBaseUrl}/api/discord/guild-members?guildId=${guildId}`,
            { credentials: 'include' }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error fetching members for guild ${guildId}: ${response.status}`, errorText);
            continue;
          }

          const membersData = await response.json();
          const members = membersData.members || [];

          console.log(`Successfully loaded ${members.length} members and ${roles.length} roles for guild ${guildId}`);

          // Build a map from role name to role ID
          const roleNameToId = new Map<string, string>();
          roles.forEach((role: any) => {
            roleNameToId.set(role.name, role.id);
          });

          // Map members to pilots and store their role IDs
          members.forEach((member: any) => {
            const pilot = pilotsByDiscordId.get(member.id);
            if (pilot) {
              // Convert role names to role IDs
              const roleIds = (member.roles || [])
                .map((roleName: string) => roleNameToId.get(roleName))
                .filter((id: string | undefined) => id !== undefined);
              discordMembersByPilotId.set(pilot.id, roleIds);
            }
          });
        } catch (err) {
          console.error(`Error fetching Discord data for guild ${guildId}:`, err);
        }
      }

      // Add Discord roles to pilot data
      const pilotsWithRoles = processedPilots.map(pilot => ({
        ...pilot,
        discordRoles: discordMembersByPilotId.get(pilot.id) || []
      }));

      setPilots(pilotsWithRoles);
    } catch (err: any) {
      console.error('Error loading pilots:', err);
      setError('Failed to load pilot data');
    } finally {
      setRefreshing(false);
    }
  };

  // Load pilots when squadrons are loaded
  useEffect(() => {
    if (squadrons.length > 0) {
      loadPilots();
    }
  }, [squadrons]);

  // Calculate verification issues
  const verificationIssues = useMemo((): VerificationIssue[] => {
    const issues: VerificationIssue[] = [];

    // Filter pilots by selected squadrons
    const filteredPilots = pilots.filter(pilot =>
      pilot.currentSquadron && selectedSquadronIds.includes(pilot.currentSquadron.id)
    );

    // Debug: Log pilot data for debugging
    const pilot525 = pilots.find(p => p.board_number === '525');
    const pilot571 = pilots.find(p => p.board_number === '571');

    if (pilot525) {
      console.log('=== PILOT 525 DEBUG ===');
      console.log('Pilot 525 full data:', pilot525);
      console.log('Current Squadron:', pilot525.currentSquadron);
      console.log('Qualifications:', pilot525.qualifications);
      console.log('Teams:', pilot525.teams);
      console.log('Discord Roles:', pilot525.discordRoles);
      console.log('Is filtered in?', filteredPilots.some(p => p.board_number === '525'));
    }

    if (pilot571) {
      console.log('=== PILOT 571 DEBUG ===');
      console.log('Pilot 571 full data:', pilot571);
      console.log('Current Squadron:', pilot571.currentSquadron);
      console.log('Qualifications:', pilot571.qualifications);
      console.log('Teams:', pilot571.teams);
      console.log('Discord Roles:', pilot571.discordRoles);
      console.log('Is filtered in?', filteredPilots.some(p => p.board_number === '571'));
    }

    for (const pilot of filteredPilots) {
      if (!pilot.currentSquadron) continue;

      // Find squadron's role mappings
      const squadron = squadrons.find(sq => sq.id === pilot.currentSquadron!.id);
      if (!squadron?.discord_integration?.roleMappings) continue;

      const roleMappings = squadron.discord_integration.roleMappings;
      const pilotDiscordRoles = pilot.discordRoles || [];

      // Debug: Log role mappings for pilots 525 and 571's squadron
      if (pilot.board_number === '525' || pilot.board_number === '571') {
        console.log(`Role mappings for pilot ${pilot.board_number}'s squadron:`, roleMappings);
      }

      const missingFromRecord: MissingItem[] = [];
      const missingDiscordRole: string[] = [];

      // Check each role mapping
      for (const mapping of roleMappings) {
        if (mapping.isIgnoreUsers) continue; // Skip ignore users mappings

        const hasDiscordRole = pilotDiscordRoles.includes(mapping.discordRoleId);

        // Check qualifications
        if (mapping.qualification) {
          const hasQualification = pilot.qualifications?.some(
            (pq: any) => pq.qualification_id === mapping.qualification
          );

          // Debug logging for pilots 525 and 571
          if (pilot.board_number === '525' || pilot.board_number === '571') {
            console.log(`Checking qualification mapping for ${pilot.board_number}:`, {
              qualificationMapping: mapping.qualificationName,
              qualificationId: mapping.qualification,
              discordRole: mapping.discordRoleName,
              discordRoleId: mapping.discordRoleId,
              hasDiscordRole,
              hasQualification,
              pilotQualifications: pilot.qualifications,
              pilotDiscordRoles,
              willAddToMissingFromRecord: hasDiscordRole && !hasQualification,
              willAddToMissingDiscordRole: hasQualification && !hasDiscordRole
            });
          }

          if (hasDiscordRole && !hasQualification) {
            missingFromRecord.push({
              type: 'qualification',
              displayText: `Qualification: ${mapping.qualificationName}`,
              mapping
            });
          } else if (hasQualification && !hasDiscordRole) {
            missingDiscordRole.push(mapping.discordRoleName);
          }
        }

        // Check teams
        if (mapping.teamId) {
          const hasTeam = pilot.teams?.some(
            (pt: any) => pt.team_id === mapping.teamId && !pt.end_date
          );

          // Debug logging for pilots 525 and 571
          if (pilot.board_number === '525' || pilot.board_number === '571') {
            console.log(`Checking team mapping for ${pilot.board_number}:`, {
              teamMapping: mapping.teamName,
              teamId: mapping.teamId,
              discordRole: mapping.discordRoleName,
              discordRoleId: mapping.discordRoleId,
              hasDiscordRole,
              hasTeam,
              pilotTeams: pilot.teams,
              pilotDiscordRoles,
              willAddToMissingFromRecord: hasDiscordRole && !hasTeam,
              willAddToMissingDiscordRole: hasTeam && !hasDiscordRole
            });
          }

          if (hasDiscordRole && !hasTeam) {
            missingFromRecord.push({
              type: 'team',
              displayText: `Team: ${mapping.teamName}`,
              mapping
            });
          } else if (hasTeam && !hasDiscordRole) {
            missingDiscordRole.push(mapping.discordRoleName);
          }
        }

        // Note: We're skipping permission and squadron affiliation checks as these are harder to verify
      }

      // Only add to issues if there are discrepancies
      if (missingFromRecord.length > 0 || missingDiscordRole.length > 0) {
        issues.push({
          pilotId: pilot.id,
          boardNumber: pilot.board_number,
          callsign: pilot.callsign,
          squadronDesignation: pilot.currentSquadron.designation,
          missingFromRecord,
          missingDiscordRole
        });
      }
    }

    return issues.sort((a, b) => {
      const squadronCompare = a.squadronDesignation.localeCompare(b.squadronDesignation);
      if (squadronCompare !== 0) return squadronCompare;

      // boardNumber is a string, so convert to numbers for proper sorting
      const aNum = parseInt(a.boardNumber);
      const bNum = parseInt(b.boardNumber);
      return aNum - bNum;
    });
  }, [pilots, squadrons, selectedSquadronIds]);

  // Handle squadron filter toggle
  const handleSquadronToggle = (squadronId: string) => {
    setSelectedSquadronIds(prev =>
      prev.includes(squadronId)
        ? prev.filter(id => id !== squadronId)
        : [...prev, squadronId]
    );
  };

  // Handle select/deselect all squadrons
  const handleSelectAllSquadrons = () => {
    setSelectedSquadronIds(squadrons.map(sq => sq.id));
  };

  const handleDeselectAllSquadrons = () => {
    setSelectedSquadronIds([]);
  };

  // Handle quick repair
  const handleQuickRepair = (pilotId: string, item: MissingItem) => {
    setRepairDialogData({
      pilotId,
      item,
      earnedDate: new Date().toISOString().split('T')[0] // Default to today
    });
    setShowRepairDialog(true);
  };

  const handleRepairConfirm = async () => {
    if (!repairDialogData) return;

    try {
      const { pilotId, item, earnedDate } = repairDialogData;

      if (item.type === 'qualification' && item.mapping.qualification) {
        // Check if qualification already exists
        const { data: existingQuals, error: checkError } = await supabase
          .from('pilot_qualifications')
          .select('id')
          .eq('pilot_id', pilotId)
          .eq('qualification_id', item.mapping.qualification);

        if (checkError) {
          console.error('Error checking existing qualifications:', checkError);
          alert(`Failed to check existing qualifications: ${checkError.message}`);
          return;
        }

        if (existingQuals && existingQuals.length > 0) {
          alert('This pilot already has this qualification.');
          setShowRepairDialog(false);
          setRepairDialogData(null);
          return;
        }

        // Add qualification
        const { error } = await supabase
          .from('pilot_qualifications')
          .insert({
            pilot_id: pilotId,
            qualification_id: item.mapping.qualification,
            achieved_date: dateInputToLocalDate(earnedDate).toISOString(),
            created_at: new Date().toISOString()
          });

        if (error) {
          console.error('Error adding qualification:', error);
          alert(`Failed to add qualification: ${error.message}`);
          return;
        }
      } else if (item.type === 'team' && item.mapping.teamId) {
        // Check if team membership already exists
        const { data: existingTeams, error: checkError } = await supabase
          .from('pilot_teams')
          .select('id')
          .eq('pilot_id', pilotId)
          .eq('team_id', item.mapping.teamId)
          .is('end_date', null);

        if (checkError) {
          console.error('Error checking existing team memberships:', checkError);
          alert(`Failed to check existing team memberships: ${checkError.message}`);
          return;
        }

        if (existingTeams && existingTeams.length > 0) {
          alert('This pilot is already a member of this team.');
          setShowRepairDialog(false);
          setRepairDialogData(null);
          return;
        }

        // Add team membership
        const { error } = await supabase
          .from('pilot_teams')
          .insert({
            pilot_id: pilotId,
            team_id: item.mapping.teamId,
            start_date: dateInputToLocalDate(earnedDate).toISOString(),
            created_at: new Date().toISOString()
          });

        if (error) {
          console.error('Error adding pilot to team:', error);
          alert(`Failed to add pilot to team: ${error.message}`);
          return;
        }
      }

      // Close dialog and refresh
      setShowRepairDialog(false);
      setRepairDialogData(null);

      // Refresh pilots data
      await loadPilots();
    } catch (err: any) {
      console.error('Error in repair:', err);
      alert(`Failed to apply repair: ${err.message}`);
    }
  };

  const handleRepairCancel = () => {
    setShowRepairDialog(false);
    setRepairDialogData(null);
  };

  // Export to CSV
  const handleExport = () => {
    const headers = ['Board Number', 'Callsign', 'Squadron', 'Missing from Pilot Record', 'Missing Discord Role'];
    const rows = verificationIssues.map(issue => [
      issue.boardNumber,
      issue.callsign || '',
      issue.squadronDesignation,
      issue.missingFromRecord.map(item => item.displayText).join('; '),
      issue.missingDiscordRole.join('; ')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `discord-role-verification-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header with actions */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#1F2937',
            marginBottom: '4px'
          }}>
            Discord Role Verification
          </h2>
          <p style={{
            fontSize: '14px',
            color: '#6B7280',
            margin: 0
          }}>
            Compare Discord roles with ReadyRoom app pilot records to identify discrepancies
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {refreshing && (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#82728C]"></div>
          )}

          <button
            onClick={() => setShowFilters(!showFilters)}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              backgroundColor: showFilters ? '#82728C' : 'white',
              color: showFilters ? 'white' : '#64748B',
              fontSize: '14px',
              fontFamily: 'Inter',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.6 : 1
            }}
          >
            <Filter size={16} />
            Filters
          </button>

          <button
            onClick={loadPilots}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              backgroundColor: 'white',
              color: '#64748B',
              fontSize: '14px',
              fontFamily: 'Inter',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.6 : 1
            }}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={handleExport}
            disabled={verificationIssues.length === 0 || refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              backgroundColor: 'white',
              color: '#64748B',
              fontSize: '14px',
              fontFamily: 'Inter',
              cursor: (verificationIssues.length > 0 && !refreshing) ? 'pointer' : 'not-allowed',
              opacity: (verificationIssues.length > 0 && !refreshing) ? 1 : 0.5
            }}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div style={{
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <h3 style={{
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1E293B',
              margin: 0
            }}>
              Filter Options
            </h3>
            <button
              onClick={() => {
                handleDeselectAllSquadrons();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                color: '#64748B',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Inter'
              }}
            >
              <X size={14} />
              Clear All
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <FilterSection
              title="Squadron"
              onSelectAll={handleSelectAllSquadrons}
              onClearAll={handleDeselectAllSquadrons}
            >
              {squadrons.map(squadron => (
                <FilterItem
                  key={squadron.id}
                  isSelected={selectedSquadronIds.includes(squadron.id)}
                  onClick={() => handleSquadronToggle(squadron.id)}
                >
                  <Checkbox isSelected={selectedSquadronIds.includes(squadron.id)} />
                  {squadron.insignia_url ? (
                    <div style={{
                      width: '20px',
                      height: '20px',
                      backgroundImage: `url(${squadron.insignia_url})`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      flexShrink: 0
                    }} />
                  ) : (
                    <div style={{
                      width: '20px',
                      height: '20px',
                      backgroundColor: '#E5E7EB',
                      borderRadius: '3px',
                      flexShrink: 0
                    }} />
                  )}
                  <span style={{ flex: 1, fontSize: '12px' }}>
                    {squadron.designation}
                  </span>
                </FilterItem>
              ))}
            </FilterSection>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: '#FEF2F2',
          border: '1px solid #FEE2E2',
          borderRadius: '8px',
          padding: '16px'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#DC2626' }}>
            {verificationIssues.length}
          </div>
          <div style={{ fontSize: '14px', color: '#991B1B', marginTop: '4px' }}>
            Pilots with Issues
          </div>
        </div>
        <div style={{
          backgroundColor: '#FEF3C7',
          border: '1px solid #FDE68A',
          borderRadius: '8px',
          padding: '16px'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#D97706' }}>
            {verificationIssues.filter(i => i.missingFromRecord.length > 0).length}
          </div>
          <div style={{ fontSize: '14px', color: '#92400E', marginTop: '4px' }}>
            Missing from Pilot Record
          </div>
        </div>
        <div style={{
          backgroundColor: '#EDEFFE',
          border: '1px solid #D9D6FE',
          borderRadius: '8px',
          padding: '16px'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#5865F2' }}>
            {verificationIssues.filter(i => i.missingDiscordRole.length > 0).length}
          </div>
          <div style={{ fontSize: '14px', color: '#4752C4', marginTop: '4px' }}>
            Missing Discord Role
          </div>
        </div>
      </div>

      {/* Results Table */}
      {verificationIssues.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px',
          backgroundColor: '#F9FAFB',
          borderRadius: '8px',
          border: '1px solid #E5E7EB'
        }}>
          <AlertCircle size={48} style={{ color: '#9CA3AF', margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
            No Discrepancies Found
          </h3>
          <p style={{ fontSize: '14px', color: '#6B7280', margin: 0 }}>
            All pilot records match their Discord roles for the selected squadrons.
          </p>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Pilot Record
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Missing from Pilot Record
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Missing Discord Role
                </th>
              </tr>
            </thead>
            <tbody>
              {verificationIssues.map((issue, index) => {
                // Find the full pilot data for this issue
                const pilot = pilots.find(p => p.id === issue.pilotId);

                // Get squadron color for callsign
                const getCallsignColor = () => {
                  if (!settings.displayPilotsWithSquadronColors) {
                    return pilot?.currentSquadron ? '#000000' : '#374151';
                  }
                  return pilot?.currentSquadron?.color_palette?.primary || '#374151';
                };

                return (
                  <tr
                    key={issue.pilotId}
                    style={{
                      borderBottom: index < verificationIssues.length - 1 ? '1px solid #F3F4F6' : 'none'
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ marginLeft: '-4px' }}>
                          <PilotIDBadgeSm
                            squadronTailCode={pilot?.currentSquadron?.tail_code || undefined}
                            boardNumber={issue.boardNumber}
                            squadronInsigniaUrl={pilot?.currentSquadron?.insignia_url || undefined}
                          />
                        </div>
                        <span style={{
                          fontFamily: 'Inter',
                          fontWeight: 700,
                          fontSize: '16px',
                          color: getCallsignColor(),
                          lineHeight: '16px'
                        }}>
                          {issue.callsign || '-'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                      {issue.missingFromRecord.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: '20px', color: '#D97706', listStyle: 'none' }}>
                          {issue.missingFromRecord.map((item, i) => (
                            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                              <span>{item.displayText}</span>
                              <button
                                onClick={() => handleQuickRepair(issue.pilotId, item)}
                                style={{
                                  padding: '2px',
                                  backgroundColor: 'transparent',
                                  border: 'none',
                                  borderRadius: '50%',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#D97706'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = 'rgba(217, 119, 6, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                                title={`Quick Add ${item.type === 'qualification' ? 'Qualification' : 'Team'}`}
                              >
                                <Wrench size={12} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span style={{ color: '#9CA3AF' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                      {issue.missingDiscordRole.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: '20px', color: '#5865F2' }}>
                          {issue.missingDiscordRole.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <span style={{ color: '#9CA3AF' }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Repair Dialog */}
      {showRepairDialog && repairDialogData && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={handleRepairCancel}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '500px',
              maxWidth: '600px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Discord Icon */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                marginRight: '8px'
              }}>
                <svg viewBox="0 0 24 24" style={{ width: '100%', height: '100%' }}>
                  <path
                    fill="#5865F2"
                    d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"
                  />
                </svg>
              </div>
              <h3 style={{
                margin: '0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#1F2937'
              }}>
                {repairDialogData.item.type === 'qualification' ? 'Add Missing Qualification' : 'Add to Team'}
              </h3>
            </div>

            {/* Mapping Display */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '24px',
              padding: '16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E2E8F0'
            }}>
              {/* Discord Logo */}
              <div style={{
                width: '20px',
                height: '20px',
                flexShrink: 0
              }}>
                <svg viewBox="0 0 24 24" style={{ width: '100%', height: '100%' }}>
                  <path
                    fill="#5865F2"
                    d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"
                  />
                </svg>
              </div>

              {/* Discord Role Name */}
              <span style={{
                fontSize: '14px',
                color: '#1F2937',
                fontWeight: '500',
                flexShrink: 0
              }}>
                {repairDialogData.item.mapping.discordRoleName}
              </span>

              {/* Arrow */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M13.5 6L20.5 12L13.5 18M19.5 12H3" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>

              {/* Target Badge */}
              <span style={{
                fontSize: '14px',
                fontWeight: '600',
                backgroundColor: repairDialogData.item.type === 'qualification' ? '#EDE9FE' : '#D1FAE5',
                color: repairDialogData.item.type === 'qualification' ? '#5B21B6' : '#065F46',
                border: repairDialogData.item.type === 'qualification' ? '1px solid #7C3AED' : '1px solid #10B981',
                padding: '4px 12px',
                borderRadius: '4px'
              }}>
                {repairDialogData.item.type === 'qualification'
                  ? repairDialogData.item.mapping.qualificationName
                  : repairDialogData.item.mapping.teamName}
              </span>
            </div>

            {/* Date Input */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151'
              }}>
                {repairDialogData.item.type === 'qualification' ? 'Earned Date' : 'Start Date'}
              </label>
              <input
                type="date"
                value={repairDialogData.earnedDate}
                onChange={(e) => setRepairDialogData({
                  ...repairDialogData,
                  earnedDate: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleRepairCancel}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRepairConfirm}
                style={{
                  padding: '8px 16px',
                  backgroundColor: repairDialogData.item.type === 'qualification' ? '#7C3AED' : '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                {repairDialogData.item.type === 'qualification' ? 'Add Qualification' : 'Add to Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper components matching CycleAttendanceReport style
const Checkbox: React.FC<{ isSelected: boolean }> = ({ isSelected }) => (
  <div style={{
    width: '14px',
    height: '14px',
    borderRadius: '3px',
    border: `1.5px solid ${isSelected ? '#3B82F6' : '#D1D5DB'}`,
    backgroundColor: isSelected ? '#3B82F6' : '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  }}>
    {isSelected && (
      <span style={{ color: '#FFFFFF', fontSize: '10px' }}>✓</span>
    )}
  </div>
);

const FilterSection: React.FC<{
  title: string;
  onSelectAll: () => void;
  onClearAll: () => void;
  children: React.ReactNode;
}> = ({ title, onSelectAll, onClearAll, children }) => (
  <div>
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px'
    }}>
      <h4 style={{
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: 'Inter',
        color: '#374151',
        margin: 0
      }}>
        {title}
      </h4>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={onSelectAll} style={{
          padding: '2px 6px',
          backgroundColor: '#EFF6FF',
          border: '1px solid #DBEAFE',
          borderRadius: '3px',
          fontSize: '10px',
          cursor: 'pointer',
          fontFamily: 'Inter',
          color: '#1E40AF'
        }}>
          All
        </button>
        <button onClick={onClearAll} style={{
          padding: '2px 6px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '3px',
          fontSize: '10px',
          cursor: 'pointer',
          fontFamily: 'Inter',
          color: '#DC2626'
        }}>
          None
        </button>
      </div>
    </div>
    <div style={{
      maxHeight: '200px',
      overflowY: 'auto',
      border: '1px solid #E5E7EB',
      borderRadius: '4px',
      padding: '4px'
    }}>
      {children}
    </div>
  </div>
);

const FilterItem: React.FC<{
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ isSelected, onClick, children }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '6px 8px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: isSelected ? '#EFF6FF' : (isHovered ? '#F8FAFC' : 'transparent'),
        borderRadius: '3px',
        transition: 'background-color 0.2s',
        marginBottom: '2px'
      }}
    >
      {children}
    </div>
  );
};

export default DiscordRoleVerificationReport;
