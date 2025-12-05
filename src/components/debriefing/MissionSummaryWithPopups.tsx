import React, { useState, useEffect } from 'react';
import { PilotStatusCard, AircraftStatusCard, TotalKillsCard, PerformanceCard } from './MissionSummaryCard';
import MissionSummaryDetailPopup from './MissionSummaryDetailPopup';
import { missionSummaryDetailService, type MissionSummaryDetails } from '../../services/missionSummaryDetailService';

interface MissionSummaryData {
  pilotStatus: {
    alive: number;
    mia: number;
    kia: number;
    unaccounted: number;
  };
  aircraftStatus: {
    recovered: number;
    damaged: number;
    destroyed: number;
    down: number;
    unaccounted: number;
  };
  totalKills: {
    a2a: number;
    a2g: number;
    a2s: number;
  };
  performance: {
    sats: number;
    unsats: number;
    total: number;
    totalPossible: number;
    unassessed: number;
  };
}

interface MissionSummaryWithPopupsProps {
  missionDebriefId: string;
  summaryData: MissionSummaryData;
}

interface PopupState {
  show: boolean;
  type: 'pilot-status' | 'aircraft-status' | 'kills' | 'performance';
  title: string;
  statusKey?: string;
  position: { top: number; left: number };
}

const MissionSummaryWithPopups: React.FC<MissionSummaryWithPopupsProps> = ({
  missionDebriefId,
  summaryData
}) => {
  const [detailData, setDetailData] = useState<MissionSummaryDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [popup, setPopup] = useState<PopupState>({
    show: false,
    type: 'pilot-status',
    title: '',
    position: { top: 0, left: 0 }
  });

  // Load detailed data when component mounts
  useEffect(() => {
    const loadDetails = async () => {
      setLoadingDetails(true);
      try {
        const details = await missionSummaryDetailService.getMissionSummaryDetails(missionDebriefId);
        setDetailData(details);
      } catch (error) {
        console.error('Failed to load mission summary details:', error);
      } finally {
        setLoadingDetails(false);
      }
    };

    loadDetails();
  }, [missionDebriefId]);

  const handlePilotStatusClick = (status: 'alive' | 'mia' | 'kia' | 'unaccounted', event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPopup({
      show: true,
      type: 'pilot-status',
      title: `Pilot Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      statusKey: status,
      position: {
        top: rect.top,
        left: rect.right + 10
      }
    });
  };

  const handleAircraftStatusClick = (status: 'recovered' | 'damaged' | 'destroyed' | 'down' | 'unaccounted', event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPopup({
      show: true,
      type: 'aircraft-status',
      title: `Aircraft Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      statusKey: status,
      position: {
        top: rect.top,
        left: rect.right + 10
      }
    });
  };

  const handleKillsClick = (category: 'a2a' | 'a2g' | 'a2s', event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPopup({
      show: true,
      type: 'kills',
      title: `${category.toUpperCase()} Kills`,
      statusKey: category,
      position: {
        top: rect.top,
        left: rect.right + 10
      }
    });
  };

  const handlePerformanceClick = (type: 'sats' | 'unsats' | 'unassessed', event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPopup({
      show: true,
      type: 'performance',
      title: type === 'sats' ? 'SATs' : type === 'unsats' ? 'UNSATs' : 'Not Assessed',
      statusKey: type,
      position: {
        top: rect.top,
        left: rect.right + 10
      }
    });
  };

  const closePopup = () => {
    setPopup(prev => ({ ...prev, show: false }));
  };

  // Get pilots for current popup
  const getPopupPilots = () => {
    if (!detailData || !popup.statusKey) return [];

    if (popup.type === 'pilot-status') {
      return detailData.pilotStatusDetails[popup.statusKey as keyof typeof detailData.pilotStatusDetails] || [];
    } else if (popup.type === 'aircraft-status') {
      return detailData.aircraftStatusDetails[popup.statusKey as keyof typeof detailData.aircraftStatusDetails] || [];
    }

    return [];
  };

  // Get kills for current popup
  const getPopupKills = () => {
    if (!detailData || !popup.statusKey || popup.type !== 'kills') return [];
    return detailData.killDetails[popup.statusKey as keyof typeof detailData.killDetails] || [];
  };

  // Get performance categories for current popup
  const getPopupPerformance = () => {
    if (!detailData || !popup.statusKey || popup.type !== 'performance') return [];

    const type = popup.statusKey as 'sats' | 'unsats' | 'unassessed';

    // Filter categories based on type
    return detailData.performanceDetails.categories.filter(cat => {
      if (type === 'sats') return cat.sats > 0;
      if (type === 'unsats') return cat.unsats > 0;
      if (type === 'unassessed') return cat.unassessed > 0;
      return false;
    });
  };

  return (
    <>
      <h3 style={{
        fontSize: '20px',
        fontWeight: 300,
        color: '#646F7E',
        fontFamily: 'Inter',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '16px',
        marginTop: '24px',
        textAlign: 'center'
      }}>
        Mission Summary
      </h3>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <PilotStatusCard
          data={summaryData.pilotStatus}
          onRowClick={handlePilotStatusClick}
        />
        <AircraftStatusCard
          data={summaryData.aircraftStatus}
          onRowClick={handleAircraftStatusClick}
        />
        <TotalKillsCard
          data={summaryData.totalKills}
          onRowClick={handleKillsClick}
        />
        <PerformanceCard
          data={summaryData.performance}
          onRowClick={handlePerformanceClick}
        />
      </div>

      {/* Popup */}
      {popup.show && detailData && !loadingDetails && (
        <MissionSummaryDetailPopup
          type={popup.type}
          title={popup.title}
          pilots={popup.type === 'pilot-status' || popup.type === 'aircraft-status' ? getPopupPilots() : undefined}
          kills={popup.type === 'kills' ? getPopupKills() : undefined}
          performanceCategories={popup.type === 'performance' ? getPopupPerformance() : undefined}
          position={popup.position}
          onClose={closePopup}
        />
      )}
    </>
  );
};

export default MissionSummaryWithPopups;
