import React, { useState, useEffect } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import { Card } from '../ui/card';
import { BarChart3, Shield } from 'lucide-react';
import CycleAttendanceReport from './CycleAttendanceReport';
import DiscordRoleVerificationReport from './DiscordRoleVerificationReport';

type ReportType = 'cycle-attendance' | 'discord-role-verification';

interface ReportsNavItem {
  id: ReportType;
  icon: React.ReactNode;
  label: string;
}

const reportsNavItems: ReportsNavItem[] = [
  {
    id: 'cycle-attendance',
    icon: <BarChart3 size={20} />,
    label: 'Cycle Attendance'
  },
  {
    id: 'discord-role-verification',
    icon: <Shield size={20} />,
    label: 'Discord Role Verification'
  }
];

const Reports: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  const [activeReport, setActiveReport] = useState<ReportType>('cycle-attendance');
  const [error, setError] = useState<string | null>(null);

  // Clear page loading immediately since reports load fast
  useEffect(() => {
    setPageLoading('reports', false);
  }, [setPageLoading]);

  // Navigate between report types
  const handleReportNavigate = (reportType: ReportType) => {
    setActiveReport(reportType);
  };

  // Render content based on active report
  const renderReportContent = () => {
    switch (activeReport) {
      case 'cycle-attendance':
        return <CycleAttendanceReport error={error} setError={setError} />;
      case 'discord-role-verification':
        return <DiscordRoleVerificationReport error={error} setError={setError} />;
      default:
        return <div>Select a report type</div>;
    }
  };

  // Report navigation item component
  const ReportNavItem: React.FC<{ item: ReportsNavItem; active: boolean; onClick: () => void }> = ({
    item,
    active,
    onClick
  }) => {
    const [isHovered, setIsHovered] = React.useState(false);

    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '16px',
          paddingRight: '16px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: active ? 500 : 400,
          transition: 'all 0.2s ease',
          borderRadius: '6px',
          marginBottom: '5px',
          height: '32px',
          gap: '5px',
          backgroundColor: active ? '#82728C' : isHovered ? 'var(--rr-panel2)' : 'transparent',
          color: active ? 'white' : 'var(--rr-text2)'
        }}
      >
        <div>{item.icon}</div>
        <div>{item.label}</div>
      </div>
    );
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--rr-panel2)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 20px 20px 20px',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
      }}
    >
      <div style={{
        maxWidth: '1350px',
        width: '100%',
        margin: '0 auto',
        height: 'calc(100vh - 40px)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Main reports card with navigation and content */}
        <Card
          className="bg-panel rounded-lg shadow-rr overflow-hidden"
          style={{
            boxShadow: 'var(--rr-shadow)',
          border: '1px solid var(--rr-border)',
            borderRadius: '10px',
            backgroundColor: 'var(--rr-panel)',
            height: 'calc(100vh - 40px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div className="flex" style={{ flex: 1, overflow: 'hidden' }}>
            {/* Reports navigation sidebar */}
            <div
              className="w-64"
              style={{
                backgroundColor: 'var(--rr-panel)',
                padding: '40px 24px 24px 24px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <div style={{ marginBottom: '32px' }}>
                  {/* Section Title */}
                  <h3 style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--rr-text3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '12px',
                    fontFamily: 'inherit'
                  }}>
                    Available Reports
                  </h3>

                  {/* Report Items */}
                  {reportsNavItems.map((item) => (
                    <ReportNavItem
                      key={item.id}
                      item={item}
                      active={activeReport === item.id}
                      onClick={() => handleReportNavigate(item.id)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Main content area */}
            <div
              className="flex-1 overflow-auto"
              style={{
                fontFamily: 'inherit',
                padding: '40px'
              }}
            >
              {renderReportContent()}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Reports;
