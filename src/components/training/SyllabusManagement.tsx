// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabaseClient';
import { BookOpen, Plus, Edit, Trash2 } from 'lucide-react';
import { useComponentPermissions } from '../../hooks/usePermissions';
import SyllabusEditor from './SyllabusEditor';

interface Syllabus {
  id: string;
  name: string;
  description?: string;
  aircraft_type?: string;
  estimated_hours?: number;
}

interface SyllabusManagementProps {
  error: string | null;
  setError: (error: string | null) => void;
}

const SyllabusManagement: React.FC<SyllabusManagementProps> = ({ error, setError }) => {
  const navigate = useNavigate();
  const { isVisible } = useComponentPermissions();
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [selectedSyllabusId, setSelectedSyllabusId] = useState<string | 'new' | undefined>();
  const [loading, setLoading] = useState(true);
  const [deleteConfirmSyllabusId, setDeleteConfirmSyllabusId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    loadSyllabi();
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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

  const handleSyllabusEditorBack = () => {
    setSelectedSyllabusId(undefined);
    loadSyllabi();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '40px' }}>
        Loading training syllabi...
      </div>
    );
  }

  // If a syllabus is selected for editing, show the SyllabusEditor
  if (selectedSyllabusId) {
    return (
      <div style={{ height: '100%', overflow: 'auto' }}>
        <SyllabusEditor
          syllabusId={selectedSyllabusId}
          onBack={handleSyllabusEditorBack}
        />
      </div>
    );
  }

  // Otherwise, show the syllabus list
  return (
    <div style={{ padding: '40px 32px', height: '100%', overflow: 'auto' }}>
      <div style={{ maxWidth: '800px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px', margin: 0 }}>
              Training Syllabi
            </h2>
            <p style={{ color: '#6B7280', fontSize: '14px', margin: 0, marginTop: '4px' }}>
              Manage training syllabi, missions, and objectives
            </p>
          </div>
          <button
            style={{
              padding: '10px 16px',
              backgroundColor: '#2563EB',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onClick={() => setSelectedSyllabusId('new')}
          >
            <Plus size={16} />
            Create Syllabus
          </button>
        </div>

        {/* Syllabi List */}
        {syllabi.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {syllabi.map((syllabus) => (
              <div
                key={syllabus.id}
                style={{
                  padding: '16px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  transition: 'all 0.2s'
                }}
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
                      onClick={() => setSelectedSyllabusId(syllabus.id)}
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
                        onClick={() => handleDeleteClick(syllabus.id)}
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
            <BookOpen size={48} style={{ color: '#9CA3AF', marginBottom: '16px' }} />
            <p style={{ color: '#6B7280', marginBottom: '16px', margin: 0 }}>No training syllabi created yet</p>
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
                gap: '8px',
                marginTop: '16px'
              }}
              onClick={() => setSelectedSyllabusId('new')}
            >
              <Plus size={16} />
              Create Your First Syllabus
            </button>
          </div>
        )}
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

export default SyllabusManagement;
