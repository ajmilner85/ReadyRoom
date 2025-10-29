import React, { useState, useEffect } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import { Card } from '../ui/card';
import { BarChart3 } from 'lucide-react';
import CycleAttendanceReport from './CycleAttendanceReport';

type ReportType = 'cycle-attendance';

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
    return (
      <div
        className={`flex items-center px-4 py-3 mb-2 cursor-pointer rounded-md ${
          active ? 'bg-[#82728C] text-white' : 'hover:bg-slate-100 text-[#64748B]'
        }`}
        onClick={onClick}
        style={{
          fontFamily: 'Inter',
          fontSize: '14px',
          fontWeight: active ? 500 : 400,
          transition: 'all 0.2s ease'
        }}
      >
        <div className="mr-3">{item.icon}</div>
        <div>{item.label}</div>
      </div>
    );
  };

  return (
    <div
      style={{
        backgroundColor: '#F0F4F8',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        boxSizing: 'border-box',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{
        maxWidth: '1350px',
        width: '100%',
        margin: '0 auto',
        padding: '0 20px'
      }}>
        {/* Main reports card with navigation and content */}
        <Card
          className="bg-white rounded-lg shadow-md overflow-hidden"
          style={{
            boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF'
          }}
        >
          <div style={{ padding: '24px' }}>
            <h1 style={{
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 300,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              textTransform: 'uppercase',
              marginBottom: '24px'
            }}>
              Reports
            </h1>

            <div className="flex" style={{ height: 'calc(100vh - 170px)', maxHeight: 'calc(100vh - 170px)', overflow: 'hidden' }}>
              {/* Reports navigation sidebar */}
              <div
                className="w-64 p-6"
                style={{
                  borderRight: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  paddingRight: '16px',
                  paddingTop: '16px',
                }}
              >
                <div style={{ marginBottom: '32px' }}>
                  {/* Section Title */}
                  <h3 style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#9CA3AF',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '12px',
                    fontFamily: 'Inter'
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

              {/* Main content area */}
              <div
                className="flex-1 p-6 overflow-auto"
                style={{
                  padding: '16px 24px',
                  fontFamily: 'Inter'
                }}
              >
                {renderReportContent()}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Reports;
