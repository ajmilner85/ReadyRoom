// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { Users } from 'lucide-react';
import PTRGrid from './PTRGrid';
import GradingDialog from './GradingDialog';
import { getCycleEnrollmentCount } from '../../utils/trainingEnrollmentService';
import { PTRCellData } from '../../types/TrainingTypes';
import { useAuth } from '../../context/AuthContext';

interface TrainingCycle {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  syllabus_id: string;
}

interface PilotTrainingRecordsProps {
  error: string | null;
  setError: (error: string | null) => void;
}

const PilotTrainingRecords: React.FC<PilotTrainingRecordsProps> = ({ error, setError }) => {
  const { userProfile } = useAuth();
  const [cycles, setCycles] = useState<TrainingCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});
  const [gradingDialogCell, setGradingDialogCell] = useState<PTRCellData | null>(null);
  const [ptrGridKey, setPtrGridKey] = useState(0);

  useEffect(() => {
    loadCycles();
  }, []);

  const loadCycles = async () => {
    try {
      setLoading(true);
      const { data, error: cyclesError } = await supabase
        .from('cycles')
        .select('*')
        .eq('type', 'Training')
        .order('start_date', { ascending: false });

      if (cyclesError) throw cyclesError;

      setCycles(data || []);
      if (data && data.length > 0 && !selectedCycleId) {
        setSelectedCycleId(data[0].id);
      }

      // Load enrollment counts for all cycles
      if (data && data.length > 0) {
        loadEnrollmentCounts(data.map(c => c.id));
      }
    } catch (err: any) {
      console.error('Error loading training cycles:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadEnrollmentCounts = async (cycleIds: string[]) => {
    try {
      const counts: Record<string, number> = {};
      await Promise.all(
        cycleIds.map(async (cycleId) => {
          const count = await getCycleEnrollmentCount(cycleId);
          counts[cycleId] = count;
        })
      );
      setEnrollmentCounts(counts);
    } catch (err: any) {
      console.error('Error loading enrollment counts:', err);
    }
  };

  const handleCellClick = (cellData: PTRCellData) => {
    setGradingDialogCell(cellData);
  };

  const handleGradingDialogClose = () => {
    setGradingDialogCell(null);
  };

  const handleGradingDialogSave = () => {
    // Refresh the PTR grid by updating the key
    setPtrGridKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '40px' }}>
        Loading training cycles...
      </div>
    );
  }

  return (
    <div style={{ padding: '40px 32px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px', margin: 0 }}>
          Pilot Training Records
        </h2>
        <p style={{ color: '#6B7280', fontSize: '14px', margin: 0, marginTop: '4px' }}>
          View and grade pilot training progress
        </p>
      </div>

      {/* Cycle Selector */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
            Training Cycle
          </label>
          {selectedCycleId && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '12px',
              fontSize: '13px',
              color: '#1E40AF',
              fontWeight: 500
            }}>
              <Users size={14} />
              {enrollmentCounts[selectedCycleId] ?? 0} enrolled
            </div>
          )}
        </div>
        <select
          value={selectedCycleId || ''}
          onChange={(e) => setSelectedCycleId(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: '14px',
            width: '100%',
            maxWidth: '400px',
            backgroundColor: 'white'
          }}
        >
          <option value="">Select a training cycle</option>
          {cycles.map(cycle => (
            <option key={cycle.id} value={cycle.id}>
              {cycle.name} ({new Date(cycle.start_date).toLocaleDateString('en-US', { timeZone: 'UTC' })})
            </option>
          ))}
        </select>
      </div>

      {/* PTR Grid Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {selectedCycleId && cycles.find(c => c.id === selectedCycleId)?.syllabus_id ? (
          <PTRGrid
            key={ptrGridKey}
            syllabusId={cycles.find(c => c.id === selectedCycleId)!.syllabus_id!}
            cycleId={selectedCycleId}
            onCellClick={handleCellClick}
          />
        ) : selectedCycleId ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: '#6B7280', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '40px' }}>
            This training cycle has no syllabus assigned.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: '#6B7280', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '40px' }}>
            Select a training cycle to view the PTR Grid
          </div>
        )}
      </div>

      {/* Grading Dialog */}
      {gradingDialogCell && selectedCycleId && (
        <GradingDialog
          cellData={gradingDialogCell}
          cycleId={selectedCycleId}
          onClose={handleGradingDialogClose}
          onSave={handleGradingDialogSave}
          currentUserPilotId={userProfile?.pilotId}
        />
      )}
    </div>
  );
};

export default PilotTrainingRecords;
