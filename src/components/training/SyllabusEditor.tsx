// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabaseClient';
import { ArrowLeft, Save, Plus, Trash2, GripVertical, Edit2, Image as ImageIcon, X } from 'lucide-react';
import ReferenceMaterialsInput from '../ui/events/ReferenceMaterialsInput';
import CriteriaBlockEditor, { CriteriaBlock } from './CriteriaBlockEditor';
import type { ReferenceMaterial } from '../../types/EventTypes';
import { uploadEventImage } from '../../utils/eventImageService';
import { IssuesTab } from '../issues';

interface Mission {
  id?: string;
  mission_number: number | null;
  mission_name: string;
  description?: string;
  week_number: number;
  objectives: Objective[];
  reference_materials?: ReferenceMaterial[];
  image_url?: {
    headerImage?: string;
    additionalImages?: string[];
  } | null;
}

interface Objective {
  id?: string;
  scope_level: string;
  objective_text: string;
  display_order: number;
}

interface SyllabusEditorProps {
  syllabusId?: string;
  onBack?: () => void;
}

const SyllabusEditor: React.FC<SyllabusEditorProps> = ({ syllabusId: propSyllabusId, onBack }) => {
  const { syllabusId: paramSyllabusId } = useParams<{ syllabusId: string }>();
  const navigate = useNavigate();
  const syllabusId = propSyllabusId || paramSyllabusId;
  const isCreating = syllabusId === 'new';

  const [syllabus, setSyllabus] = useState({
    name: '',
    description: '',
    starts_at_week_zero: false,
    auto_enrollment_rules: [] as CriteriaBlock[],
    instructor_qualification_rules: [] as CriteriaBlock[]
  });

  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(!isCreating);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMission, setEditingMission] = useState<{ index: number; mission: Mission } | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  // Tab state for the syllabus editor
  const [activeTab, setActiveTab] = useState<'missions' | 'student-enrollment' | 'instructor-qualifications' | 'issues'>('missions');

  // Mission dialog tab state
  const [missionDialogTab, setMissionDialogTab] = useState<'details' | 'objectives' | 'reference-materials' | 'issues'>('details');

  // Image upload state for mission editor
  const [missionImages, setMissionImages] = useState<(File | null)[]>([null, null, null, null]);
  const [missionImagePreviews, setMissionImagePreviews] = useState<(string | null)[]>([null, null, null, null]);
  const [missionImageDragStates, setMissionImageDragStates] = useState<boolean[]>([false, false, false, false]);

  // Auto-enrollment options
  const [standings, setStandings] = useState<Array<{ id: string; name: string }>>([]);
  const [statuses, setStatuses] = useState<Array<{ id: string; name: string }>>([]);
  const [qualifications, setQualifications] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!isCreating && syllabusId) {
      loadSyllabus();
    }
    loadEnrollmentOptions();
  }, [syllabusId, isCreating]);

  const loadEnrollmentOptions = async () => {
    try {
      const [standingsData, statusesData, qualificationsData] = await Promise.all([
        supabase.from('standings').select('id, name').order('name'),
        supabase.from('statuses').select('id, name').order('name'),
        supabase.from('qualifications').select('id, name').eq('active', true).order('name')
      ]);

      if (standingsData.data) setStandings(standingsData.data);
      if (statusesData.data) setStatuses(statusesData.data);
      if (qualificationsData.data) setQualifications(qualificationsData.data);
    } catch (err) {
      console.error('Error loading enrollment options:', err);
    }
  };

  const loadSyllabus = async () => {
    if (!syllabusId || isCreating) return;

    try {
      setLoading(true);

      const { data: syllabusData, error: syllabusError } = await supabase
        .from('training_syllabi')
        .select('*')
        .eq('id', syllabusId)
        .single();

      if (syllabusError) throw syllabusError;

      // Convert legacy flat rules to block format if needed
      const convertToBlockFormat = (rules: any): CriteriaBlock[] => {
        if (!rules || !Array.isArray(rules) || rules.length === 0) {
          return [];
        }
        // Check if already in block format (has 'criteria' key)
        if (rules[0]?.criteria) {
          return rules as CriteriaBlock[];
        }
        // Legacy flat format - convert to single block
        return [{ criteria: rules }];
      };

      setSyllabus({
        name: syllabusData.name,
        description: syllabusData.description || '',
        starts_at_week_zero: syllabusData.starts_at_week_zero || false,
        auto_enrollment_rules: convertToBlockFormat(syllabusData.auto_enrollment_rules),
        instructor_qualification_rules: convertToBlockFormat(syllabusData.instructor_qualification_rules)
      });

      const { data: missionsData, error: missionsError } = await supabase
        .from('training_syllabus_missions')
        .select('*')
        .eq('syllabus_id', syllabusId)
        .order('week_number');

      if (missionsError) throw missionsError;

      const missionsWithObjectives = await Promise.all((missionsData || []).map(async (mission) => {
        const { data: objectivesData, error: objectivesError } = await supabase
          .from('syllabus_training_objectives')
          .select('*')
          .eq('syllabus_mission_id', mission.id)
          .order('display_order');

        if (objectivesError) throw objectivesError;

        return {
          id: mission.id,
          mission_number: mission.mission_number,
          mission_name: mission.mission_name,
          description: mission.description,
          week_number: mission.week_number || 1,
          reference_materials: Array.isArray(mission.reference_materials) ? mission.reference_materials : [],
          image_url: mission.image_url || null,
          objectives: (objectivesData || []).map((obj: any) => ({
            id: obj.id,
            scope_level: obj.scope_level,
            objective_text: obj.objective_text,
            display_order: obj.display_order
          }))
        };
      }));

      setMissions(missionsWithObjectives);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      if (!syllabus.name.trim()) {
        throw new Error('Syllabus name is required');
      }

      let currentSyllabusId = syllabusId;

      if (isCreating) {
        const { data: newSyllabus, error: createError } = await supabase
          .from('training_syllabi')
          .insert({
            name: syllabus.name,
            description: syllabus.description,
            starts_at_week_zero: syllabus.starts_at_week_zero,
            auto_enrollment_rules: syllabus.auto_enrollment_rules,
            instructor_qualification_rules: syllabus.instructor_qualification_rules
          })
          .select()
          .single();

        if (createError) throw createError;
        currentSyllabusId = newSyllabus.id;
      } else {
        const { error: updateError } = await supabase
          .from('training_syllabi')
          .update({
            name: syllabus.name,
            description: syllabus.description,
            starts_at_week_zero: syllabus.starts_at_week_zero,
            auto_enrollment_rules: syllabus.auto_enrollment_rules,
            instructor_qualification_rules: syllabus.instructor_qualification_rules
          })
          .eq('id', syllabusId);

        if (updateError) throw updateError;
      }

      // Save missions with calculated week numbers based on order
      const startWeek = syllabus.starts_at_week_zero ? 0 : 1;

      // Prepare batched mission operations
      const missionsToUpdate = [];
      const missionsToInsert = [];
      const missionIdMap = new Map(); // Map old mission IDs to new ones for objectives

      for (const [index, mission] of missions.entries()) {
        const missionData = {
          syllabus_id: currentSyllabusId,
          mission_number: mission.mission_number,
          mission_name: mission.mission_name,
          description: mission.description,
          week_number: startWeek + index,
          reference_materials: mission.reference_materials || []
        };

        if (mission.id) {
          missionsToUpdate.push({ ...missionData, id: mission.id });
          missionIdMap.set(mission.id, mission.id);
        } else {
          missionsToInsert.push(missionData);
        }
      }

      // Batch update existing missions (in parallel)
      if (missionsToUpdate.length > 0) {
        await Promise.all(
          missionsToUpdate.map(async (missionData) => {
            const { error: updateMissionError } = await supabase
              .from('training_syllabus_missions')
              .update(missionData)
              .eq('id', missionData.id);
            if (updateMissionError) throw updateMissionError;
          })
        );
      }

      // Batch insert new missions
      let newMissions = [];
      if (missionsToInsert.length > 0) {
        const { data: insertedMissions, error: insertMissionError } = await supabase
          .from('training_syllabus_missions')
          .insert(missionsToInsert)
          .select();

        if (insertMissionError) throw insertMissionError;
        newMissions = insertedMissions || [];
      }

      // Map new mission IDs
      let newMissionIndex = 0;
      for (const [index, mission] of missions.entries()) {
        if (!mission.id) {
          missionIdMap.set(index, newMissions[newMissionIndex].id);
          newMissionIndex++;
        }
      }

      // Now batch save objectives
      const objectivesToUpdate = [];
      const objectivesToInsert = [];

      for (const [index, mission] of missions.entries()) {
        const currentMissionId = mission.id ? missionIdMap.get(mission.id) : missionIdMap.get(index);

        for (const [objIndex, objective] of mission.objectives.entries()) {
          const objectiveData = {
            syllabus_mission_id: currentMissionId,
            scope_level: objective.scope_level,
            objective_text: objective.objective_text,
            display_order: objIndex
          };

          if (objective.id) {
            objectivesToUpdate.push({ ...objectiveData, id: objective.id });
          } else {
            objectivesToInsert.push(objectiveData);
          }
        }
      }

      // Batch update objectives (in parallel)
      if (objectivesToUpdate.length > 0) {
        await Promise.all(
          objectivesToUpdate.map(async (objData) => {
            const { error: updateObjError } = await supabase
              .from('syllabus_training_objectives')
              .update(objData)
              .eq('id', objData.id);
            if (updateObjError) throw updateObjError;
          })
        );
      }

      // Batch insert objectives
      if (objectivesToInsert.length > 0) {
        const { error: insertObjError } = await supabase
          .from('syllabus_training_objectives')
          .insert(objectivesToInsert);
        if (insertObjError) throw insertObjError;
      }

      setHasUnsavedChanges(false);

      if (isCreating) {
        navigate(`/training-management/syllabus/${currentSyllabusId}`);
      } else {
        await loadSyllabus();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Image handling functions for mission editor
  const handleMissionImageSelect = (file: File, imageIndex: number) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;

        const newImages = [...missionImages];
        const newPreviews = [...missionImagePreviews];
        newImages[imageIndex] = file;
        newPreviews[imageIndex] = result;
        setMissionImages(newImages);
        setMissionImagePreviews(newPreviews);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMissionImageDragOver = (e: React.DragEvent, imageIndex: number) => {
    e.preventDefault();
    const newStates = [...missionImageDragStates];
    newStates[imageIndex] = true;
    setMissionImageDragStates(newStates);
  };

  const handleMissionImageDragLeave = (e: React.DragEvent, imageIndex: number) => {
    e.preventDefault();
    const newStates = [...missionImageDragStates];
    newStates[imageIndex] = false;
    setMissionImageDragStates(newStates);
  };

  const handleMissionImageDrop = (e: React.DragEvent, imageIndex: number) => {
    e.preventDefault();
    const newStates = [...missionImageDragStates];
    newStates[imageIndex] = false;
    setMissionImageDragStates(newStates);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleMissionImageSelect(files[0], imageIndex);
    }
  };

  const handleMissionImageFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, imageIndex: number) => {
    const file = e.target.files?.[0];
    if (file) {
      handleMissionImageSelect(file, imageIndex);
    }
  };

  const removeMissionImage = (imageIndex: number) => {
    const newImages = [...missionImages];
    const newPreviews = [...missionImagePreviews];
    newImages[imageIndex] = null;
    newPreviews[imageIndex] = null;
    setMissionImages(newImages);
    setMissionImagePreviews(newPreviews);
  };

  const handleAddMission = () => {
    setEditingMission({
      index: -1,
      mission: {
        mission_number: null,
        mission_name: '',
        description: '',
        week_number: missions.length > 0 ? Math.max(...missions.map(m => m.week_number)) + 1 : 0,
        objectives: [],
        reference_materials: [],
        image_url: null
      }
    });
    // Reset image state
    setMissionImages([null, null, null, null]);
    setMissionImagePreviews([null, null, null, null]);
    setMissionImageDragStates([false, false, false, false]);
    setMissionDialogTab('details');
    setShowEventDialog(true);
  };

  const handleEditMission = (index: number) => {
    const mission = missions[index];
    setEditingMission({
      index,
      mission: { ...mission }
    });

    // Load existing images
    const newPreviews: (string | null)[] = [null, null, null, null];
    if (mission.image_url) {
      if (mission.image_url.headerImage) {
        newPreviews[0] = mission.image_url.headerImage;
      }
      if (mission.image_url.additionalImages) {
        mission.image_url.additionalImages.forEach((url, i) => {
          if (i < 3) {
            newPreviews[i + 1] = url;
          }
        });
      }
    }
    setMissionImages([null, null, null, null]);
    setMissionImagePreviews(newPreviews);
    setMissionImageDragStates([false, false, false, false]);
    setMissionDialogTab('details');
    setShowEventDialog(true);
  };

  const handleSaveEvent = async () => {
    if (!editingMission) return;
    if (isCreating) {
      // If creating a new syllabus, just update local state
      const updatedMissions = [...missions];
      if (editingMission.index === -1) {
        updatedMissions.push(editingMission.mission);
      } else {
        updatedMissions[editingMission.index] = editingMission.mission;
      }
      setMissions(updatedMissions);
      setHasUnsavedChanges(true);
      setShowEventDialog(false);
      setEditingMission(null);
      return;
    }

    // For existing syllabus, save to database immediately
    setSaving(true);
    try {
      const mission = editingMission.mission;
      const missionIndex = editingMission.index;
      const startWeek = syllabus.starts_at_week_zero ? 0 : 1;

      if (missionIndex === -1) {
        // Insert new mission first without images
        const missionData = {
          syllabus_id: syllabusId,
          mission_number: mission.mission_number,
          mission_name: mission.mission_name,
          description: mission.description,
          week_number: startWeek + missions.length,
          reference_materials: mission.reference_materials || []
        };

        const { data: newMission, error: insertError } = await supabase
          .from('training_syllabus_missions')
          .insert(missionData)
          .select()
          .single();

        if (insertError) throw insertError;

        // Now upload images using the actual mission ID
        const imagesToUpload = missionImages.filter(img => img !== null) as File[];
        if (imagesToUpload.length > 0 && newMission.id) {
          let imageUrlData: { headerImage?: string; additionalImages?: string[] } = {};
          
          const uploadPromises = missionImages.map((img, idx) => {
            if (img) {
              return uploadEventImage(newMission.id, img).then(result => ({ index: idx, url: result.url }));
            }
            return Promise.resolve(null);
          });

          const results = await Promise.all(uploadPromises);
          const uploadedUrls = results
            .filter(r => r !== null && r!.url)
            .map(r => ({ index: r!.index, url: r!.url! }));

          if (uploadedUrls.length > 0) {
            const firstImage = uploadedUrls.find(u => u.index === 0);
            if (firstImage?.url) {
              imageUrlData.headerImage = firstImage.url;
            }
            const additionalUrls = uploadedUrls
              .filter(u => u.index > 0)
              .map(u => u.url);
            if (additionalUrls.length > 0) {
              imageUrlData.additionalImages = additionalUrls;
            }

            // Update mission with image URLs
            const { error: updateError } = await supabase
              .from('training_syllabus_missions')
              .update({ image_url: imageUrlData })
              .eq('id', newMission.id);

            if (updateError) throw updateError;
          }
        }

        // Insert objectives for new mission
        if (mission.objectives.length > 0) {
          const objectivesData = mission.objectives.map((obj, idx) => ({
            syllabus_mission_id: newMission.id,
            scope_level: obj.scope_level,
            objective_text: obj.objective_text,
            display_order: idx
          }));

          const { error: objError } = await supabase
            .from('syllabus_training_objectives')
            .insert(objectivesData);

          if (objError) throw objError;
        }

        // Reload syllabus to get fresh data
        await loadSyllabus();
      } else {
        // Update existing mission
        let imageUrlData: { headerImage?: string; additionalImages?: string[] } | null = null;

        // Upload images first if any new ones exist
        const imagesToUpload = missionImages.filter(img => img !== null) as File[];
        const existingPreviews = missionImagePreviews.filter(p => p !== null && typeof p === 'string');

        if (imagesToUpload.length > 0 || existingPreviews.length > 0) {
          const uploadPromises = missionImages.map((img, idx) => {
            if (img) {
              // New file to upload
              return uploadEventImage(mission.id!, img).then(result => ({ index: idx, url: result.url }));
            } else if (missionImagePreviews[idx]) {
              // Existing URL to keep
              return Promise.resolve({ index: idx, url: missionImagePreviews[idx] });
            }
            return Promise.resolve(null);
          });

          const results = await Promise.all(uploadPromises);
          const imageUrls = results
            .filter(r => r !== null && r!.url)
            .map(r => ({ index: r!.index, url: r!.url! }));

          if (imageUrls.length > 0) {
            imageUrlData = {};
            const firstImage = imageUrls.find(u => u.index === 0);
            if (firstImage?.url) {
              imageUrlData.headerImage = firstImage.url;
            }
            const additionalUrls = imageUrls
              .filter(u => u.index > 0)
              .map(u => u.url);
            if (additionalUrls.length > 0) {
              imageUrlData.additionalImages = additionalUrls;
            }
          }
        }

        const missionData = {
          mission_number: mission.mission_number,
          mission_name: mission.mission_name,
          description: mission.description,
          reference_materials: mission.reference_materials || [],
          image_url: imageUrlData
        };

        const { error: updateError } = await supabase
          .from('training_syllabus_missions')
          .update(missionData)
          .eq('id', mission.id);

        if (updateError) throw updateError;

        // Delete objectives that were removed from the UI
        const remainingObjectiveIds = mission.objectives.filter(obj => obj.id).map(obj => obj.id);
        const { data: existingObjectives } = await supabase
          .from('syllabus_training_objectives')
          .select('id')
          .eq('syllabus_mission_id', mission.id);

        if (existingObjectives && existingObjectives.length > 0) {
          const idsToDelete = existingObjectives
            .map(o => o.id)
            .filter(id => !remainingObjectiveIds.includes(id));

          if (idsToDelete.length > 0) {
            const { error: deleteError } = await supabase
              .from('syllabus_training_objectives')
              .delete()
              .in('id', idsToDelete);

            if (deleteError) throw deleteError;
          }
        }

        const objectivesToUpdate = mission.objectives.filter(obj => obj.id);
        const objectivesToInsert = mission.objectives.filter(obj => !obj.id);

        if (objectivesToUpdate.length > 0) {
          for (const obj of objectivesToUpdate) {
            const { error } = await supabase
              .from('syllabus_training_objectives')
              .update({
                scope_level: obj.scope_level,
                objective_text: obj.objective_text,
                display_order: mission.objectives.findIndex(o => o.id === obj.id)
              })
              .eq('id', obj.id);
            if (error) throw error;
          }
        }

        if (objectivesToInsert.length > 0) {
          const insertData = objectivesToInsert.map(obj => ({
            syllabus_mission_id: mission.id,
            scope_level: obj.scope_level,
            objective_text: obj.objective_text,
            display_order: mission.objectives.indexOf(obj)
          }));

          const { error } = await supabase
            .from('syllabus_training_objectives')
            .insert(insertData);

          if (error) throw error;
        }

        // Reload syllabus to get fresh data
        await loadSyllabus();
      }

      setShowEventDialog(false);
      setEditingMission(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEvent = () => {
    setShowEventDialog(false);
    setEditingMission(null);
  };

  // Handlers for criteria block changes
  const handleStudentEnrollmentRulesChange = (blocks: CriteriaBlock[]) => {
    setSyllabus({ ...syllabus, auto_enrollment_rules: blocks });
    setHasUnsavedChanges(true);
  };

  const handleInstructorQualificationRulesChange = (blocks: CriteriaBlock[]) => {
    setSyllabus({ ...syllabus, instructor_qualification_rules: blocks });
    setHasUnsavedChanges(true);
  };

  const handleDeleteClick = (index: number) => {
    setDeleteConfirmIndex(index);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmIndex === null) return;

    const index = deleteConfirmIndex;
    const mission = missions[index];

    if (mission.id && !isCreating) {
      try {
        const { error } = await supabase
          .from('training_syllabus_missions')
          .delete()
          .eq('id', mission.id);

        if (error) throw error;
      } catch (err: any) {
        setError(err.message);
        setDeleteConfirmIndex(null);
        return;
      }
    }

    setMissions(missions.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
    setDeleteConfirmIndex(null);
  };

  const handleCancelDelete = () => {
    setDeleteConfirmIndex(null);
  };

  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      if (onBack) {
        onBack();
      } else {
        navigate('/training-management');
      }
    }
  };

  const handleConfirmLeave = () => {
    setShowUnsavedWarning(false);
    if (onBack) {
      onBack();
    } else {
      navigate('/training-management');
    }
  };

  const handleCancelLeave = () => {
    setShowUnsavedWarning(false);
  };

  const handleAddObjective = (missionIndex: number) => {
    const updatedMissions = [...missions];
    updatedMissions[missionIndex].objectives.push({
      scope_level: 'Individual',
      objective_text: '',
      display_order: updatedMissions[missionIndex].objectives.length
    });
    setMissions(updatedMissions);
  };

  const handleDeleteObjective = async (missionIndex: number, objectiveIndex: number) => {
    const objective = missions[missionIndex].objectives[objectiveIndex];
    if (objective.id && !isCreating) {
      if (!confirm('Delete this objective?')) return;

      try {
        const { error } = await supabase
          .from('syllabus_training_objectives')
          .delete()
          .eq('id', objective.id);

        if (error) throw error;
      } catch (err: any) {
        setError(err.message);
        return;
      }
    }

    const updatedMissions = [...missions];
    updatedMissions[missionIndex].objectives = updatedMissions[missionIndex].objectives.filter((_, i) => i !== objectiveIndex);
    setMissions(updatedMissions);
  };


  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div>Loading syllabus...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button
            onClick={handleBackClick}
            style={{
              padding: '8px',
              backgroundColor: 'white',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px' }}>
              {isCreating ? 'NEW SYLLABUS' : 'EDIT SYLLABUS'}
            </h1>
            <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
              Configure training syllabus, missions, and objectives
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 16px',
              backgroundColor: saving ? '#9CA3AF' : '#2563EB',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0
            }}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Syllabus'}
          </button>
        </div>

      {error && (
        <div style={{ padding: '12px', backgroundColor: '#FEE2E2', border: '1px solid #EF4444', borderRadius: '6px', marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {/* Syllabus Details */}
      <div style={{ padding: '24px', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '20px', color: '#6B7280', textTransform: 'uppercase' }}>
          Syllabus Details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
              Name *
            </label>
            <input
              type="text"
              value={syllabus.name}
              onChange={(e) => {
                setSyllabus({ ...syllabus, name: e.target.value });
                setHasUnsavedChanges(true);
              }}
              placeholder="e.g., F/A-18C BFM Syllabus"
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
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
              Description
            </label>
            <textarea
              value={syllabus.description}
              onChange={(e) => {
                setSyllabus({ ...syllabus, description: e.target.value });
                setHasUnsavedChanges(true);
              }}
              placeholder="Brief description of training program"
              rows={3}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px',
                resize: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB' }}>
          {(['missions', 'student-enrollment', 'instructor-qualifications', 'issues'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: activeTab === tab ? '#2563EB' : '#6B7280',
                borderBottom: activeTab === tab ? '2px solid #2563EB' : '2px solid transparent',
                marginBottom: '-1px',
                transition: 'color 0.2s, border-color 0.2s'
              }}
            >
              {tab === 'missions' && `Missions (${missions.length})`}
              {tab === 'student-enrollment' && 'Student Enrollment'}
              {tab === 'instructor-qualifications' && 'Instructor Qualifications'}
              {tab === 'issues' && 'Issues'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'student-enrollment' && (
        <div style={{ padding: '24px', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '24px' }}>
          <CriteriaBlockEditor
            blocks={syllabus.auto_enrollment_rules}
            onChange={handleStudentEnrollmentRulesChange}
            standings={standings}
            statuses={statuses}
            qualifications={qualifications}
            title="Student Auto-Enrollment Rules"
            description="Define criteria to automatically suggest students for enrollment when creating training cycles. Criteria within a block use AND logic. Multiple blocks use OR logic. Rules are suggestions only and require confirmation."
            blockLabel="Student Criteria Block"
            addBlockLabel="Add Student Criteria Block"
          />
        </div>
      )}

      {activeTab === 'instructor-qualifications' && (
        <div style={{ padding: '24px', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '24px' }}>
          <CriteriaBlockEditor
            blocks={syllabus.instructor_qualification_rules}
            onChange={handleInstructorQualificationRulesChange}
            standings={standings}
            statuses={statuses}
            qualifications={qualifications}
            title="Instructor Qualification Rules"
            description="Define criteria for pilots who are qualified to instruct this syllabus. Criteria within a block use AND logic. Multiple blocks use OR logic. Qualified instructors will be suggested when creating training cycles."
            blockLabel="Instructor Criteria Block"
            addBlockLabel="Add Instructor Criteria Block"
          />
        </div>
      )}

      {activeTab === 'issues' && !isCreating && syllabusId && (
        <div style={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '24px' }}>
          <IssuesTab
            entityType="syllabus"
            entityId={syllabusId}
            entityName={syllabus.name}
          />
        </div>
      )}

      {activeTab === 'issues' && isCreating && (
        <div style={{ padding: '40px 24px', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', color: '#6B7280' }}>
          <p style={{ margin: 0, fontSize: '14px' }}>Save the syllabus first to add issues.</p>
        </div>
      )}

      {/* Events - only show when Missions tab is active */}
      {activeTab === 'missions' && (
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', margin: 0 }}>
              Events ({missions.length})
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>Starts at:</span>
              <button
                onClick={() => {
                  setSyllabus({ ...syllabus, starts_at_week_zero: !syllabus.starts_at_week_zero });
                  setHasUnsavedChanges(true);
                }}
                style={{
                  position: 'relative',
                  width: '44px',
                  height: '24px',
                  backgroundColor: syllabus.starts_at_week_zero ? '#2563EB' : '#D1D5DB',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  padding: 0
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  left: syllabus.starts_at_week_zero ? '22px' : '2px',
                  width: '20px',
                  height: '20px',
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  transition: 'left 0.2s'
                }} />
              </button>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151', minWidth: '50px' }}>
                Week {syllabus.starts_at_week_zero ? '0' : '1'}
              </span>
            </div>
          </div>
          <button
            onClick={handleAddMission}
            style={{
              padding: '8px 12px',
              backgroundColor: '#2563EB',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={14} />
            Add Event
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {missions.map((mission, missionIndex) => {
            const calculatedWeek = (syllabus.starts_at_week_zero ? 0 : 1) + missionIndex;
            return (
              <div
                key={missionIndex}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', missionIndex.toString());
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                  if (draggedIndex !== missionIndex) {
                    const updatedMissions = [...missions];
                    const [draggedItem] = updatedMissions.splice(draggedIndex, 1);
                    updatedMissions.splice(missionIndex, 0, draggedItem);
                    setMissions(updatedMissions);
                    setHasUnsavedChanges(true);
                  }
                }}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'grab'
                }}
              >
                <GripVertical size={16} style={{ color: '#9CA3AF', cursor: 'grab' }} />
                
                {/* Thumbnail */}
                <div style={{
                  width: '48px',
                  height: '27px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  backgroundColor: '#F3F4F6',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {mission.image_url?.headerImage ? (
                    <img 
                      src={mission.image_url.headerImage} 
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                    />
                  ) : (
                    <ImageIcon size={12} style={{ color: '#D1D5DB' }} />
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {mission.mission_number !== null && (
                      <span style={{ color: '#4B5563' }}>
                        H{String(mission.mission_number).padStart(2, '0')}
                      </span>
                    )}
                    <span>{mission.mission_name || '(Unnamed Event)'}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>
                    Week {calculatedWeek} • {mission.objectives.length} objectives
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditMission(missionIndex);
                  }}
                  style={{
                    padding: '6px',
                    backgroundColor: 'white',
                    border: '1px solid #D1D5DB',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: '#2563EB'
                  }}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(missionIndex);
                  }}
                  style={{
                    padding: '6px',
                    backgroundColor: 'white',
                    border: '1px solid #D1D5DB',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: '#EF4444'
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}

          {missions.length === 0 && (
            <div style={{ padding: '48px', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', textAlign: 'center' }}>
              <p style={{ color: '#6B7280', marginBottom: '16px' }}>No events yet</p>
              <button
                onClick={handleAddMission}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#2563EB',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Plus size={14} />
                Add Your First Event
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Event Dialog Modal */}
      {showEventDialog && editingMission && (
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
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ padding: '24px', borderBottom: '1px solid #E5E7EB' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                {editingMission.index === -1 ? 'Add Event' : 'Edit Event'}
              </h2>
            </div>

            {/* Tab Navigation */}
            <div style={{ borderBottom: '1px solid #E5E7EB', display: 'flex', paddingLeft: '24px' }}>
              {[
                { id: 'details', label: 'Details' },
                { id: 'objectives', label: 'Objectives' },
                { id: 'references', label: 'Reference Materials' },
                ...(editingMission.mission.id ? [{ id: 'issues', label: 'Issues' }] : [])
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setMissionDialogTab(tab.id as typeof missionDialogTab)}
                  style={{
                    padding: '12px 16px',
                    fontSize: '14px',
                    fontWeight: 500,
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: missionDialogTab === tab.id ? '#2563EB' : '#6B7280',
                    borderBottom: missionDialogTab === tab.id ? '2px solid #2563EB' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ padding: '24px' }}>
              {/* Details Tab */}
              {missionDialogTab === 'details' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                        Mission Number
                      </label>
                      <input
                        type="number"
                        value={editingMission.mission.mission_number ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEditingMission({
                            ...editingMission,
                            mission: {
                              ...editingMission.mission,
                              mission_number: value === '' ? null : parseInt(value) || null
                            }
                          });
                        }}
                        min="1"
                        placeholder="Optional"
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
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                        Event Name
                      </label>
                      <input
                        type="text"
                        value={editingMission.mission.mission_name}
                        onChange={(e) => {
                          setEditingMission({
                            ...editingMission,
                            mission: {
                              ...editingMission.mission,
                              mission_name: e.target.value
                            }
                          });
                        }}
                        placeholder="Event name"
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
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                      Description
                    </label>
                    <textarea
                      value={editingMission.mission.description || ''}
                      onChange={(e) => {
                        setEditingMission({
                          ...editingMission,
                          mission: {
                            ...editingMission.mission,
                            description: e.target.value
                          }
                        });
                      }}
                      placeholder="Event description"
                      rows={6}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '14px',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Image Upload Section */}
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                      Images (up to 4)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                      {[0, 1, 2, 3].map((imageIndex) => (
                        <div
                          key={imageIndex}
                          onDragOver={(e) => handleMissionImageDragOver(e, imageIndex)}
                          onDragLeave={(e) => handleMissionImageDragLeave(e, imageIndex)}
                          onDrop={(e) => handleMissionImageDrop(e, imageIndex)}
                          style={{
                            position: 'relative',
                            border: missionImageDragStates[imageIndex] ? '2px dashed #2563EB' : '2px dashed #D1D5DB',
                            borderRadius: '8px',
                            aspectRatio: '16/9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: missionImagePreviews[imageIndex] ? 'transparent' : '#F9FAFB',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            transition: 'all 0.2s'
                          }}
                        >
                          {missionImagePreviews[imageIndex] ? (
                            <>
                              <img
                                src={missionImagePreviews[imageIndex]!}
                                alt={`Preview ${imageIndex + 1}`}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover'
                                }}
                              />
                              <button
                                onClick={() => removeMissionImage(imageIndex)}
                                style={{
                                  position: 'absolute',
                                  top: '6px',
                                  right: '6px',
                                  padding: '4px',
                                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleMissionImageFileInputChange(e, imageIndex)}
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  opacity: 0,
                                  cursor: 'pointer'
                                }}
                              />
                              <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
                                <ImageIcon size={24} style={{ color: '#9CA3AF', marginBottom: '8px' }} />
                                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                  {imageIndex === 0 ? 'Header' : `Image ${imageIndex + 1}`}
                                </div>
                                <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
                                  Click or drag
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Objectives Tab */}
              {missionDialogTab === 'objectives' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', margin: 0 }}>
                      Objectives ({editingMission.mission.objectives.length})
                    </h3>
                    <button
                      onClick={() => {
                        setEditingMission({
                          ...editingMission,
                          mission: {
                            ...editingMission.mission,
                            objectives: [
                              ...editingMission.mission.objectives,
                              {
                                scope_level: 'Individual',
                                objective_text: '',
                                display_order: editingMission.mission.objectives.length
                              }
                            ]
                          }
                        });
                      }}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #D1D5DB',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={14} />
                      Add Objective
                    </button>
                  </div>

                  {editingMission.mission.objectives.map((objective, objIndex) => (
                    <div key={objIndex} style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px', marginBottom: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: '8px', alignItems: 'start' }}>
                        <select
                          value={objective.scope_level}
                          onChange={(e) => {
                            const updatedObjectives = [...editingMission.mission.objectives];
                            updatedObjectives[objIndex].scope_level = e.target.value;
                            setEditingMission({
                              ...editingMission,
                              mission: {
                                ...editingMission.mission,
                                objectives: updatedObjectives
                              }
                            });
                          }}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '4px',
                            fontSize: '13px',
                            backgroundColor: 'white'
                          }}
                        >
                          <option value="Individual">Individual</option>
                          <option value="Element">Element</option>
                          <option value="Flight">Flight</option>
                          <option value="Mission">Mission</option>
                        </select>
                        <input
                          type="text"
                          value={objective.objective_text}
                          onChange={(e) => {
                            const updatedObjectives = [...editingMission.mission.objectives];
                            updatedObjectives[objIndex].objective_text = e.target.value;
                            setEditingMission({
                              ...editingMission,
                              mission: {
                                ...editingMission.mission,
                                objectives: updatedObjectives
                              }
                            });
                          }}
                          placeholder="Objective description"
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '4px',
                            fontSize: '13px',
                            backgroundColor: 'white'
                          }}
                        />
                        <button
                          onClick={() => {
                            const updatedObjectives = editingMission.mission.objectives.filter((_, i) => i !== objIndex);
                            setEditingMission({
                              ...editingMission,
                              mission: {
                                ...editingMission.mission,
                                objectives: updatedObjectives
                              }
                            });
                          }}
                          style={{
                            padding: '6px',
                            backgroundColor: 'white',
                            border: '1px solid #D1D5DB',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            color: '#EF4444'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {editingMission.mission.objectives.length === 0 && (
                    <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>
                      No objectives yet. Click "Add Objective" to create one.
                    </div>
                  )}
                </div>
              )}

              {/* Reference Materials Tab */}
              {missionDialogTab === 'references' && (
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: '12px' }}>
                    Reference Materials
                  </h3>
                  <ReferenceMaterialsInput
                    value={editingMission.mission.reference_materials || []}
                    onChange={(materials) => {
                      setEditingMission({
                        ...editingMission,
                        mission: {
                          ...editingMission.mission,
                          reference_materials: materials
                        }
                      });
                    }}
                  />
                </div>
              )}

              {/* Issues Tab */}
              {missionDialogTab === 'issues' && editingMission.mission.id && (
                <div style={{ margin: '-24px', marginBottom: '-24px' }}>
                  <IssuesTab
                    entityType="syllabus_mission"
                    entityId={editingMission.mission.id}
                    entityName={editingMission.mission.mission_name}
                  />
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={handleCancelEvent}
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
                onClick={handleSaveEvent}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2563EB',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Save Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Warning Dialog */}
      {showUnsavedWarning && (
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
          zIndex: 1001
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
                Unsaved Changes
              </h2>
              <p style={{ color: '#6B7280', fontSize: '14px', marginTop: '8px', marginBottom: 0 }}>
                You have unsaved changes that will be lost if you leave this page. Are you sure you want to continue?
              </p>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={handleCancelLeave}
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
                Stay on Page
              </button>
              <button
                onClick={handleConfirmLeave}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#EF4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Leave Without Saving
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmIndex !== null && (
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
                Delete Event
              </h2>
              <p style={{ color: '#6B7280', fontSize: '14px', marginTop: '8px', marginBottom: 0 }}>
                Are you sure you want to delete this event and all its objectives? This action cannot be undone.
              </p>
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
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#EF4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Delete Event
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default SyllabusEditor;
