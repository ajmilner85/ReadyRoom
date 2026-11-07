// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabaseClient';
import { Button, Chip, Dialog, EmptyState, Field, FieldLabel, Icon, IconButton, SectionCard, Select, Tabs, TextInput, Textarea, Toast, Toggle } from '../ui/primitives';
import type { Tone } from '../ui/primitives';
import ReferenceMaterialsInput from '../ui/events/ReferenceMaterialsInput';
import CriteriaBlockEditor, { CriteriaBlock } from './CriteriaBlockEditor';
import type { ReferenceMaterial } from '../../types/EventTypes';
import { uploadEventImage } from '../../utils/eventImageService';
import { IssuesTab } from '../issues';
import OutcomesTab from './OutcomesTab';
import type { GraduationOutcome } from '../../types/TrainingTypes';

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
  /** Rendered inside the Syllabus Management pane (no back button / page frame). */
  embedded?: boolean;
  /** Reports unsaved-change state so the host can guard switching syllabi. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called after a new syllabus is first saved (instead of navigating to its route). */
  onSaved?: (id: string) => void;
  /** Shows a delete action in the header. */
  onDelete?: () => void;
}

const PANE = 'flex-1 min-w-0 min-h-0 flex flex-col bg-panel border border-border rounded-rr-xl shadow-rr overflow-hidden';

const KIND_META = {
  linear: { label: 'Linear syllabus', short: 'Linear', tone: 'info' as Tone, desc: 'Ordered weekly progression (Initial Training / PTR)' },
  pool: { label: 'Lesson pool', short: 'Pool', tone: 'accent' as Tone, desc: 'Flat, unordered lesson library' },
  module: { label: 'Module', short: 'Module', tone: 'purple' as Tone, desc: 'Reusable multi-lesson collection' },
  advanced_qualification: { label: 'Advanced qualification', short: 'Adv qual', tone: 'warn' as Tone, desc: 'Lessons for a specific advanced qualification (e.g. JTAC)' },
};

const SyllabusEditor: React.FC<SyllabusEditorProps> = ({ syllabusId: propSyllabusId, onBack, embedded = false, onDirtyChange, onSaved, onDelete }) => {
  const { syllabusId: paramSyllabusId } = useParams<{ syllabusId: string }>();
  const navigate = useNavigate();
  const syllabusId = propSyllabusId || paramSyllabusId;
  const isCreating = syllabusId === 'new';

  const [syllabus, setSyllabus] = useState({
    name: '',
    description: '',
    kind: 'linear', // 'linear' | 'pool' | 'module' - pools/modules have no week progression
    starts_at_week_zero: false,
    auto_enrollment_rules: [] as CriteriaBlock[],
    instructor_qualification_rules: [] as CriteriaBlock[],
    graduation_outcomes: [] as GraduationOutcome[]
  });

  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(!isCreating);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMission, setEditingMission] = useState<{ index: number; mission: Mission } | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  useEffect(() => { onDirtyChange?.(hasUnsavedChanges); }, [hasUnsavedChanges]);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  // Tab state for the syllabus editor
  const [activeTab, setActiveTab] = useState<'details' | 'missions' | 'student-enrollment' | 'instructor-qualifications' | 'outcomes' | 'issues'>(isCreating ? 'details' : 'missions');
  // A different syllabus opens on its missions (new ones on Details)
  useEffect(() => { setActiveTab(isCreating ? 'details' : 'missions'); }, [syllabusId]);

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
        kind: syllabusData.kind || 'linear',
        starts_at_week_zero: syllabusData.starts_at_week_zero || false,
        auto_enrollment_rules: convertToBlockFormat(syllabusData.auto_enrollment_rules),
        instructor_qualification_rules: convertToBlockFormat(syllabusData.instructor_qualification_rules),
        graduation_outcomes: Array.isArray(syllabusData.graduation_outcomes) ? syllabusData.graduation_outcomes : []
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
            kind: syllabus.kind,
            starts_at_week_zero: syllabus.starts_at_week_zero,
            auto_enrollment_rules: syllabus.auto_enrollment_rules,
            instructor_qualification_rules: syllabus.instructor_qualification_rules,
            graduation_outcomes: syllabus.graduation_outcomes
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
            kind: syllabus.kind,
            starts_at_week_zero: syllabus.starts_at_week_zero,
            auto_enrollment_rules: syllabus.auto_enrollment_rules,
            instructor_qualification_rules: syllabus.instructor_qualification_rules,
            graduation_outcomes: syllabus.graduation_outcomes
          })
          .eq('id', syllabusId);

        if (updateError) throw updateError;
      }

      // Save missions with calculated week numbers based on order.
      // Pools and modules have no week progression - week_number stays null.
      const isLinear = syllabus.kind === 'linear';
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
          week_number: isLinear ? startWeek + index : null,
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
        if (onSaved) onSaved(currentSyllabusId);
        else navigate(`/training-management/syllabus/${currentSyllabusId}`);
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
        // Insert new mission first without images (pools/modules have no weeks)
        const missionData = {
          syllabus_id: syllabusId,
          mission_number: mission.mission_number,
          mission_name: mission.mission_name,
          description: mission.description,
          week_number: syllabus.kind === 'linear' ? startWeek + missions.length : null,
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
      <div className={embedded ? PANE : 'flex-1 flex items-center justify-center p-10'}>
        <div className="flex-1 flex items-center justify-center p-10 text-[13px] text-text2">Loading syllabus…</div>
      </div>
    );
  }

  const kind = (syllabus.kind || 'linear') as keyof typeof KIND_META;
  const meta = KIND_META[kind] || KIND_META.linear;
  const isLinear = kind === 'linear';
  const objectiveCount = missions.reduce((n, m) => n + (m.objectives?.length || 0), 0);
  const mark = () => setHasUnsavedChanges(true);

  // Mission dialog field updater (immutable)
  const patchMission = (patch: Partial<Mission>) =>
    editingMission && setEditingMission({ ...editingMission, mission: { ...editingMission.mission, ...patch } });
  const patchObjective = (i: number, patch: Partial<Objective>) =>
    editingMission && patchMission({ objectives: editingMission.mission.objectives.map((o, k) => (k === i ? { ...o, ...patch } : o)) });

  const tabs = [
    { value: 'details' as const, label: 'Details' },
    { value: 'missions' as const, label: isLinear ? 'Missions' : 'Lessons', badge: <span className="font-mono text-[10.5px] text-text3">{missions.length}</span> },
    { value: 'student-enrollment' as const, label: 'Student enrollment', badge: syllabus.auto_enrollment_rules.length ? <span className="font-mono text-[10.5px] text-text3">{syllabus.auto_enrollment_rules.length}</span> : undefined },
    { value: 'instructor-qualifications' as const, label: 'Instructor qualifications', badge: syllabus.instructor_qualification_rules.length ? <span className="font-mono text-[10.5px] text-text3">{syllabus.instructor_qualification_rules.length}</span> : undefined },
    { value: 'outcomes' as const, label: 'Outcomes', badge: (syllabus.graduation_outcomes || []).filter((o: any) => o.enabled).length ? <span className="font-mono text-[10.5px] text-text3">{(syllabus.graduation_outcomes || []).filter((o: any) => o.enabled).length}</span> : undefined },
    { value: 'issues' as const, label: 'Issues' },
  ];

  const renderImageSlot = (imageIndex: number) => {
    const preview = missionImagePreviews[imageIndex];
    return (
      <div key={imageIndex} className="flex flex-col gap-[5px]">
        <div
          onDragOver={(e) => handleMissionImageDragOver(e, imageIndex)}
          onDragLeave={(e) => handleMissionImageDragLeave(e, imageIndex)}
          onDrop={(e) => handleMissionImageDrop(e, imageIndex)}
          className={`relative rounded-rr-lg overflow-hidden flex items-center justify-center transition-colors ${preview ? 'border border-border' : `border border-dashed ${missionImageDragStates[imageIndex] ? 'border-accent bg-accent-weak' : 'border-border2 bg-panel2 hover:border-accent'}`}`}
          style={{ aspectRatio: '16 / 9' }}
        >
          {preview ? (
            <>
              <img src={preview} alt={`Image ${imageIndex + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeMissionImage(imageIndex)}
                aria-label="Remove image"
                className="absolute top-[6px] right-[6px] w-7 h-7 rounded-full flex items-center justify-center border-0 cursor-pointer text-white bg-black/55 hover:bg-black/75"
              >
                <Icon name="close" size={13} />
              </button>
            </>
          ) : (
            <>
              <input type="file" accept="image/*" onChange={(e) => handleMissionImageFileInputChange(e, imageIndex)} className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="text-center pointer-events-none text-text3">
                <Icon name="image" size={20} />
                <div className="text-[11.5px] mt-1">Drop or click</div>
              </div>
            </>
          )}
        </div>
        <div className="text-[11.5px] text-text2">{imageIndex === 0 ? 'Header image' : `Image ${imageIndex + 1}`}</div>
      </div>
    );
  };

  const pane = (
    <div className={PANE}>
      {/* Header */}
      <div className="flex-none flex items-center gap-3 px-4 pt-3 pb-2 flex-wrap">
        {!embedded ? <IconButton icon="arrowLeft" size={32} iconSize={16} variant="outline" label="Back to syllabi" onClick={handleBackClick} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[17px] font-semibold truncate">{syllabus.name || (isCreating ? 'New syllabus' : 'Untitled syllabus')}</span>
            <Chip tone={meta.tone} size="sm">{meta.short}</Chip>
          </div>
          <div className="text-[12px] text-text2 truncate">
            {missions.length} {isLinear ? (missions.length === 1 ? 'mission' : 'missions') : (missions.length === 1 ? 'lesson' : 'lessons')} · {objectiveCount} objectives
            {isLinear && missions.length ? ` · weeks ${syllabus.starts_at_week_zero ? 0 : 1}–${(syllabus.starts_at_week_zero ? 0 : 1) + missions.length - 1}` : ''}
          </div>
        </div>
        <span className="flex items-center gap-[6px] text-[12px] text-text2">
          <span className="w-[7px] h-[7px] rounded-full" style={hasUnsavedChanges || isCreating ? { background: 'var(--rr-warn)' } : { boxShadow: 'inset 0 0 0 1.5px var(--rr-text3)' }} />
          {isCreating ? 'Not saved yet' : hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}
        </span>
        {onDelete && !isCreating ? (
          <IconButton icon="trash" size={32} iconSize={14} label="Delete syllabus" className="hover:!text-bad" onClick={onDelete} />
        ) : null}
        <Button variant="primary" icon="save" onClick={handleSave} loading={saving} disabled={saving}>
          {isCreating ? 'Create syllabus' : 'Save'}
        </Button>
      </div>
      <Tabs variant="inline" value={activeTab} onChange={setActiveTab} items={tabs} className="flex-none px-[6px]" />

      {error ? (
        <div className="flex-none px-4 pt-3"><Toast tone="bad" onDismiss={() => setError(null)}>{error}</Toast></div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {activeTab === 'details' && (
          <div className="flex flex-col gap-[14px] max-w-[860px]">
            <SectionCard title="Syllabus">
              <div className="flex flex-col gap-[14px] p-[14px]">
                <Field label="Type" hint={isLinear ? undefined : 'Lessons of this type have no week numbers and do not appear in the PTR grid. They are selectable as event activities.'}>
                  <Select
                    value={kind}
                    onChange={(v) => { setSyllabus({ ...syllabus, kind: v }); mark(); }}
                    options={(Object.keys(KIND_META) as Array<keyof typeof KIND_META>).map(k => ({ value: k, label: KIND_META[k].label, description: KIND_META[k].desc }))}
                  />
                </Field>
                <Field label="Name" required>
                  <TextInput value={syllabus.name} placeholder="e.g. F/A-18C BFM Syllabus" onChange={(e) => { setSyllabus({ ...syllabus, name: e.target.value }); mark(); }} />
                </Field>
                <Field label="Description">
                  <Textarea rows={4} value={syllabus.description} placeholder="Brief description of the training program" onChange={(e) => { setSyllabus({ ...syllabus, description: e.target.value }); mark(); }} />
                </Field>
              </div>
            </SectionCard>
            {isLinear ? (
              <SectionCard title="Week numbering">
                <label className="flex items-center gap-3 px-[14px] py-[12px] cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-text">Start at week 0</div>
                    <div className="text-[12px] text-text2">The first mission is week {syllabus.starts_at_week_zero ? '0' : '1'}; weeks follow the mission order.</div>
                  </div>
                  <Toggle checked={Boolean(syllabus.starts_at_week_zero)} onChange={() => { setSyllabus({ ...syllabus, starts_at_week_zero: !syllabus.starts_at_week_zero }); mark(); }} />
                </label>
              </SectionCard>
            ) : null}
          </div>
        )}

        {activeTab === 'missions' && (
          <SectionCard
            title={isLinear ? 'Missions' : 'Lessons'}
            count={missions.length}
            action={<Button size="sm" variant="secondary" icon="plus" onClick={handleAddMission}>{isLinear ? 'Add mission' : 'Add lesson'}</Button>}
            footer={missions.length > 1 ? (isLinear ? 'Drag to reorder; week numbers follow the order.' : 'Drag to reorder.') : undefined}
          >
            {missions.length === 0 ? (
              <EmptyState icon="training" title={isLinear ? 'No missions yet' : 'No lessons yet'} message={isLinear ? 'Add the missions of this syllabus in the order they are flown.' : 'Add the lessons in this library.'} action={{ label: isLinear ? 'Add mission' : 'Add lesson', onClick: handleAddMission }} />
            ) : (
              <div className="divide-y divide-border">
                {missions.map((mission, missionIndex) => {
                  const week = (syllabus.starts_at_week_zero ? 0 : 1) + missionIndex;
                  const refs = mission.reference_materials?.length || 0;
                  return (
                    <div
                      key={missionIndex}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', missionIndex.toString()); }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                        if (draggedIndex !== missionIndex) {
                          const updated = [...missions];
                          const [dragged] = updated.splice(draggedIndex, 1);
                          updated.splice(missionIndex, 0, dragged);
                          setMissions(updated);
                          mark();
                        }
                      }}
                      onClick={() => handleEditMission(missionIndex)}
                      className="group flex items-center gap-3 pl-[8px] pr-[10px] min-h-[56px] py-[8px] cursor-pointer hover:bg-panel2 transition-colors"
                    >
                      <span className="text-text3 cursor-grab flex" title="Drag to reorder"><Icon name="grip" size={15} /></span>
                      {isLinear ? (
                        <span className="w-[44px] flex-none text-center font-mono text-[10.5px] font-semibold tracking-[.06em] text-text2 py-[3px] rounded-[5px] bg-panel2 border border-border">WK {week}</span>
                      ) : null}
                      {/* Placeholder sits behind the image; an image that fails to load hides itself */}
                      <div className="relative w-[64px] h-[36px] flex-none rounded-[5px] overflow-hidden bg-panel2 border border-border flex items-center justify-center">
                        <Icon name="image" size={13} style={{ color: 'var(--rr-text3)' }} />
                        {mission.image_url?.headerImage ? (
                          <img
                            src={mission.image_url.headerImage}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 min-w-0">
                          {mission.mission_number !== null && mission.mission_number !== undefined
                            ? <span className="font-mono text-[12px] font-semibold text-text2 flex-none">H{String(mission.mission_number).padStart(2, '0')}</span>
                            : null}
                          <span className="text-[13.5px] font-semibold text-text truncate">{mission.mission_name || '(Unnamed)'}</span>
                        </div>
                        {mission.description ? <div className="text-[12px] text-text2 truncate">{mission.description}</div> : null}
                      </div>
                      <span className="flex items-center gap-[6px] flex-none">
                        <Chip size="sm" tone={mission.objectives.length ? 'neutral' : 'muted'}>{mission.objectives.length} obj</Chip>
                        {refs ? <Chip size="sm" tone="neutral"><Icon name="link" size={10} />{refs}</Chip> : null}
                      </span>
                      <span className="flex items-center gap-[2px] flex-none" onClick={(e) => e.stopPropagation()}>
                        <IconButton icon="edit" size={28} iconSize={13} label="Edit" onClick={() => handleEditMission(missionIndex)} />
                        <IconButton icon="trash" size={28} iconSize={13} label="Delete" className="hover:!text-bad" onClick={() => handleDeleteClick(missionIndex)} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        )}

        {activeTab === 'student-enrollment' && (
          <div className="rounded-rr-lg border border-border bg-panel p-[14px] max-w-[980px]">
            <CriteriaBlockEditor
              blocks={syllabus.auto_enrollment_rules}
              onChange={handleStudentEnrollmentRulesChange}
              standings={standings}
              statuses={statuses}
              qualifications={qualifications}
              title="Student auto-enrollment rules"
              description="Criteria that suggest students for enrollment when a training cycle is created. Criteria within a block must all match (AND); any block can match (OR). Suggestions always need confirmation."
              blockLabel="Student criteria"
              addBlockLabel="Add criteria block"
            />
          </div>
        )}

        {activeTab === 'instructor-qualifications' && (
          <div className="rounded-rr-lg border border-border bg-panel p-[14px] max-w-[980px]">
            <CriteriaBlockEditor
              blocks={syllabus.instructor_qualification_rules}
              onChange={handleInstructorQualificationRulesChange}
              standings={standings}
              statuses={statuses}
              qualifications={qualifications}
              title="Instructor qualification rules"
              description="Criteria for pilots qualified to instruct this syllabus. Criteria within a block must all match (AND); any block can match (OR). Matching instructors are suggested when a training cycle is created."
              blockLabel="Instructor criteria"
              addBlockLabel="Add criteria block"
            />
          </div>
        )}

        {activeTab === 'outcomes' && (
          <div className="rounded-rr-lg border border-border bg-panel p-[14px]">
            <OutcomesTab
              outcomes={syllabus.graduation_outcomes}
              onChange={(outcomes) => { setSyllabus({ ...syllabus, graduation_outcomes: outcomes }); mark(); }}
              maxWeekNumber={missions.length > 0 ? (syllabus.starts_at_week_zero ? missions.length - 1 : missions.length) : 10}
            />
          </div>
        )}

        {activeTab === 'issues' && (
          !isCreating && syllabusId ? (
            <div className="rounded-rr-lg border border-border bg-panel overflow-hidden">
              <IssuesTab entityType="syllabus" entityId={syllabusId} entityName={syllabus.name} />
            </div>
          ) : (
            <div className="rounded-rr-lg border border-border bg-panel">
              <EmptyState compact icon="alertCircle" title="Save first" message="Issues can be added once the syllabus has been created." />
            </div>
          )
        )}
      </div>

      {/* Mission / lesson editor */}
      <Dialog
        open={Boolean(showEventDialog && editingMission)}
        onClose={handleCancelEvent}
        title={editingMission ? `${editingMission.index === -1 ? 'Add' : 'Edit'} ${isLinear ? 'mission' : 'lesson'}` : ''}
        width={820}
        tall
        flush
        footer={
          <>
            <Button variant="secondary" onClick={handleCancelEvent}>Cancel</Button>
            <Button variant="primary" icon="check" onClick={handleSaveEvent}>{editingMission?.index === -1 ? (isLinear ? 'Add mission' : 'Add lesson') : 'Apply'}</Button>
          </>
        }
      >
        {editingMission ? (
          <div className="flex flex-col min-h-full">
            <Tabs
              variant="inline"
              value={missionDialogTab}
              onChange={(v) => setMissionDialogTab(v as typeof missionDialogTab)}
              className="flex-none px-[10px] sticky top-0 bg-panel z-[1]"
              items={[
                { value: 'details', label: 'Details' },
                { value: 'objectives', label: 'Objectives', badge: <span className="font-mono text-[10.5px] text-text3">{editingMission.mission.objectives.length}</span> },
                { value: 'reference-materials', label: 'Reference materials', badge: editingMission.mission.reference_materials?.length ? <span className="font-mono text-[10.5px] text-text3">{editingMission.mission.reference_materials.length}</span> : undefined },
                { value: 'issues', label: 'Issues', hidden: !editingMission.mission.id },
              ]}
            />
            <div className="p-[18px] flex-1">
              {missionDialogTab === 'details' && (
                <div className="flex flex-col gap-[14px]">
                  <div className="grid gap-[14px]" style={{ gridTemplateColumns: '140px minmax(0, 1fr)' }}>
                    <Field label="Hop number" hint="Optional">
                      <TextInput
                        mono
                        type="number"
                        min={1}
                        value={editingMission.mission.mission_number ?? ''}
                        placeholder="e.g. 3"
                        onChange={(e) => patchMission({ mission_number: e.target.value === '' ? null : parseInt(e.target.value) || null })}
                      />
                    </Field>
                    <Field label="Name" required>
                      <TextInput value={editingMission.mission.mission_name} placeholder={isLinear ? 'Mission name' : 'Lesson name'} onChange={(e) => patchMission({ mission_name: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Description">
                    <Textarea rows={6} value={editingMission.mission.description || ''} placeholder="What this mission covers" onChange={(e) => patchMission({ description: e.target.value })} />
                  </Field>
                  <div>
                    <FieldLabel>Images</FieldLabel>
                    <div className="grid gap-[10px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                      {[0, 1, 2, 3].map(renderImageSlot)}
                    </div>
                    <div className="mt-[6px] text-[11.5px] text-text2">16:9 works best. The header image leads; the others follow it.</div>
                  </div>
                </div>
              )}

              {missionDialogTab === 'objectives' && (
                <div className="flex flex-col gap-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] text-text2 flex-1">Each objective is graded in the AAR / grading dialog.</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="plus"
                      onClick={() => patchMission({
                        objectives: [...editingMission.mission.objectives, { scope_level: 'Individual', objective_text: '', display_order: editingMission.mission.objectives.length }],
                      })}
                    >
                      Add objective
                    </Button>
                  </div>
                  {editingMission.mission.objectives.length === 0 ? (
                    <div className="rounded-rr-lg border border-border">
                      <EmptyState compact icon="checkCircle" title="No objectives" message="Add the objectives students are graded against." />
                    </div>
                  ) : (
                    <div className="rounded-rr-lg border border-border divide-y divide-border">
                      {editingMission.mission.objectives.map((objective, objIndex) => (
                        <div key={objIndex} className="flex items-center gap-2 px-[10px] py-[8px]">
                          <span className="w-[22px] flex-none text-center font-mono text-[11px] text-text3">{objIndex + 1}</span>
                          <div className="w-[140px] flex-none">
                            <Select
                              size="sm"
                              value={objective.scope_level}
                              onChange={(v) => patchObjective(objIndex, { scope_level: v })}
                              options={['Individual', 'Element', 'Flight', 'Mission'].map(v => ({ value: v, label: v }))}
                            />
                          </div>
                          <TextInput
                            className="flex-1 min-w-0"
                            value={objective.objective_text}
                            placeholder="Objective"
                            onChange={(e) => patchObjective(objIndex, { objective_text: e.target.value })}
                          />
                          <IconButton
                            icon="trash"
                            size={30}
                            iconSize={13}
                            label="Remove objective"
                            className="hover:!text-bad flex-none"
                            onClick={() => patchMission({ objectives: editingMission.mission.objectives.filter((_, i) => i !== objIndex) })}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {missionDialogTab === 'reference-materials' && (
                <ReferenceMaterialsInput
                  value={editingMission.mission.reference_materials || []}
                  onChange={(materials) => patchMission({ reference_materials: materials })}
                />
              )}

              {missionDialogTab === 'issues' && editingMission.mission.id && (
                <div className="-m-[18px]">
                  <IssuesTab entityType="syllabus_mission" entityId={editingMission.mission.id} entityName={editingMission.mission.mission_name} />
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Dialog>

      {/* Unsaved changes */}
      <Dialog
        open={showUnsavedWarning}
        onClose={handleCancelLeave}
        title="Unsaved changes"
        width={460}
        footer={
          <>
            <Button variant="secondary" onClick={handleCancelLeave}>Stay</Button>
            <Button variant="danger" onClick={handleConfirmLeave}>Leave without saving</Button>
          </>
        }
      >
        <p className="m-0 text-[13px] text-text2 leading-[1.55]">Your changes to this syllabus will be lost if you leave now.</p>
      </Dialog>

      {/* Delete mission / lesson */}
      <Dialog
        open={deleteConfirmIndex !== null}
        onClose={handleCancelDelete}
        title={`Delete ${isLinear ? 'mission' : 'lesson'}`}
        width={460}
        footer={
          <>
            <Button variant="secondary" onClick={handleCancelDelete}>Cancel</Button>
            <Button variant="danger" icon="trash" onClick={handleConfirmDelete}>Delete</Button>
          </>
        }
      >
        <p className="m-0 text-[13px] text-text2 leading-[1.55]">
          Delete <strong className="text-text">{deleteConfirmIndex !== null ? (missions[deleteConfirmIndex]?.mission_name || 'this item') : ''}</strong> and all its objectives? This can't be undone.
        </p>
      </Dialog>
    </div>
  );

  if (embedded) return pane;
  // Standalone route: the same pane on the shared page frame
  return (
    <div className="flex-1 min-h-0 p-[14px] flex flex-col">
      <div className="rr-page flex-1 min-h-0 flex">{pane}</div>
    </div>
  );
};

export default SyllabusEditor;
