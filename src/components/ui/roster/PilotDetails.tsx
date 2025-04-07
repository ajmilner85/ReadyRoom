import React, { useRef } from 'react';
import { Card } from '../card';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Pilot } from '../../../types/PilotTypes';
import { Status } from '../../../utils/statusService';
import { Role } from '../../../utils/roleService';
import { Qualification } from '../../../utils/qualificationService';
import BasicPilotInfo from './BasicPilotInfo';
import StatusSelector from './StatusSelector';
import RoleSelector from './RoleSelector';
import QualificationsManager from './QualificationsManager';

interface PilotDetailsProps {
  selectedPilot: Pilot | null;
  statuses: Status[];
  roles: Role[];
  pilotRoles: Role[];
  availableQualifications: Qualification[];
  pilotQualifications: any[];
  loadingRoles: boolean;
  updatingRoles: boolean;
  updatingStatus: boolean;
  loadingQualifications: boolean;
  disabledRoles: Record<string, boolean>;
  selectedQualification: string;
  qualificationAchievedDate: string;
  isAddingQualification: boolean;
  updatingQualifications: boolean;
  setSelectedQualification: (id: string) => void;
  setQualificationAchievedDate: (date: string) => void;
  handleStatusChange: (statusId: string) => void;
  handleRoleChange: (roleId: string) => void;
  handleAddQualification: () => void;
  handleRemoveQualification: (id: string) => void;
}

const PilotDetails: React.FC<PilotDetailsProps> = ({
  selectedPilot,
  statuses,
  roles,
  pilotRoles,
  availableQualifications,
  pilotQualifications,
  loadingRoles,
  updatingRoles,
  updatingStatus,
  loadingQualifications,
  disabledRoles,
  selectedQualification,
  qualificationAchievedDate,
  isAddingQualification,
  updatingQualifications,
  setSelectedQualification,
  setQualificationAchievedDate,
  handleStatusChange,
  handleRoleChange,
  handleAddQualification,
  handleRemoveQualification
}) => {
  const pilotDetailsRef = useRef<HTMLDivElement>(null);

  if (!selectedPilot) {
    return (
      <div ref={pilotDetailsRef} style={pilotDetailsStyles.container}>
        <div style={pilotDetailsStyles.emptyState}>
          Select a pilot to view their details
        </div>
      </div>
    );
  }

  return (
    <div ref={pilotDetailsRef} style={pilotDetailsStyles.container}>
      <div>
        {/* Section 1: Basic Information */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>Basic Information</h2>
          <BasicPilotInfo pilot={selectedPilot} />
        </Card>
        
        {/* Section 2: Status, Roles, and Qualifications */}
        <div style={{ display: 'grid', gap: '24px', marginTop: '24px' }}>
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>Status, Role and Qualifications</h2>
            
            {/* Status */}
            <StatusSelector
              statuses={statuses}
              selectedStatusId={selectedPilot.status_id || ''}
              updatingStatus={updatingStatus}
              handleStatusChange={handleStatusChange}
            />
            
            {/* Role */}
            <RoleSelector
              roles={roles}
              pilotRoles={pilotRoles}
              updatingRoles={updatingRoles}
              loadingRoles={loadingRoles}
              disabledRoles={disabledRoles}
              handleRoleChange={handleRoleChange}
            />
            
            {/* Qualifications */}
            <QualificationsManager
              pilotQualifications={pilotQualifications}
              availableQualifications={availableQualifications}
              selectedQualification={selectedQualification}
              qualificationAchievedDate={qualificationAchievedDate}
              loadingQualifications={loadingQualifications}
              isAddingQualification={isAddingQualification}
              updatingQualifications={updatingQualifications}
              setSelectedQualification={setSelectedQualification}
              setQualificationAchievedDate={setQualificationAchievedDate}
              handleAddQualification={handleAddQualification}
              handleRemoveQualification={handleRemoveQualification}
            />
          </Card>

          {/* Section 3: Attendance and Service Record */}
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4" style={pilotDetailsStyles.sectionTitle}>
              Attendance and Service Record
            </h2>
            
            <div style={pilotDetailsStyles.emptyQualMessage}>
              Service record information will be available in a future update
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PilotDetails;