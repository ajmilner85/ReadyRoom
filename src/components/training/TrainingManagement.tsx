// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabaseClient';
import { BookOpen, Plus, Edit, Trash2, Users } from 'lucide-react';
import PTRGrid from './PTRGrid';
import { useComponentPermissions } from '../../hooks/usePermissions';
import { getCycleEnrollmentCount } from '../../utils/trainingEnrollmentService';

const CARD_WIDTH = '550px';

interface Syllabus {
  id: string;
  name: string;
  description?: string;
  aircraft_type?: string;
  estimated_hours?: number;
}

interface TrainingCycle {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  syllabus_id: string;
}

const TrainingManagement: React.FC = () => {
  const navigate = useNavigate();
  const { isVisible } = useComponentPermissions();
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [cycles, setCycles] = useState<TrainingCycle[]>([]);
  const [selectedSyllabusId, setSelectedSyllabusId] = useState<string | undefined>();
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmSyllabusId, setDeleteConfirmSyllabusId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadSyllabi();
    loadCycles();
  }, []);

  const loadSyllabi = async () => {
    try {
      setLoading(true);
      const { data, error: syllabusError } = await supabase
        .from('training_syllabi')
        .select('*')
        .order('name');

      if (syllabusError) throw syllabusError;

      setSyllabi(data || []);
      if (data && data.length > 0 && !selectedSyllabusId) {
        setSelectedSyllabusId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCycles = async () => {
    try {
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

  const handleDeleteClick = (syllabusId: string) => {
    setDeleteConfirmSyllabusId(syllabusId);
    setDeleteConfirmText('');
  };

  const handleCancelDelete = () => {
    setDeleteConfirmSyllabusId(null);
    setDeleteConfirmText('');
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmText.toLowerCase() !== 'yes' || !deleteConfirmSyllabusId) return;

    try {
      const { error: deleteError } = await supabase
        .from('training_syllabi')
        .delete()
        .eq('id', deleteConfirmSyllabusId);

      if (deleteError) throw deleteError;

      // Clear selection if deleted syllabus was selected
      if (selectedSyllabusId === deleteConfirmSyllabusId) {
        setSelectedSyllabusId(undefined);
      }

      // Reload syllabi list
      await loadSyllabi();

      setDeleteConfirmSyllabusId(null);
      setDeleteConfirmText('');
    } catch (err: any) {
      setError(err.message);
      setDeleteConfirmSyllabusId(null);
      setDeleteConfirmText('');
    }
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: '#F0F4F8', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 40px)', width: '100%' }}>
          <div style={{ backgroundColor: 'white', boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)', borderRadius: '8px', padding: '40px 80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            Loading training management...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#F0F4F8', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box', padding: '20px', overflow: 'visible' }}>
      {error && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '12px 16px', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', zIndex: 1000 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', minHeight: 'calc(100vh - 40px)', position: 'relative', zIndex: 1, maxWidth: '2240px', width: 'min(100%, 2240px)', boxSizing: 'border-box', overflow: 'visible', padding: '15px', margin: '-15px' }}>

        {/* Syllabi List Card */}
        <div style={{ width: CARD_WIDTH, minWidth: '350px', height: 'calc(100vh - 40px)', boxSizing: 'border-box', overflowY: 'visible' }}>
          <div style={{ backgroundColor: 'white', boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)', borderRadius: '8px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px 8px' }}>
              <span style={{ fontFamily: 'Inter', fontStyle: 'normal', fontWeight: 300, fontSize: '20px', lineHeight: '24px', color: '#64748B', textTransform: 'uppercase', display: 'block', textAlign: 'center' }}>
                TRAINING SYLLABI
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0px' }}>
              {syllabi.length > 0 ? (
                <div style={{ padding: '16px' }}>
                  {syllabi.map((syllabus) => (
                    <div
                      key={syllabus.id}
                      style={{
                        padding: '16px',
                        backgroundColor: selectedSyllabusId === syllabus.id ? '#EFF6FF' : '#FFFFFF',
                        border: selectedSyllabusId === syllabus.id ? '2px solid #3B82F6' : '1px solid #E5E7EB',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setSelectedSyllabusId(syllabus.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '16px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                            {syllabus.name}
                          </div>
                          {syllabus.description && (
                            <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '8px' }}>
                              {syllabus.description}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#9CA3AF' }}>
                            {syllabus.aircraft_type && (
                              <span>Aircraft: {syllabus.aircraft_type}</span>
                            )}
                            {syllabus.estimated_hours && (
                              <span>Est. Hours: {syllabus.estimated_hours}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            style={{
                              padding: '6px 12px',
                              backgroundColor: 'transparent',
                              border: '1px solid #D1D5DB',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: '#374151',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/training-management/syllabus/${syllabus.id}`);
                            }}
                          >
                            <Edit size={14} />
                            Edit
                          </button>
                          {isVisible('manage_training_syllabi') && (
                            <button
                              style={{
                                padding: '6px',
                                backgroundColor: 'transparent',
                                border: '1px solid #FCA5A5',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: '#EF4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(syllabus.id);
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 20px', textAlign: 'center' }}>
                  <BookOpen size={48} style={{ color: '#9CA3AF', marginBottom: '16px' }} />
                  <p style={{ color: '#6B7280', marginBottom: '16px' }}>No training syllabi created yet</p>
                  <button
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#3B82F6',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onClick={() => navigate('/training-management/syllabus/new')}
                  >
                    <Plus size={16} />
                    Create Your First Syllabus
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PTR Grid Card */}
        <div style={{ flex: 1, minWidth: '650px', height: 'calc(100vh - 40px)', boxSizing: 'border-box', overflowY: 'visible' }}>
          <div style={{ backgroundColor: 'white', boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)', borderRadius: '8px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px 8px' }}>
              <span style={{ fontFamily: 'Inter', fontStyle: 'normal', fontWeight: 300, fontSize: '20px', lineHeight: '24px', color: '#64748B', textTransform: 'uppercase', display: 'block', textAlign: 'center' }}>
                PILOT TRAINING RECORD
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Cycle Selector */}
              <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB' }}>
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
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {selectedCycleId && cycles.find(c => c.id === selectedCycleId)?.syllabus_id ? (
                  <PTRGrid
                    syllabusId={cycles.find(c => c.id === selectedCycleId)!.syllabus_id!}
                    cycleId={selectedCycleId}
                  />
                ) : selectedCycleId ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: '#6B7280' }}>
                    This training cycle has no syllabus assigned.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: '#6B7280' }}>
                    Select a training cycle to view the PTR Grid
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmSyllabusId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1002
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px', margin: 0 }}>
                Delete Syllabus
              </h2>
              <p style={{ color: '#6B7280', fontSize: '14px', marginTop: '8px', marginBottom: '16px' }}>
                Are you sure you want to delete this syllabus? This will permanently delete all associated missions and objectives. This action cannot be undone.
              </p>
              <p style={{ color: '#374151', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                Type <strong>yes</strong> to confirm deletion:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type 'yes' to confirm"
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

            <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={handleCancelDelete}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'white',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteConfirmText.toLowerCase() !== 'yes'}
                style={{
                  padding: '8px 16px',
                  backgroundColor: deleteConfirmText.toLowerCase() === 'yes' ? '#EF4444' : '#FCA5A5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: deleteConfirmText.toLowerCase() === 'yes' ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Delete Syllabus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingManagement;
