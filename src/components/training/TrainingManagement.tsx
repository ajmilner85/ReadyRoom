// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import { Card } from '../ui/card';
import { BookOpen, Users } from 'lucide-react';

// Import training subpages
import SyllabusManagement from './SyllabusManagement';
import PilotTrainingRecords from './PilotTrainingRecords';

// Define the types of training pages
type TrainingPage = 'syllabi' | 'records';

interface TrainingNavItem {
  id: TrainingPage;
  icon: React.ReactNode;
  label: string;
}

interface TrainingNavSection {
  title: string;
  items: TrainingNavItem[];
}

// Navigation sections for the training sidebar
const trainingNavSections: TrainingNavSection[] = [
  {
    title: 'Training Management',
    items: [
      {
        id: 'records',
        icon: <Users size={20} />,
        label: 'Pilot Training Records'
      },
      {
        id: 'syllabi',
        icon: <BookOpen size={20} />,
        label: 'Syllabus Management'
      }
    ]
  }
];

const TrainingManagement: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  const [activeTrainingPage, setActiveTrainingPage] = useState<TrainingPage>('records');
  const [error, setError] = useState<string | null>(null);

  // Clear page loading immediately since training loads fast
  useEffect(() => {
    setPageLoading('training', false);
  }, [setPageLoading]);

  // Navigate between training pages
  const handleTrainingNavigate = (page: TrainingPage) => {
    setActiveTrainingPage(page);
  };

  // Render content based on active training page
  const renderTrainingContent = () => {
    switch (activeTrainingPage) {
      case 'syllabi':
        return <SyllabusManagement error={error} setError={setError} />;
      case 'records':
        return <PilotTrainingRecords error={error} setError={setError} />;
      default:
        return <div>Select a training page</div>;
    }
  };

  // Training navigation item
  const TrainingNavItem: React.FC<{ item: TrainingNavItem; active: boolean; onClick: () => void }> = ({
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
      {error && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', backgroundColor: 'rgba(224,82,78,.12)', color: 'var(--rr-bad)', padding: '12px 16px', borderRadius: '4px', boxShadow: 'var(--rr-shadow)', zIndex: 1000 }}>
          {error}
        </div>
      )}

      <div style={{
        maxWidth: '1920px',
        width: '100%',
        margin: '0 auto',
        height: 'calc(100vh - 40px)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Main training card with navigation and content */}
        <Card
          className="bg-panel rounded-lg shadow-rr overflow-hidden"
          style={{
            boxShadow: 'var(--rr-shadow)',
            borderRadius: '8px',
            backgroundColor: 'var(--rr-panel)',
            height: 'calc(100vh - 40px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div className="flex" style={{ flex: 1, overflow: 'hidden' }}>
            {/* Training navigation sidebar */}
            <div
              className="w-64"
              style={{
                backgroundColor: 'var(--rr-panel)',
                padding: '40px 24px 24px 24px',
                display: 'flex',
                flexDirection: 'column',
                borderRight: '1px solid var(--rr-border)'
              }}
            >
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {trainingNavSections.map((section) => (
                  <div key={section.title} style={{ marginBottom: '32px' }}>
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
                      {section.title}
                    </h3>

                    {/* Section Items */}
                    {section.items.map((item) => (
                      <TrainingNavItem
                        key={item.id}
                        item={item}
                        active={activeTrainingPage === item.id}
                        onClick={() => handleTrainingNavigate(item.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Main content area */}
            <div
              className="flex-1"
              style={{
                fontFamily: 'inherit',
                minWidth: 0,
                overflow: 'hidden'
              }}
            >
              {renderTrainingContent()}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default TrainingManagement;
