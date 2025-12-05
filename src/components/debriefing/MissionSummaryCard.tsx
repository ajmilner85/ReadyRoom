import React from 'react';
import { User, UserSearch, Skull, HelpCircle, PlaneLanding, Wrench, Flame, ThumbsDown } from 'lucide-react';

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

interface CategoryCardProps {
  title: string;
  children: React.ReactNode;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ title, children }) => {
  return (
    <div style={{
      backgroundColor: '#F8FAFC',
      borderRadius: '12px',
      padding: '24px',
      border: '1px solid #E2E8F0'
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 600,
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        fontFamily: 'Inter',
        marginBottom: '12px'
      }}>
        {title}
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {children}
      </div>
    </div>
  );
};

interface StatusRowProps {
  icon?: React.ReactNode;
  label: string;
  value: number;
  highlighted?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

const StatusRow: React.FC<StatusRowProps> = ({ icon, label, value, highlighted = false, onClick }) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        backgroundColor: highlighted ? '#EFF6FF' : isHovered ? '#F8FAFC' : '#FFFFFF',
        borderRadius: '6px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.15s'
      }}
    >
      {icon}
      <span style={{
        fontSize: '13px',
        fontWeight: highlighted ? 600 : 500,
        color: highlighted ? '#1E293B' : '#64748B',
        fontFamily: 'Inter',
        minWidth: '100px'
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '16px',
        fontWeight: 600,
        color: highlighted ? '#2563EB' : '#1E293B',
        fontFamily: 'Inter',
        marginLeft: 'auto'
      }}>
        {value ?? 0}
      </span>
    </div>
  );
};

interface PilotStatusCardProps {
  data: MissionSummaryData['pilotStatus'];
  onRowClick?: (status: 'alive' | 'mia' | 'kia' | 'unaccounted', event: React.MouseEvent<HTMLDivElement>) => void;
}

export const PilotStatusCard: React.FC<PilotStatusCardProps> = ({ data, onRowClick }) => {
  return (
    <CategoryCard title="Pilot Status">
      <StatusRow
        icon={<User size={16} style={{ color: '#10B981', flexShrink: 0 }} />}
        label="Alive"
        value={data.alive}
        onClick={onRowClick ? (e) => onRowClick('alive', e) : undefined}
      />
      <StatusRow
        icon={<UserSearch size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />}
        label="MIA"
        value={data.mia}
        onClick={onRowClick ? (e) => onRowClick('mia', e) : undefined}
      />
      <StatusRow
        icon={<Skull size={16} style={{ color: '#EF4444', flexShrink: 0 }} />}
        label="KIA"
        value={data.kia}
        onClick={onRowClick ? (e) => onRowClick('kia', e) : undefined}
      />
      <StatusRow
        icon={<HelpCircle size={16} style={{ color: '#9CA3AF', flexShrink: 0 }} />}
        label="Unaccounted"
        value={data.unaccounted}
        onClick={onRowClick ? (e) => onRowClick('unaccounted', e) : undefined}
      />
    </CategoryCard>
  );
};

interface AircraftStatusCardProps {
  data: MissionSummaryData['aircraftStatus'];
  onRowClick?: (status: 'recovered' | 'damaged' | 'destroyed' | 'down' | 'unaccounted', event: React.MouseEvent<HTMLDivElement>) => void;
}

export const AircraftStatusCard: React.FC<AircraftStatusCardProps> = ({ data, onRowClick }) => {
  return (
    <CategoryCard title="Aircraft Status">
      <StatusRow
        icon={<PlaneLanding size={16} style={{ color: '#10B981', flexShrink: 0 }} />}
        label="Recovered"
        value={data.recovered}
        onClick={onRowClick ? (e) => onRowClick('recovered', e) : undefined}
      />
      <StatusRow
        icon={<Wrench size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />}
        label="Damaged"
        value={data.damaged}
        onClick={onRowClick ? (e) => onRowClick('damaged', e) : undefined}
      />
      <StatusRow
        icon={<Flame size={16} style={{ color: '#EF4444', flexShrink: 0 }} />}
        label="Destroyed"
        value={data.destroyed}
        onClick={onRowClick ? (e) => onRowClick('destroyed', e) : undefined}
      />
      <StatusRow
        icon={<ThumbsDown size={16} style={{ color: '#6B7280', flexShrink: 0 }} />}
        label="Down"
        value={data.down}
        onClick={onRowClick ? (e) => onRowClick('down', e) : undefined}
      />
      <StatusRow
        icon={<HelpCircle size={16} style={{ color: '#9CA3AF', flexShrink: 0 }} />}
        label="Unaccounted"
        value={data.unaccounted}
        onClick={onRowClick ? (e) => onRowClick('unaccounted', e) : undefined}
      />
    </CategoryCard>
  );
};

interface TotalKillsCardProps {
  data: MissionSummaryData['totalKills'];
  onRowClick?: (category: 'a2a' | 'a2g' | 'a2s', event: React.MouseEvent<HTMLDivElement>) => void;
}

export const TotalKillsCard: React.FC<TotalKillsCardProps> = ({ data, onRowClick }) => {
  return (
    <CategoryCard title="Total Kills">
      <StatusRow
        label="A2A"
        value={data.a2a}
        onClick={onRowClick ? (e) => onRowClick('a2a', e) : undefined}
      />
      <StatusRow
        label="A2G"
        value={data.a2g}
        onClick={onRowClick ? (e) => onRowClick('a2g', e) : undefined}
      />
      <StatusRow
        label="A2S"
        value={data.a2s}
        onClick={onRowClick ? (e) => onRowClick('a2s', e) : undefined}
      />
      <StatusRow label="Total" value={data.a2a + data.a2g + data.a2s} highlighted />
    </CategoryCard>
  );
};

interface PerformanceCardProps {
  data: MissionSummaryData['performance'];
  onRowClick?: (type: 'sats' | 'unsats' | 'unassessed', event: React.MouseEvent<HTMLDivElement>) => void;
}

export const PerformanceCard: React.FC<PerformanceCardProps> = ({ data, onRowClick }) => {
  return (
    <CategoryCard title="Performance">
      <StatusRow
        label="SATs"
        value={data.sats ?? 0}
        onClick={onRowClick ? (e) => onRowClick('sats', e) : undefined}
      />
      <StatusRow
        label="UNSATs"
        value={data.unsats ?? 0}
        onClick={onRowClick ? (e) => onRowClick('unsats', e) : undefined}
      />
      <StatusRow
        label="Not Assessed"
        value={data.unassessed ?? 0}
        onClick={onRowClick ? (e) => onRowClick('unassessed', e) : undefined}
      />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        backgroundColor: '#EFF6FF',
        borderRadius: '6px',
        marginTop: '4px'
      }}>
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#1E293B',
          fontFamily: 'Inter',
          minWidth: '100px'
        }}>
          Total Evaluated
        </span>
        <span style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#2563EB',
          fontFamily: 'Inter',
          marginLeft: 'auto'
        }}>
          {data.total ?? 0}/{data.totalPossible ?? 0}
        </span>
      </div>
    </CategoryCard>
  );
};

interface MissionSummaryCardProps {
  data: MissionSummaryData;
}

const MissionSummaryCard: React.FC<MissionSummaryCardProps> = ({ data }) => {
  return (
    <div style={{
      backgroundColor: '#F8F9FA',
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '24px',
      border: '1px solid #E2E8F0'
    }}>
      {/* Header */}
      <h3 style={{
        fontSize: '18px',
        fontWeight: 600,
        color: '#1E293B',
        fontFamily: 'Inter',
        marginBottom: '20px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        Mission Summary
      </h3>

      {/* Grid of summary sections */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {/* Pilot Status Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #E2E8F0'
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#64748B',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontFamily: 'Inter',
            marginBottom: '4px'
          }}>Pilot Status</div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <User size={16} style={{ color: '#10B981', flexShrink: 0 }} />
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>Alive</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.pilotStatus.alive}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <UserSearch size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>MIA</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.pilotStatus.mia}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <Skull size={16} style={{ color: '#EF4444', flexShrink: 0 }} />
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>KIA</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.pilotStatus.kia}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <HelpCircle size={16} style={{ color: '#9CA3AF', flexShrink: 0 }} />
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>Unaccounted</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.pilotStatus.unaccounted}</span>
          </div>
        </div>

        {/* Aircraft Status Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #E2E8F0'
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#64748B',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontFamily: 'Inter',
            marginBottom: '4px'
          }}>Aircraft Status</div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <PlaneLanding size={16} style={{ color: '#10B981', flexShrink: 0 }} />
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>Recovered</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.aircraftStatus.recovered}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <Wrench size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>Damaged</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.aircraftStatus.damaged}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <Flame size={16} style={{ color: '#EF4444', flexShrink: 0 }} />
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>Destroyed</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.aircraftStatus.destroyed}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <HelpCircle size={16} style={{ color: '#9CA3AF', flexShrink: 0 }} />
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>Unaccounted</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.aircraftStatus.unaccounted}</span>
          </div>
        </div>

        {/* Total Kills Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #E2E8F0'
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#64748B',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontFamily: 'Inter',
            marginBottom: '4px'
          }}>Total Kills</div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>A2A</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.totalKills.a2a}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>A2G</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.totalKills.a2g}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>A2S</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.totalKills.a2s}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#EFF6FF',
            borderRadius: '6px',
            marginTop: '4px'
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>Total</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#2563EB',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>
              {data.totalKills.a2a + data.totalKills.a2g + data.totalKills.a2s}
            </span>
          </div>
        </div>

        {/* Performance Metrics Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #E2E8F0'
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#64748B',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontFamily: 'Inter',
            marginBottom: '4px'
          }}>Performance</div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>SATs</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.performance.sats}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '6px'
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>UNSATs</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>{data.performance.unsats}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#EFF6FF',
            borderRadius: '6px',
            marginTop: '4px'
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#1E293B',
              fontFamily: 'Inter',
              minWidth: '100px'
            }}>Total Evaluated</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#2563EB',
              fontFamily: 'Inter',
              marginLeft: 'auto'
            }}>
              {data.performance.total}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissionSummaryCard;
