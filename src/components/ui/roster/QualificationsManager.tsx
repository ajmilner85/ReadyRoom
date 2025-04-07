import React from 'react';
import { pilotDetailsStyles } from '../../../styles/RosterManagementStyles';
import { Qualification } from '../../../utils/qualificationService';

interface QualificationsManagerProps {
  pilotQualifications: any[];
  availableQualifications: Qualification[];
  selectedQualification: string;
  qualificationAchievedDate: string;
  loadingQualifications: boolean;
  isAddingQualification: boolean;
  updatingQualifications: boolean;
  setSelectedQualification: (id: string) => void;
  setQualificationAchievedDate: (date: string) => void;
  handleAddQualification: () => void;
  handleRemoveQualification: (id: string) => void;
}

const QualificationsManager: React.FC<QualificationsManagerProps> = ({
  pilotQualifications,
  availableQualifications,
  selectedQualification,
  qualificationAchievedDate,
  loadingQualifications,
  isAddingQualification,
  updatingQualifications,
  setSelectedQualification,
  setQualificationAchievedDate,
  handleAddQualification,
  handleRemoveQualification
}) => {
  return (
    <div>
      <label style={pilotDetailsStyles.fieldLabel}>
        Qualifications
      </label>

      {/* Show loading state if loading qualifications */}
      {loadingQualifications ? (
        <div className="text-center p-4 text-slate-500">
          Loading qualifications...
        </div>
      ) : pilotQualifications.length > 0 ? (
        <div className="space-y-2 p-4 border border-gray-200 rounded-md bg-slate-50" style={pilotDetailsStyles.qualContainer}>
          {pilotQualifications.map((pilotQual) => (
            <div 
              key={pilotQual.id} 
              className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0 relative group"
            >
              <div className="flex-1">
                <div className="font-medium">{pilotQual.qualification.name}</div>
                {pilotQual.achieved_date && (
                  <div className="text-xs text-slate-500">
                    {new Date(pilotQual.achieved_date).toLocaleDateString()}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleRemoveQualification(pilotQual.qualification_id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                disabled={updatingQualifications}
                title="Remove qualification"
                style={{
                  width: '30px',
                  height: '30px',
                  padding: '4px',
                  borderRadius: '4px',
                  background: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748B'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center text-sm text-slate-500 border border-dashed border-slate-300 rounded-md" style={pilotDetailsStyles.qualContainer}>
          No qualifications added
        </div>
      )}

      {/* Add qualification section */}
      <div className="mt-4" style={pilotDetailsStyles.qualContainer}>
        <div className="flex space-x-2 mb-2">
          <div className="flex-1">
            <select
              value={selectedQualification}
              onChange={(e) => setSelectedQualification(e.target.value)}
              disabled={isAddingQualification || updatingQualifications}
              className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select qualification --</option>
              {availableQualifications
                .filter(qual => !pilotQualifications.some(pq => pq.qualification_id === qual.id))
                .map(qual => (
                  <option key={qual.id} value={qual.id}>
                    {qual.name}
                  </option>
                ))
              }
            </select>
          </div>
          <input
            type="date"
            value={qualificationAchievedDate}
            onChange={(e) => setQualificationAchievedDate(e.target.value)}
            disabled={isAddingQualification || updatingQualifications || !selectedQualification}
            className="px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex justify-center">
          <button
            onClick={handleAddQualification}
            disabled={!selectedQualification || isAddingQualification || updatingQualifications}
            className={`mt-2 px-4 py-1 text-sm font-medium rounded-md ${
              !selectedQualification || isAddingQualification || updatingQualifications
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
            }`}
          >
            {isAddingQualification ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QualificationsManager;