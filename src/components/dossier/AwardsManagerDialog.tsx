import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Medal, Plus, Pencil, Trash2, X, Upload, Check } from 'lucide-react';
import { ConfirmationDialog } from '../ui/dialogs/ConfirmationDialog';
import { dossierStyles, formatDossierDate } from './dossierStyles';
import {
  getAllAwards,
  createAward,
  updateAward,
  deleteAward,
  issueAward,
  uploadAwardImage,
  updateIssuance,
  updateIssuanceCertificate,
  revokeAwards,
  getAwardCategories,
  createAwardCategory,
  updateAwardCategory,
  updateAwardCategoryImage,
  deleteAwardCategory,
  awardDisplayImage,
  getDecorationImages,
  ensureRepeatVariantCoverage,
  type Award,
  type AwardCategory,
  type NewAward,
  type AwardDecorationImage
} from '../../utils/awardService';
import {
  emptyEligibilityRules,
  ruleTreeHasConditions,
  type AwardEligibilityRules,
  type AwardDeviceConfig
} from '../../utils/awardRules';
import { generateAwardVariants } from '../../utils/awardImageComposer';
import AwardRuleBuilder from './AwardRuleBuilder';
import AwardDeviceEditor from './AwardDeviceEditor';
import AwardEligibilityPanel from './AwardEligibilityPanel';
import StyledSelect from './StyledSelect';
import { getCycleEvents, type DossierCycle, type DossierEventOption, type DossierPilotOption } from '../../utils/dossierService';
import { renderPdfFirstPageToImage } from '../../utils/pdfUtils';
import AwardFilterDrawer, { EMPTY_AWARD_FILTERS, hasActiveAwardFilters, type AwardLibraryFilters } from './AwardFilterDrawer';
import { supabase } from '../../utils/supabaseClient';

// Cycle types an award's eligibility can be scoped to (mirrors CycleType)
const ELIGIBILITY_CYCLE_TYPES = ['Cruise-WorkUp', 'Cruise-Mission', 'Training', 'Other'];

// Issuance metadata used by the library filters and the per-issuance
// certificate editor in the award edit form
interface IssuanceRecord {
  id: string;
  award_id: string;
  pilot_id: string;
  awarded_date: string | null;
  citation: string | null;
  device_tier: string | null;
  cycle_id: string | null;
  event_id: string | null;
  certificate_url: string | null;
  certificate_thumbnail_url: string | null;
}

/** Editable fields of an issuance row in the issuance manager */
interface IssuanceEdit {
  awarded_date: string;
  citation: string;
  device_tier: string; // '' = no device
}

interface AwardsManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pilots: DossierPilotOption[];
  cycles: DossierCycle[];
  issuedByProfileId: string | null;
  canManageLibrary: boolean;
  canIssue: boolean;
  onChanged: () => void; // notify parent to refresh dossier data
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#64748B'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  backgroundColor: '#F8FAFC',
  fontSize: '14px',
  boxSizing: 'border-box',
  fontFamily: 'Inter'
};

const primaryButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 16px',
  backgroundColor: '#3B82F6',
  color: '#FFFFFF',
  borderRadius: '6px',
  border: '1px solid #3B82F6',
  cursor: 'pointer',
  fontFamily: 'Inter',
  fontSize: '14px',
  fontWeight: 500,
  justifyContent: 'center'
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: '#FFFFFF',
  color: '#64748B',
  border: '1px solid #CBD5E1',
  fontWeight: 400
};

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer',
  padding: '5px 12px',
  borderRadius: '4px',
  border: 'none',
  fontSize: '14px',
  fontFamily: 'Inter',
  backgroundColor: active ? 'rgba(249, 115, 22, 0.1)' : 'transparent',
  color: active ? '#F97316' : '#646F7E'
});

// Full-width drag & drop zone — styling copied from the .miz drop zone on
// Mission Preparation (MissionDetails.tsx).
interface FileDropZoneProps {
  accept: string;
  file: File | null;
  onFile: (file: File | null) => void;
  placeholder: string;
  processing?: boolean;
  processingText?: string;
}

const FileDropZone: React.FC<FileDropZoneProps> = ({ accept, file, onFile, placeholder, processing = false, processingText = 'Processing file...' }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Drag & drop bypasses the input's accept filter, so validate dropped files
  const matchesAccept = (candidate: File): boolean =>
    accept.split(',').some(entry => {
      const pattern = entry.trim().toLowerCase();
      if (pattern.startsWith('.')) return candidate.name.toLowerCase().endsWith(pattern);
      if (pattern.endsWith('/*')) return candidate.type.startsWith(pattern.slice(0, -1));
      return candidate.type === pattern;
    });

  return (
    <>
      <input
        type="file"
        ref={inputRef}
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          onFile(e.target.files?.[0] || null);
          // Reset so picking the same file again re-fires the change event
          e.target.value = '';
        }}
      />
      <div
        style={{
          width: '100%',
          height: '60px',
          border: '1px dashed #CBD5E1',
          borderRadius: '4px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: processing ? 'wait' : 'pointer',
          color: '#64748B',
          fontSize: '14px',
          textAlign: 'center',
          padding: '12px',
          boxSizing: 'border-box',
          transition: 'background-color 0.2s ease'
        }}
        onClick={() => { if (!processing) inputRef.current?.click(); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (processing) return;
          const dropped = e.dataTransfer.files?.[0];
          if (dropped && matchesAccept(dropped)) onFile(dropped);
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        {processing ? (
          <span>{processingText}</span>
        ) : file ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload size={16} />
            {file.name}
            <button
              onClick={(e) => { e.stopPropagation(); onFile(null); }}
              title="Remove file"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: '#DC2626',
                cursor: 'pointer'
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <span>{placeholder}</span>
        )}
      </div>
    </>
  );
};

interface AwardFormState {
  id: string | null; // null = creating
  name: string;
  category_id: string;
  description: string;
  criteria: string;
  is_repeatable: boolean;
  image_url: string | null;
  imageFile: File | null;
  issueNow: boolean; // creation only: issue immediately using the shared issuance fields
  // Structured eligibility + devices (null = manual-only award)
  eligibilityRules: AwardEligibilityRules | null;
  deviceConfig: AwardDeviceConfig | null;
}

const AwardsManagerDialog: React.FC<AwardsManagerDialogProps> = ({
  isOpen,
  onClose,
  pilots,
  cycles,
  issuedByProfileId,
  canManageLibrary,
  canIssue,
  onChanged
}) => {
  const [activeTab, setActiveTab] = useState<'library' | 'issue' | 'categories'>(canManageLibrary ? 'library' : 'issue');
  const [awards, setAwards] = useState<Award[]>([]);
  const [categories, setCategories] = useState<AwardCategory[]>([]);
  const [decorations, setDecorations] = useState<AwardDecorationImage[]>([]);
  const [issuances, setIssuances] = useState<IssuanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(''); // '' = all; Issue tab's simple filter

  // Library filter drawer state
  const [libraryFilters, setLibraryFilters] = useState<AwardLibraryFilters>(EMPTY_AWARD_FILTERS);
  const [libraryFiltersEnabled, setLibraryFiltersEnabled] = useState(true);
  const [filterCycleEvents, setFilterCycleEvents] = useState<DossierEventOption[]>([]);

  // Library list sorting
  type LibrarySortKey = 'name' | 'category' | 'issued';
  const [librarySort, setLibrarySort] = useState<{ key: LibrarySortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });

  // Library state
  const [form, setForm] = useState<AwardFormState | null>(null);
  const [convertingImage, setConvertingImage] = useState(false);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [pendingDeleteAward, setPendingDeleteAward] = useState<Award | null>(null);
  const [busyIssuanceId, setBusyIssuanceId] = useState<string | null>(null);

  // Issuance manager (opened by clicking an award's issued counts)
  const [issuanceViewAwardId, setIssuanceViewAwardId] = useState<string | null>(null);
  const [issuanceEdits, setIssuanceEdits] = useState<Record<string, IssuanceEdit>>({});
  const [selectedIssuanceIds, setSelectedIssuanceIds] = useState<Set<string>>(new Set());
  const [pendingRevoke, setPendingRevoke] = useState<IssuanceRecord[] | null>(null);

  // Categories state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<AwardCategory | null>(null);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);

  // Shared issuance state — used by the Issue tab AND the creation form's
  // "issue now" section, so pilot selections survive switching between them.
  const [issueAwardId, setIssueAwardId] = useState('');
  const [selectedPilotIds, setSelectedPilotIds] = useState<Set<string>>(new Set());
  const [pilotSearch, setPilotSearch] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [citation, setCitation] = useState('');
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [issueCycleId, setIssueCycleId] = useState('');
  const [issueEventId, setIssueEventId] = useState('');
  const [issueCycleEvents, setIssueCycleEvents] = useState<DossierEventOption[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [awardsRes, categoriesRes, decorationsRes, issuancesRes] = await Promise.all([
        getAllAwards(),
        getAwardCategories(),
        getDecorationImages(),
        (supabase as any).from('pilot_awards').select('id, award_id, pilot_id, awarded_date, citation, device_tier, cycle_id, event_id, certificate_url, certificate_thumbnail_url')
      ]);
      setAwards(awardsRes.data || []);
      setCategories(categoriesRes.data || []);
      setDecorations(decorationsRes.data || []);
      setIssuances((issuancesRes.data || []) as IssuanceRecord[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Full reset — stale issuance state from a previous session caused
      // confusing validation (e.g. leftover multi-pilot selections tripping
      // the unique-award check)
      setError(null);
      setNotice(null);
      setForm(null);
      setIssuanceViewAwardId(null);
      setIssuanceEdits({});
      setSelectedIssuanceIds(new Set());
      setEditingCategoryId(null);
      setCategoryFilter('');
      setLibraryFilters(EMPTY_AWARD_FILTERS);
      setLibraryFiltersEnabled(true);
      setIssueAwardId('');
      setSelectedPilotIds(new Set());
      setPilotSearch('');
      setIssueDate(new Date().toISOString().split('T')[0]);
      setCitation('');
      setCertificateFile(null);
      setIssueCycleId('');
      setIssueEventId('');
      setActiveTab(canManageLibrary ? 'library' : 'issue');
      loadData();
    }
  }, [isOpen, canManageLibrary]);

  useEffect(() => {
    if (!issueCycleId) {
      setIssueCycleEvents([]);
      setIssueEventId('');
      return;
    }
    getCycleEvents(issueCycleId).then(({ data }) => setIssueCycleEvents(data || []));
  }, [issueCycleId]);

  // Events for the library filter drawer's "Issued During" cycle
  useEffect(() => {
    if (!libraryFilters.cycleId) {
      setFilterCycleEvents([]);
      return;
    }
    getCycleEvents(libraryFilters.cycleId).then(({ data }) => setFilterCycleEvents(data || []));
  }, [libraryFilters.cycleId]);

  const filteredPilots = useMemo(() => {
    const term = pilotSearch.trim().toLowerCase();
    if (!term) return pilots;
    return pilots.filter(p =>
      p.callsign.toLowerCase().includes(term) ||
      String(p.boardNumber).includes(term) ||
      (p.squadronDesignation || '').toLowerCase().includes(term)
    );
  }, [pilots, pilotSearch]);

  const issuedAwardIds = useMemo(
    () => new Set(issuances.map(i => i.award_id)),
    [issuances]
  );

  const issuancesByAward = useMemo(() => {
    const map: Record<string, IssuanceRecord[]> = {};
    issuances.forEach(i => {
      (map[i.award_id] = map[i.award_id] || []).push(i);
    });
    return map;
  }, [issuances]);

  // Issue tab: simple category dropdown filter
  const filteredAwards = useMemo(() => (
    categoryFilter ? awards.filter(a => a.category_id === categoryFilter) : awards
  ), [awards, categoryFilter]);

  // Award Library: filter drawer
  const libraryFilteredAwards = useMemo(() => {
    if (!libraryFiltersEnabled || !hasActiveAwardFilters(libraryFilters)) return awards;

    const includes = Object.entries(libraryFilters.categoryModes)
      .filter(([, mode]) => mode === 'include').map(([id]) => id);
    const excludes = Object.entries(libraryFilters.categoryModes)
      .filter(([, mode]) => mode === 'exclude').map(([id]) => id);

    return awards.filter(award => {
      // Category show/hide
      if (includes.length > 0 && !includes.includes(award.category_id)) return false;
      if (excludes.includes(award.category_id)) return false;

      // Uniqueness
      if (libraryFilters.uniqueness === 'unique' && award.is_repeatable) return false;
      if (libraryFilters.uniqueness === 'repeatable' && !award.is_repeatable) return false;

      const awardIssuances = issuancesByAward[award.id] || [];

      // Issued state
      if (libraryFilters.issued === 'issued' && awardIssuances.length === 0) return false;
      if (libraryFilters.issued === 'not-issued' && awardIssuances.length > 0) return false;

      // Issuance-level criteria: an issuance must satisfy date range AND cycle/event together
      const hasIssuanceCriteria = !!(libraryFilters.issuedFrom || libraryFilters.issuedTo || libraryFilters.cycleId);
      if (hasIssuanceCriteria) {
        const matches = awardIssuances.some(issuance => {
          if (libraryFilters.issuedFrom && (!issuance.awarded_date || issuance.awarded_date < libraryFilters.issuedFrom)) return false;
          if (libraryFilters.issuedTo && (!issuance.awarded_date || issuance.awarded_date > libraryFilters.issuedTo)) return false;
          if (libraryFilters.cycleId && issuance.cycle_id !== libraryFilters.cycleId) return false;
          if (libraryFilters.eventId && issuance.event_id !== libraryFilters.eventId) return false;
          return true;
        });
        if (!matches) return false;
      }

      return true;
    });
  }, [awards, libraryFilters, libraryFiltersEnabled, issuancesByAward]);

  const sortedLibraryAwards = useMemo(() => {
    const sorted = [...libraryFilteredAwards];
    const dir = librarySort.dir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let cmp = 0;
      if (librarySort.key === 'category') {
        cmp = (a.category?.name || '').localeCompare(b.category?.name || '');
      } else if (librarySort.key === 'issued') {
        cmp = (issuancesByAward[a.id]?.length || 0) - (issuancesByAward[b.id]?.length || 0);
      }
      // Primary name sort, and the tie-breaker for the other keys
      return cmp !== 0 ? cmp * dir : a.name.localeCompare(b.name) * (librarySort.key === 'name' ? dir : 1);
    });
    return sorted;
  }, [libraryFilteredAwards, librarySort, issuancesByAward]);

  const toggleLibrarySort = (key: LibrarySortKey) => {
    setLibrarySort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      // Counts start with the most-awarded on top; text columns start A→Z
      : { key, dir: key === 'issued' ? 'desc' : 'asc' });
  };

  if (!isOpen) return null;

  const switchTab = (tab: 'library' | 'issue' | 'categories') => {
    setActiveTab(tab);
    setError(null);
    setNotice(null);
  };

  const resetIssuanceFields = () => {
    setSelectedPilotIds(new Set());
    setCitation('');
    setCertificateFile(null);
  };

  /** Uploads the selected certificate (if any); returns null on failure after setting the error */
  const uploadCertificateIfAny = async (): Promise<{ certificateUrl: string | null; certificateThumbnailUrl: string | null } | null> => {
    if (!certificateFile) return { certificateUrl: null, certificateThumbnailUrl: null };
    const { url, thumbnailUrl, error: uploadError } = await uploadAwardImage(certificateFile, 'certificate');
    if (uploadError || !url) {
      setError(`Certificate upload failed: ${uploadError?.message || 'unknown error'}`);
      return null;
    }
    return { certificateUrl: url, certificateThumbnailUrl: thumbnailUrl };
  };

  const validateIssuanceFields = (award: Award | NewAward | undefined): string | null => {
    if (selectedPilotIds.size === 0) return 'Select at least one pilot';
    if (!issueDate) return 'Select the award date';
    if (award && !award.is_repeatable && selectedPilotIds.size > 1) {
      return 'This award is unique and can only be issued to a single pilot — deselect the extra pilots';
    }
    return null;
  };

  // ----- Library handlers -----

  const openNewAwardForm = (issueNow: boolean) => {
    setForm({
      id: null,
      name: '',
      category_id: categoryFilter || categories[0]?.id || '',
      description: '',
      criteria: '',
      is_repeatable: true,
      image_url: null,
      imageFile: null,
      issueNow,
      eligibilityRules: null,
      deviceConfig: null
    });
    setError(null);
    setNotice(null);
  };

  // The award image is a display asset, so PDFs (e.g. a certificate that IS
  // the award's visual) are converted to an image of their first page here —
  // the preview and upload paths then only ever deal with images.
  const handleAwardImageFile = async (file: File | null) => {
    if (!file) {
      setForm(prev => (prev ? { ...prev, imageFile: null } : prev));
      return;
    }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setForm(prev => (prev ? { ...prev, imageFile: file } : prev));
      return;
    }
    setError(null);
    setConvertingImage(true);
    try {
      const converted = await renderPdfFirstPageToImage(file);
      setForm(prev => (prev ? { ...prev, imageFile: converted } : prev));
    } catch (err) {
      console.error('PDF conversion failed:', err);
      setError('Could not read that PDF. Try exporting it as an image instead.');
    } finally {
      setConvertingImage(false);
    }
  };

  /** Validation for the structured eligibility + device configuration */
  const validateRulesAndDevices = (formState: AwardFormState): string | null => {
    if (formState.eligibilityRules && !ruleTreeHasConditions(formState.eligibilityRules.rules)) {
      return 'Eligibility criteria are enabled but contain no conditions — add one or disable them';
    }
    const config = formState.deviceConfig;
    if (config?.mode === 'repeat' && !config.repeat?.bronzeImageUrl) {
      return 'Select (or upload) a bronze device image for the repeat devices';
    }
    if (config?.mode === 'tier') {
      for (const tier of config.tiers || []) {
        if (!tier.name.trim()) return 'Every device tier needs a name';
        if (!tier.imageUrl) return `Select a device image for the "${tier.name}" tier`;
        if (!ruleTreeHasConditions(tier.rules)) return `The "${tier.name}" tier has no conditions`;
      }
    }
    return null;
  };

  const handleSaveAward = async () => {
    if (!form || !form.name.trim()) {
      setError('Award name is required');
      return;
    }
    if (!form.category_id) {
      setError('Select a category');
      return;
    }
    const rulesError = validateRulesAndDevices(form);
    if (rulesError) {
      setError(rulesError);
      return;
    }

    const payload: NewAward = {
      name: form.name.trim(),
      category_id: form.category_id,
      description: form.description.trim() || null,
      criteria: form.criteria.trim() || null,
      is_repeatable: form.is_repeatable,
      image_url: form.image_url,
      eligibility_rules: form.eligibilityRules,
      device_config: form.deviceConfig
    };

    const issuingNow = !form.id && form.issueNow;
    if (issuingNow) {
      const validationError = validateIssuanceFields(payload);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      if (form.imageFile) {
        const { url, error: uploadError } = await uploadAwardImage(form.imageFile, 'insignia');
        if (uploadError || !url) {
          setError(`Image upload failed: ${uploadError?.message || 'unknown error'}`);
          return;
        }
        payload.image_url = url;
      }

      // Regenerate the composited device variants on every save with devices —
      // saving is rare, and this also lets a plain re-save pick up compositor
      // improvements (device sizing, anti-aliasing) in existing variants
      if (form.deviceConfig) {
        const baseImage = payload.image_url || categories.find(c => c.id === form.category_id)?.default_image_url || null;
        if (!baseImage) {
          setError('Devices need an award image (or a category default image) to be composited onto — add one first');
          return;
        }
        setGeneratingVariants(true);
        try {
          const { variants, error: variantError } = await generateAwardVariants(baseImage, form.deviceConfig);
          if (variantError || !variants) {
            setError(`Generating the device images failed: ${variantError?.message || 'unknown error'}`);
            return;
          }
          payload.variant_images = variants;
        } finally {
          setGeneratingVariants(false);
        }
      } else {
        payload.variant_images = null;
      }

      const result = form.id
        ? await updateAward(form.id, payload)
        : await createAward(payload);

      if (result.error || !result.data) {
        setError(result.error?.message || 'Failed to save award');
        return;
      }

      if (issuingNow) {
        const certificate = await uploadCertificateIfAny();
        if (!certificate) return; // upload failed; award exists, issuance can be retried from the Issue tab

        const { success, error: issueError } = await issueAward({
          awardId: result.data.id,
          pilotIds: Array.from(selectedPilotIds),
          awardedDate: issueDate,
          citation: citation.trim() || null,
          certificateUrl: certificate.certificateUrl,
          certificateThumbnailUrl: certificate.certificateThumbnailUrl,
          cycleId: issueCycleId || null,
          eventId: issueEventId || null,
          issuedByProfileId
        });
        if (!success) {
          setError(`Award created, but issuing failed: ${issueError?.message || 'unknown error'}. Use the Issue Award tab to retry.`);
          await loadData();
          return;
        }
        setNotice(`Created "${payload.name}" and issued to ${selectedPilotIds.size} pilot${selectedPilotIds.size > 1 ? 's' : ''}`);
        resetIssuanceFields();
      } else {
        setNotice(form.id ? 'Award updated' : 'Award created');
      }

      setForm(null);
      await loadData();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  // ----- Per-issuance certificate management (edit form) -----

  const handleIssuanceCertificateFile = async (issuance: IssuanceRecord, file: File | null) => {
    if (!file) return;
    setBusyIssuanceId(issuance.id);
    setError(null);
    try {
      const { url, thumbnailUrl, error: uploadError } = await uploadAwardImage(file, 'certificate');
      if (uploadError || !url) {
        setError(`Certificate upload failed: ${uploadError?.message || 'unknown error'}`);
        return;
      }
      const { success, error: updateError } = await updateIssuanceCertificate(issuance.id, url, thumbnailUrl);
      if (!success) {
        setError(updateError?.message || 'Failed to update the certificate');
        return;
      }
      setNotice('Certificate updated');
      await loadData();
      onChanged();
    } finally {
      setBusyIssuanceId(null);
    }
  };

  const handleRemoveIssuanceCertificate = async (issuance: IssuanceRecord) => {
    setBusyIssuanceId(issuance.id);
    setError(null);
    try {
      const { success, error: updateError } = await updateIssuanceCertificate(issuance.id, null, null);
      if (!success) {
        setError(updateError?.message || 'Failed to remove the certificate');
        return;
      }
      setNotice('Certificate removed');
      await loadData();
      onChanged();
    } finally {
      setBusyIssuanceId(null);
    }
  };

  const handleConfirmDeleteAward = async () => {
    const award = pendingDeleteAward;
    setPendingDeleteAward(null);
    if (!award) return;
    setBusy(true);
    setError(null);
    try {
      const { success, error: deleteError } = await deleteAward(award.id);
      if (!success) {
        setError(deleteError?.message || 'Failed to delete award');
        return;
      }
      setNotice(`Deleted "${award.name}"`);
      await loadData();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  // ----- Issuance manager handlers -----

  const issuanceEditFor = (record: IssuanceRecord): IssuanceEdit =>
    issuanceEdits[record.id] || {
      awarded_date: record.awarded_date || '',
      citation: record.citation || '',
      device_tier: record.device_tier || ''
    };

  const setIssuanceEdit = (recordId: string, edit: IssuanceEdit) =>
    setIssuanceEdits(prev => ({ ...prev, [recordId]: edit }));

  const issuanceIsDirty = (record: IssuanceRecord): boolean => {
    const edit = issuanceEdits[record.id];
    if (!edit) return false;
    return edit.awarded_date !== (record.awarded_date || '')
      || edit.citation !== (record.citation || '')
      || edit.device_tier !== (record.device_tier || '');
  };

  const handleSaveIssuance = async (record: IssuanceRecord) => {
    const edit = issuanceEditFor(record);
    if (!edit.awarded_date) {
      setError('The awarded date cannot be empty');
      return;
    }
    setBusyIssuanceId(record.id);
    setError(null);
    try {
      const { success, error: updateError } = await updateIssuance(record.id, {
        awardedDate: edit.awarded_date,
        citation: edit.citation.trim() || null,
        deviceTier: edit.device_tier || null
      });
      if (!success) {
        setError(updateError?.message || 'Failed to update the issuance');
        return;
      }
      setIssuanceEdits(prev => {
        const next = { ...prev };
        delete next[record.id];
        return next;
      });
      setNotice('Issuance updated');
      await loadData();
      onChanged();
    } finally {
      setBusyIssuanceId(null);
    }
  };

  const handleConfirmRevoke = async () => {
    const records = pendingRevoke;
    setPendingRevoke(null);
    if (!records || records.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { success, revoked, error: revokeError } = await revokeAwards(records.map(r => r.id));
      if (!success) {
        setError(revokeError?.message || 'Failed to revoke the award');
        return;
      }
      setNotice(revoked === 1 ? 'Award revoked' : `${revoked} issuances revoked`);
      if (revoked < records.length) {
        setError(`${records.length - revoked} issuance${records.length - revoked === 1 ? ' was' : 's were'} not revoked — you may not have permission for those pilots.`);
      }
      setSelectedIssuanceIds(new Set());
      await loadData();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  // ----- Category handlers -----

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.order), 0);
      const { error: createError } = await createAwardCategory(name, maxOrder + 1);
      if (createError) {
        setError(createError.code === '23505' ? 'A category with that name already exists' : (createError.message || 'Failed to create category'));
        return;
      }
      setNewCategoryName('');
      setNotice(`Created category "${name}"`);
      await loadData();
    } finally {
      setBusy(false);
    }
  };

  const handleRenameCategory = async () => {
    if (!editingCategoryId || !editingCategoryName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { error: renameError } = await updateAwardCategory(editingCategoryId, editingCategoryName);
      if (renameError) {
        setError(renameError.message || 'Failed to rename category');
        return;
      }
      setEditingCategoryId(null);
      setNotice('Category renamed');
      await loadData();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleCategoryImageFile = async (category: AwardCategory, file: File | null) => {
    if (!file) return;
    setBusyCategoryId(category.id);
    setError(null);
    try {
      // Default images are display assets — convert PDFs to their first page
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const uploadFile = isPdf ? await renderPdfFirstPageToImage(file) : file;

      const { url, error: uploadError } = await uploadAwardImage(uploadFile, 'insignia');
      if (uploadError || !url) {
        setError(`Image upload failed: ${uploadError?.message || 'unknown error'}`);
        return;
      }
      const { success, error: updateError } = await updateAwardCategoryImage(category.id, url);
      if (!success) {
        setError(updateError?.message || 'Failed to set the category image');
        return;
      }
      setNotice(`Default image set for "${category.name}"`);
      await loadData();
      onChanged();
    } catch (err) {
      console.error('Category image processing failed:', err);
      setError('Could not read that file. Try a different image.');
    } finally {
      setBusyCategoryId(null);
    }
  };

  const handleRemoveCategoryImage = async (category: AwardCategory) => {
    setBusyCategoryId(category.id);
    setError(null);
    try {
      const { success, error: updateError } = await updateAwardCategoryImage(category.id, null);
      if (!success) {
        setError(updateError?.message || 'Failed to remove the category image');
        return;
      }
      setNotice(`Default image removed from "${category.name}"`);
      await loadData();
      onChanged();
    } finally {
      setBusyCategoryId(null);
    }
  };

  const handleConfirmDeleteCategory = async () => {
    const category = pendingDeleteCategory;
    setPendingDeleteCategory(null);
    if (!category) return;
    setBusy(true);
    setError(null);
    try {
      const { success, error: deleteError } = await deleteAwardCategory(category.id);
      if (!success) {
        setError(deleteError?.message || 'Failed to delete category');
        return;
      }
      setNotice(`Deleted category "${category.name}"`);
      await loadData();
    } finally {
      setBusy(false);
    }
  };

  // ----- Issue handlers -----

  const handleIssue = async () => {
    if (!issueAwardId) { setError('Select an award to issue'); return; }
    const award = awards.find(a => a.id === issueAwardId);
    const validationError = validateIssuanceFields(award);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const certificate = await uploadCertificateIfAny();
      if (!certificate) return;

      const { success, error: issueError } = await issueAward({
        awardId: issueAwardId,
        pilotIds: Array.from(selectedPilotIds),
        awardedDate: issueDate,
        citation: citation.trim() || null,
        certificateUrl: certificate.certificateUrl,
        certificateThumbnailUrl: certificate.certificateThumbnailUrl,
        cycleId: issueCycleId || null,
        eventId: issueEventId || null,
        issuedByProfileId
      });

      if (!success) {
        setError(issueError?.message || 'Failed to issue award');
        return;
      }

      // Repeat-device awards: generate any newly-needed star variants
      await ensureRepeatVariantCoverage(issueAwardId);

      setNotice(`Issued to ${selectedPilotIds.size} pilot${selectedPilotIds.size > 1 ? 's' : ''}`);
      resetIssuanceFields();
      await loadData();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  // ----- Renderers -----

  const renderCategoryFilter = (width?: string) => (
    <div style={{ width: width || '100%' }}>
      <StyledSelect
        value={categoryFilter}
        onChange={setCategoryFilter}
        options={[
          { value: '', label: 'All Categories' },
          ...categories.map(category => ({ value: category.id, label: category.name }))
        ]}
      />
    </div>
  );

  // Shared issuance fields: pilots, date, cycle/event linkage, citation, certificate
  const renderIssuanceFields = () => (
    <>
      <div style={{ marginTop: '12px' }}>
        <label style={labelStyle}>Pilots * ({selectedPilotIds.size} selected)</label>
        <input
          type="text"
          value={pilotSearch}
          onChange={(e) => setPilotSearch(e.target.value)}
          style={{ ...inputStyle, marginBottom: '8px' }}
          placeholder="Search by callsign, board number or squadron"
        />
        <div style={{
          maxHeight: '160px',
          overflowY: 'auto',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          padding: '8px 12px'
        }}>
          {filteredPilots.map(pilot => (
            <label key={pilot.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 0',
              fontSize: '14px',
              color: '#0F172A',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={selectedPilotIds.has(pilot.id)}
                onChange={(e) => {
                  const next = new Set(selectedPilotIds);
                  if (e.target.checked) next.add(pilot.id);
                  else next.delete(pilot.id);
                  setSelectedPilotIds(next);
                }}
              />
              <span style={{ width: '44px', color: '#646F7E' }}>{pilot.boardNumber}</span>
              <span style={{ fontWeight: 500 }}>{pilot.callsign}</span>
              <span style={{ color: '#94A3B8', fontSize: '12px' }}>{pilot.squadronDesignation || 'No Squadron'}</span>
            </label>
          ))}
          {filteredPilots.length === 0 && (
            <div style={{ color: '#94A3B8', fontSize: '13px', fontStyle: 'italic' }}>No pilots match</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '12px' }}>
        <div>
          <label style={labelStyle}>Date Awarded *</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Cycle (optional)</label>
          <StyledSelect
            value={issueCycleId}
            onChange={setIssueCycleId}
            options={[
              { value: '', label: 'Not tied to a cycle' },
              ...cycles.map(cycle => ({ value: cycle.id, label: cycle.name }))
            ]}
          />
        </div>
        <div>
          <label style={labelStyle}>Event (optional)</label>
          <StyledSelect
            value={issueEventId}
            onChange={setIssueEventId}
            disabled={!issueCycleId}
            options={[
              { value: '', label: 'Not tied to an event' },
              ...issueCycleEvents.map(event => ({ value: event.id, label: event.name || 'Unnamed event' }))
            ]}
          />
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <label style={labelStyle}>Citation / Notes</label>
        <textarea
          value={citation}
          onChange={(e) => setCitation(e.target.value)}
          style={{ ...inputStyle, minHeight: '52px', resize: 'vertical' }}
          placeholder="Reason for the award"
        />
      </div>

      <div style={{ marginTop: '12px' }}>
        <label style={labelStyle}>Certificate (image/PDF, optional)</label>
        <FileDropZone
          accept="image/*,application/pdf,.pdf"
          file={certificateFile}
          onFile={setCertificateFile}
          placeholder="Drag the certificate here, or click to open file browser."
        />
      </div>
    </>
  );

  const renderAwardForm = (formState: AwardFormState) => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input
            type="text"
            value={formState.name}
            onChange={(e) => setForm({ ...formState, name: e.target.value })}
            style={inputStyle}
            placeholder="e.g. Silver Star"
          />
        </div>
        <div>
          <label style={labelStyle}>Category *</label>
          <StyledSelect
            value={formState.category_id}
            onChange={(categoryId) => setForm({ ...formState, category_id: categoryId })}
            options={categories.map(category => ({ value: category.id, label: category.name }))}
          />
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <label style={labelStyle}>Description</label>
        <textarea
          value={formState.description}
          onChange={(e) => setForm({ ...formState, description: e.target.value })}
          style={{ ...inputStyle, minHeight: '52px', resize: 'vertical' }}
          placeholder="What this award represents"
        />
      </div>

      <div style={{ marginTop: '12px' }}>
        <label style={labelStyle}>Criteria</label>
        <textarea
          value={formState.criteria}
          onChange={(e) => setForm({ ...formState, criteria: e.target.value })}
          style={{ ...inputStyle, minHeight: '52px', resize: 'vertical' }}
          placeholder="Conditions under which this award is earned"
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginTop: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#0F172A', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!formState.is_repeatable}
            onChange={(e) => setForm({ ...formState, is_repeatable: !e.target.checked })}
          />
          Unique (can only ever be issued once)
        </label>
      </div>

      <div style={{ marginTop: '12px' }}>
        <label style={labelStyle}>Award Image</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {(() => {
            const categoryDefault = categories.find(c => c.id === formState.category_id)?.default_image_url || null;
            const previewUrl = formState.imageFile
              ? URL.createObjectURL(formState.imageFile)
              : (formState.image_url || categoryDefault);
            const usingCategoryDefault = !formState.imageFile && !formState.image_url && !!categoryDefault;
            return (
              <>
                {previewUrl && !convertingImage && (
                  <div
                    title={usingCategoryDefault ? 'Category default image' : 'Award image'}
                    style={{
                      width: '56px',
                      height: '56px',
                      flexShrink: 0,
                      backgroundImage: `url(${previewUrl})`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      border: usingCategoryDefault ? '1px dashed #CBD5E1' : '1px solid #E2E8F0',
                      borderRadius: '6px',
                      opacity: usingCategoryDefault ? 0.7 : 1
                    }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <FileDropZone
                    accept="image/*,application/pdf,.pdf"
                    file={formState.imageFile}
                    onFile={handleAwardImageFile}
                    processing={convertingImage}
                    processingText="Converting PDF to image..."
                    placeholder={formState.image_url
                      ? 'Drag a replacement image or PDF here, or click to open file browser.'
                      : usingCategoryDefault
                        ? 'Using the category\'s default image — drop an image or PDF here to override.'
                        : 'Drag the award image or PDF here, or click to open file browser.'}
                  />
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Structured eligibility criteria (evaluated per pilot per cycle) */}
      <div style={{
        marginTop: '16px',
        padding: '12px 16px',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        backgroundColor: formState.eligibilityRules ? '#F8FAFC' : 'transparent'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500, color: '#0F172A', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!formState.eligibilityRules}
            onChange={(e) => setForm({
              ...formState,
              eligibilityRules: e.target.checked ? emptyEligibilityRules() : null
            })}
          />
          Automatic eligibility criteria
          <span style={{ fontWeight: 400, fontSize: '12px', color: '#94A3B8' }}>
            — identify recipients from cycle attendance and roster data on the Eligibility tab
          </span>
        </label>

        {formState.eligibilityRules && (
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Qualifying cycle types</label>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {ELIGIBILITY_CYCLE_TYPES.map(cycleType => (
                <label key={cycleType} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F172A', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formState.eligibilityRules!.cycleTypes.includes(cycleType)}
                    onChange={(e) => {
                      const current = formState.eligibilityRules!;
                      const cycleTypes = e.target.checked
                        ? [...current.cycleTypes, cycleType]
                        : current.cycleTypes.filter(t => t !== cycleType);
                      setForm({ ...formState, eligibilityRules: { ...current, cycleTypes } });
                    }}
                  />
                  {cycleType}
                </label>
              ))}
            </div>
            <label style={labelStyle}>A pilot is eligible when</label>
            <AwardRuleBuilder
              group={formState.eligibilityRules.rules}
              onChange={(rules) => setForm({
                ...formState,
                eligibilityRules: { ...formState.eligibilityRules!, rules }
              })}
              cycles={cycles}
              qualifyingCycleTypes={formState.eligibilityRules.cycleTypes}
            />
          </div>
        )}
      </div>

      {/* Device (star) decorations */}
      <div style={{
        marginTop: '16px',
        padding: '12px 16px',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        backgroundColor: formState.deviceConfig ? '#F8FAFC' : 'transparent'
      }}>
        <AwardDeviceEditor
          config={formState.deviceConfig}
          onChange={(deviceConfig) => setForm({ ...formState, deviceConfig })}
          decorations={decorations}
          onDecorationsChanged={async () => {
            const { data } = await getDecorationImages();
            setDecorations(data || []);
          }}
          cycles={cycles}
          qualifyingCycleTypes={formState.eligibilityRules?.cycleTypes}
          canManage={canManageLibrary}
          onError={setError}
        />
      </div>

      {/* Existing issuances with per-issuance certificate management (edit only) */}
      {formState.id && (() => {
        const awardIssuances = issuances.filter(i => i.award_id === formState.id);
        if (awardIssuances.length === 0) return null;
        return (
          <div style={{ marginTop: '16px' }}>
            <label style={labelStyle}>Issuances ({awardIssuances.length})</label>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '4px 12px' }}>
              {awardIssuances.map(issuance => {
                const pilot = pilots.find(p => p.id === issuance.pilot_id);
                const certificateDisplayUrl = issuance.certificate_thumbnail_url
                  || (issuance.certificate_url && !issuance.certificate_url.split('?')[0].toLowerCase().endsWith('.pdf')
                    ? issuance.certificate_url
                    : null);
                const isBusy = busyIssuanceId === issuance.id;
                return (
                  <div key={issuance.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 0',
                    borderBottom: '1px solid #F1F5F9',
                    opacity: isBusy ? 0.5 : 1
                  }}>
                    {certificateDisplayUrl ? (
                      <div style={{
                        width: '40px',
                        height: '30px',
                        flexShrink: 0,
                        backgroundImage: `url(${certificateDisplayUrl})`,
                        backgroundSize: 'contain',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        border: '1px solid #E2E8F0',
                        borderRadius: '3px',
                        backgroundColor: '#FFFFFF'
                      }} />
                    ) : (
                      <div style={{
                        width: '40px',
                        height: '30px',
                        flexShrink: 0,
                        border: '1px dashed #CBD5E1',
                        borderRadius: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        color: '#94A3B8'
                      }}>
                        None
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, fontSize: '13px', color: '#0F172A' }}>
                      <span style={{ color: '#646F7E', marginRight: '6px' }}>{pilot?.boardNumber ?? ''}</span>
                      <span style={{ fontWeight: 500 }}>{pilot?.callsign || 'Unknown pilot'}</span>
                      <span style={{ color: '#94A3B8', fontSize: '12px', marginLeft: '8px' }}>
                        {formatDossierDate(issuance.awarded_date)}
                      </span>
                    </div>
                    <label
                      title={issuance.certificate_url ? 'Replace certificate' : 'Attach certificate (image/PDF)'}
                      style={{ ...secondaryButtonStyle, padding: '6px 8px', cursor: isBusy ? 'wait' : 'pointer' }}
                    >
                      <Upload size={14} />
                      <input
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        style={{ display: 'none' }}
                        disabled={isBusy}
                        onChange={(e) => {
                          handleIssuanceCertificateFile(issuance, e.target.files?.[0] || null);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {issuance.certificate_url && (
                      <button
                        onClick={() => handleRemoveIssuanceCertificate(issuance)}
                        disabled={isBusy}
                        title="Remove certificate"
                        style={{ ...secondaryButtonStyle, padding: '6px 8px', color: '#DC2626', borderColor: '#FCA5A5' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Issue immediately (creation only) */}
      {!formState.id && canIssue && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          backgroundColor: formState.issueNow ? '#F8FAFC' : 'transparent'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500, color: '#0F172A', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formState.issueNow}
              onChange={(e) => setForm({ ...formState, issueNow: e.target.checked })}
            />
            Issue this award now
          </label>
          {formState.issueNow && renderIssuanceFields()}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
        <button
          onClick={handleSaveAward}
          disabled={busy || convertingImage}
          style={{ ...primaryButtonStyle, opacity: busy || convertingImage ? 0.7 : 1, cursor: busy || convertingImage ? 'wait' : 'pointer' }}
        >
          {convertingImage
            ? 'Converting image...'
            : generatingVariants
              ? 'Generating device images...'
              : busy
                ? 'Saving...'
                : formState.id
                  ? 'Save Changes'
                  : formState.issueNow
                    ? 'Create & Issue Award'
                    : 'Create Award'}
        </button>
        <button
          onClick={() => setForm(null)}
          disabled={busy || convertingImage}
          style={{ ...secondaryButtonStyle, opacity: busy || convertingImage ? 0.7 : 1, cursor: busy || convertingImage ? 'wait' : 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // All grants of one award: edit dates/citations/device tiers, or revoke
  const renderIssuanceManager = (award: Award) => {
    const records = [...(issuancesByAward[award.id] || [])].sort((a, b) => {
      const dateCmp = (b.awarded_date || '').localeCompare(a.awarded_date || '');
      if (dateCmp !== 0) return dateCmp;
      const callsignA = pilots.find(p => p.id === a.pilot_id)?.callsign || '';
      const callsignB = pilots.find(p => p.id === b.pilot_id)?.callsign || '';
      return callsignA.localeCompare(callsignB);
    });
    const tierOptions = award.device_config?.mode === 'tier' ? (award.device_config.tiers || []) : [];
    const uniqueHolders = new Set(records.map(r => r.pilot_id)).size;

    const allSelected = records.length > 0 && records.every(r => selectedIssuanceIds.has(r.id));
    const selectedRecords = records.filter(r => selectedIssuanceIds.has(r.id));

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button
            onClick={() => { setIssuanceViewAwardId(null); setIssuanceEdits({}); setSelectedIssuanceIds(new Set()); }}
            style={{ ...secondaryButtonStyle, whiteSpace: 'nowrap' }}
          >
            ← Back
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>{award.name} — Issuances</div>
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>
              Issued {records.length} time{records.length === 1 ? '' : 's'} to {uniqueHolders} pilot{uniqueHolders === 1 ? '' : 's'}
            </div>
          </div>
          {selectedRecords.length > 0 && (
            <button
              onClick={() => setPendingRevoke(selectedRecords)}
              disabled={busy}
              style={{ ...secondaryButtonStyle, color: '#DC2626', borderColor: '#FCA5A5', whiteSpace: 'nowrap' }}
            >
              <Trash2 size={14} /> Revoke Selected ({selectedRecords.length})
            </button>
          )}
        </div>

        {records.length === 0 ? (
          <div style={{ color: '#94A3B8', fontSize: '14px', fontStyle: 'italic' }}>
            This award has not been issued yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0 8px', borderBottom: '1px solid #E2E8F0', fontSize: '12px', color: '#64748B', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => setSelectedIssuanceIds(e.target.checked ? new Set(records.map(r => r.id)) : new Set())}
              />
              Select all
            </label>
            {records.map(record => {
              const pilot = pilots.find(p => p.id === record.pilot_id);
              const cycleName = record.cycle_id
                ? (cycles.find(c => c.id === record.cycle_id)?.name || 'Unknown cycle')
                : null;
              const edit = issuanceEditFor(record);
              const dirty = issuanceIsDirty(record);
              const isBusy = busyIssuanceId === record.id;
              return (
                <div key={record.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 0',
                  borderBottom: '1px solid #F1F5F9',
                  opacity: isBusy ? 0.5 : 1
                }}>
                  <input
                    type="checkbox"
                    checked={selectedIssuanceIds.has(record.id)}
                    onChange={(e) => {
                      const next = new Set(selectedIssuanceIds);
                      if (e.target.checked) next.add(record.id);
                      else next.delete(record.id);
                      setSelectedIssuanceIds(next);
                    }}
                    style={{ flexShrink: 0 }}
                  />
                  <div style={{ width: '140px', flexShrink: 0, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#646F7E', marginRight: '6px' }}>{pilot?.boardNumber ?? ''}</span>
                    <span style={{ fontWeight: 500, color: '#0F172A' }}>{pilot?.callsign || 'Unknown pilot'}</span>
                    {cycleName && (
                      <div style={{ fontSize: '11px', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cycleName}>
                        {cycleName}
                      </div>
                    )}
                  </div>
                  <input
                    type="date"
                    value={edit.awarded_date}
                    onChange={(e) => setIssuanceEdit(record.id, { ...edit, awarded_date: e.target.value })}
                    disabled={isBusy}
                    style={{ ...inputStyle, width: '150px', flexShrink: 0, padding: '6px 8px', fontSize: '13px' }}
                  />
                  {tierOptions.length > 0 && (
                    <div style={{ width: '180px', flexShrink: 0 }}>
                      <StyledSelect
                        value={edit.device_tier}
                        onChange={(tierId) => setIssuanceEdit(record.id, { ...edit, device_tier: tierId })}
                        disabled={isBusy}
                        options={[
                          { value: '', label: 'No device' },
                          ...tierOptions.map(tier => ({ value: tier.id, label: tier.name }))
                        ]}
                      />
                    </div>
                  )}
                  <input
                    type="text"
                    value={edit.citation}
                    placeholder="Citation"
                    onChange={(e) => setIssuanceEdit(record.id, { ...edit, citation: e.target.value })}
                    disabled={isBusy}
                    style={{ ...inputStyle, flex: 1, minWidth: '80px', padding: '6px 8px', fontSize: '13px' }}
                  />
                  <button
                    onClick={() => handleSaveIssuance(record)}
                    disabled={!dirty || isBusy}
                    title={dirty ? 'Save changes to this issuance' : 'No changes to save'}
                    style={{
                      ...secondaryButtonStyle,
                      padding: '6px 8px',
                      color: dirty ? '#16A34A' : '#CBD5E1',
                      borderColor: dirty ? '#86EFAC' : '#E2E8F0',
                      cursor: dirty && !isBusy ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setPendingRevoke([record])}
                    disabled={isBusy}
                    title="Revoke this award"
                    style={{ ...secondaryButtonStyle, padding: '6px 8px', color: '#DC2626', borderColor: '#FCA5A5' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderLibraryTab = () => (
    <>
      {form ? (
        renderAwardForm(form)
      ) : issuanceViewAwardId && awards.find(a => a.id === issuanceViewAwardId) ? (
        renderIssuanceManager(awards.find(a => a.id === issuanceViewAwardId)!)
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <button onClick={() => openNewAwardForm(false)} style={primaryButtonStyle}>
              <Plus size={14} /> New Award
            </button>
          </div>

          <AwardFilterDrawer
            categories={categories}
            awards={awards}
            cycles={cycles}
            cycleEvents={filterCycleEvents}
            filters={libraryFilters}
            filtersEnabled={libraryFiltersEnabled}
            setFilters={setLibraryFilters}
            setFiltersEnabled={setLibraryFiltersEnabled}
          />

          {loading ? (
            <div style={{ color: '#64748B', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>Loading awards...</div>
          ) : libraryFilteredAwards.length === 0 ? (
            <div style={{ color: '#94A3B8', fontSize: '14px', fontStyle: 'italic' }}>
              {awards.length === 0 ? 'No awards defined yet' : 'No awards match the current filters'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {(() => {
                const sortHeader = (label: string, key: LibrarySortKey, style?: React.CSSProperties) => (
                  <div
                    onClick={() => toggleLibrarySort(key)}
                    title={`Sort by ${label.toLowerCase()}`}
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontFamily: 'Inter',
                      color: librarySort.key === key ? '#3B82F6' : '#64748B',
                      cursor: 'pointer',
                      userSelect: 'none',
                      ...style
                    }}
                  >
                    {label}{librarySort.key === key ? (librarySort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </div>
                );
                return (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '4px 0 6px',
                    borderBottom: '1px solid #E2E8F0'
                  }}>
                    <div style={{ width: '40px', flexShrink: 0 }} />
                    {sortHeader('Name', 'name', { flex: 1, minWidth: 0 })}
                    {sortHeader('Category', 'category', { width: '150px', flexShrink: 0 })}
                    {sortHeader('Awarded', 'issued', { width: '92px', flexShrink: 0, textAlign: 'right' })}
                    {/* Spacer matching the action buttons column */}
                    <div style={{ width: canIssue ? '120px' : '76px', flexShrink: 0 }} />
                  </div>
                );
              })()}
              {sortedLibraryAwards.map(award => {
                const uniqueAndIssued = !award.is_repeatable && issuedAwardIds.has(award.id);
                const displayImage = awardDisplayImage(award);
                return (
                <div key={award.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 0',
                  borderBottom: '1px solid #F1F5F9'
                }}>
                  {displayImage ? (
                    <div style={{
                      width: '40px',
                      height: '40px',
                      flexShrink: 0,
                      backgroundImage: `url(${displayImage})`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center'
                    }} />
                  ) : (
                    <div style={{
                      width: '40px',
                      height: '40px',
                      flexShrink: 0,
                      borderRadius: '6px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Medal size={20} style={{ color: '#CBD5E1' }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#0F172A' }}>
                      {award.name}
                      {!award.is_repeatable && (
                        <span style={{
                          marginLeft: '8px',
                          padding: '0 6px',
                          borderRadius: '6px',
                          backgroundColor: '#FEF3C7',
                          color: '#D97706',
                          fontSize: '10px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          verticalAlign: 'middle'
                        }}>
                          Unique{uniqueAndIssued ? ' · Issued' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{
                    width: '150px',
                    flexShrink: 0,
                    fontSize: '13px',
                    color: '#64748B',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {award.category?.name || 'Uncategorized'}
                  </div>
                  {(() => {
                    const awardIssuances = issuancesByAward[award.id] || [];
                    const uniqueHolders = new Set(awardIssuances.map(i => i.pilot_id)).size;
                    const issued = awardIssuances.length > 0;
                    return (
                      <div
                        onClick={issued ? () => setIssuanceViewAwardId(award.id) : undefined}
                        title={issued
                          ? `Issued ${awardIssuances.length} time${awardIssuances.length === 1 ? '' : 's'} to ${uniqueHolders} pilot${uniqueHolders === 1 ? '' : 's'} — click to view and manage`
                          : 'Never issued'}
                        style={{
                          width: '92px',
                          textAlign: 'right',
                          flexShrink: 0,
                          cursor: issued ? 'pointer' : 'default',
                          borderRadius: '6px',
                          padding: '2px 4px',
                          margin: '-2px -4px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => { if (issued) e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <div style={{ fontSize: '13px', color: issued ? '#3B82F6' : '#CBD5E1' }}>
                          {awardIssuances.length} awarded
                        </div>
                        <div style={{ fontSize: '11px', color: issued ? '#94A3B8' : '#CBD5E1' }}>
                          {uniqueHolders} pilot{uniqueHolders === 1 ? '' : 's'}
                        </div>
                      </div>
                    );
                  })()}
                  {canIssue && (
                    <button
                      onClick={() => { setIssueAwardId(award.id); switchTab('issue'); }}
                      disabled={uniqueAndIssued}
                      title={uniqueAndIssued ? 'This unique award has already been issued' : 'Issue this award'}
                      style={{
                        ...secondaryButtonStyle,
                        padding: '6px 8px',
                        color: uniqueAndIssued ? '#CBD5E1' : '#3B82F6',
                        borderColor: uniqueAndIssued ? '#E2E8F0' : '#93C5FD',
                        cursor: uniqueAndIssued ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <Medal size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => setForm({
                      id: award.id,
                      name: award.name,
                      category_id: award.category_id,
                      description: award.description || '',
                      criteria: award.criteria || '',
                      is_repeatable: award.is_repeatable,
                      image_url: award.image_url,
                      imageFile: null,
                      issueNow: false,
                      eligibilityRules: award.eligibility_rules || null,
                      deviceConfig: award.device_config || null
                    })}
                    title="Edit award"
                    style={{ ...secondaryButtonStyle, padding: '6px 8px' }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setPendingDeleteAward(award)}
                    title="Delete award (removes all issuances)"
                    style={{ ...secondaryButtonStyle, padding: '6px 8px', color: '#DC2626', borderColor: '#FCA5A5' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );

  const renderCategoriesTab = () => (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
          style={{ ...inputStyle, flex: 1 }}
          placeholder="New category name"
        />
        <button
          onClick={handleAddCategory}
          disabled={busy || !newCategoryName.trim()}
          style={{ ...primaryButtonStyle, opacity: busy || !newCategoryName.trim() ? 0.7 : 1 }}
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#64748B', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>Loading categories...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {categories.map(category => {
            const inUseCount = awards.filter(a => a.category_id === category.id).length;
            const isEditing = editingCategoryId === category.id;
            const isBusy = busyCategoryId === category.id;
            return (
              <div key={category.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 0',
                borderBottom: '1px solid #F1F5F9',
                opacity: isBusy ? 0.5 : 1
              }}>
                {category.default_image_url ? (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    flexShrink: 0,
                    backgroundImage: `url(${category.default_image_url})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center'
                  }} />
                ) : (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    flexShrink: 0,
                    borderRadius: '4px',
                    border: '1px dashed #CBD5E1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Medal size={16} style={{ color: '#CBD5E1' }} />
                  </div>
                )}
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameCategory(); }}
                      style={{ ...inputStyle, flex: 1 }}
                      autoFocus
                    />
                    <button
                      onClick={handleRenameCategory}
                      disabled={busy || !editingCategoryName.trim()}
                      title="Save"
                      style={{ ...secondaryButtonStyle, padding: '6px 8px', color: '#16A34A', borderColor: '#86EFAC' }}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingCategoryId(null)}
                      title="Cancel"
                      style={{ ...secondaryButtonStyle, padding: '6px 8px' }}
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: '#0F172A' }}>{category.name}</span>
                      <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '8px' }}>
                        {inUseCount} award{inUseCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <label
                      title={category.default_image_url ? 'Replace default award image' : 'Set a default award image for this category'}
                      style={{ ...secondaryButtonStyle, padding: '6px 8px', cursor: isBusy ? 'wait' : 'pointer' }}
                    >
                      <Upload size={14} />
                      <input
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        style={{ display: 'none' }}
                        disabled={isBusy}
                        onChange={(e) => {
                          handleCategoryImageFile(category, e.target.files?.[0] || null);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {category.default_image_url && (
                      <button
                        onClick={() => handleRemoveCategoryImage(category)}
                        disabled={isBusy}
                        title="Remove default image"
                        style={{ ...secondaryButtonStyle, padding: '6px 8px', color: '#DC2626', borderColor: '#FCA5A5' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name); }}
                      title="Rename category"
                      style={{ ...secondaryButtonStyle, padding: '6px 8px' }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setPendingDeleteCategory(category)}
                      disabled={inUseCount > 0}
                      title={inUseCount > 0 ? 'Reassign this category\'s awards before deleting' : 'Delete category'}
                      style={{
                        ...secondaryButtonStyle,
                        padding: '6px 8px',
                        color: inUseCount > 0 ? '#CBD5E1' : '#DC2626',
                        borderColor: inUseCount > 0 ? '#E2E8F0' : '#FCA5A5',
                        cursor: inUseCount > 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {categories.length === 0 && (
            <div style={{ color: '#94A3B8', fontSize: '14px', fontStyle: 'italic' }}>No categories defined yet</div>
          )}
        </div>
      )}
    </div>
  );

  const renderIssueTab = () => {
    const selectedIssueAward = awards.find(a => a.id === issueAwardId) || null;
    // Awards with structured criteria issue through the eligibility checker;
    // everything else uses the manual pilot picker
    const usesEligibility = !!selectedIssueAward?.eligibility_rules;

    return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr auto', gap: '12px', alignItems: 'end' }}>
        <div>
          <label style={labelStyle}>Category</label>
          {renderCategoryFilter()}
        </div>
        <div>
          <label style={labelStyle}>Award *</label>
          <StyledSelect
            value={issueAwardId}
            onChange={setIssueAwardId}
            options={[
              { value: '', label: 'Select an award...' },
              ...filteredAwards.filter(a => a.active).map(award => {
                const uniqueAndIssued = !award.is_repeatable && issuedAwardIds.has(award.id);
                return {
                  value: award.id,
                  label: `${award.name}${uniqueAndIssued ? ' (already issued)' : ''}`,
                  disabled: uniqueAndIssued
                };
              })
            ]}
          />
        </div>
        {canManageLibrary && (
          <button
            onClick={() => { openNewAwardForm(true); switchTab('library'); }}
            title="Create a new award and issue it to the selected pilots in one step"
            style={{ ...secondaryButtonStyle, whiteSpace: 'nowrap' }}
          >
            <Plus size={14} /> New Award
          </button>
        )}
      </div>

      {usesEligibility && selectedIssueAward ? (
        <div style={{ marginTop: '16px' }}>
          <AwardEligibilityPanel
            award={selectedIssueAward}
            cycles={cycles}
            pilots={pilots}
            issuedByProfileId={issuedByProfileId}
            onIssued={async () => { await loadData(); onChanged(); }}
            onError={setError}
            onNotice={setNotice}
          />
        </div>
      ) : (
        <>
          {renderIssuanceFields()}

          <button onClick={handleIssue} disabled={busy} style={{ ...primaryButtonStyle, marginTop: '20px', opacity: busy ? 0.7 : 1 }}>
            <Medal size={14} /> {busy ? 'Issuing...' : 'Issue Award'}
          </button>
        </>
      )}
    </div>
    );
  };

  return (
    <>
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '920px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 24px 8px', position: 'relative' }}>
          <span style={dossierStyles.cardHeaderText}>Awards Management</span>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              right: '16px',
              top: '14px',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              color: '#64748B',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', padding: '8px 24px 0' }}>
          {canManageLibrary && (
            <button onClick={() => switchTab('library')} style={tabButtonStyle(activeTab === 'library')}>
              Award Library
            </button>
          )}
          {canManageLibrary && (
            <button onClick={() => switchTab('categories')} style={tabButtonStyle(activeTab === 'categories')}>
              Categories
            </button>
          )}
          {canIssue && (
            <button onClick={() => switchTab('issue')} style={tabButtonStyle(activeTab === 'issue')}>
              Issue Award
            </button>
          )}
        </div>

        {/* Messages */}
        {(error || notice) && (
          <div style={{ padding: '8px 24px 0' }}>
            {error && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#B91C1C'
              }}>
                {error}
              </div>
            )}
            {notice && !error && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#166534'
              }}>
                {notice}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '16px 24px 24px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'library' && canManageLibrary
            ? renderLibraryTab()
            : activeTab === 'categories' && canManageLibrary
              ? renderCategoriesTab()
              : renderIssueTab()}
        </div>
      </div>
    </div>

    <ConfirmationDialog
      isOpen={pendingDeleteAward !== null}
      onConfirm={handleConfirmDeleteAward}
      onCancel={() => setPendingDeleteAward(null)}
      title="Delete Award"
      message={`Delete "${pendingDeleteAward?.name || ''}"? This also removes every issuance of this award from pilot records and cannot be undone.`}
      confirmText="Delete"
      cancelText="Cancel"
      type="danger"
      icon="trash"
    />

    <ConfirmationDialog
      isOpen={pendingDeleteCategory !== null}
      onConfirm={handleConfirmDeleteCategory}
      onCancel={() => setPendingDeleteCategory(null)}
      title="Delete Category"
      message={`Delete the "${pendingDeleteCategory?.name || ''}" category? This cannot be undone.`}
      confirmText="Delete"
      cancelText="Cancel"
      type="danger"
      icon="trash"
    />

    <ConfirmationDialog
      isOpen={pendingRevoke !== null}
      onConfirm={handleConfirmRevoke}
      onCancel={() => setPendingRevoke(null)}
      title={pendingRevoke && pendingRevoke.length > 1 ? 'Revoke Awards' : 'Revoke Award'}
      message={(() => {
        if (!pendingRevoke) return '';
        if (pendingRevoke.length === 1) {
          const callsign = pilots.find(p => p.id === pendingRevoke[0].pilot_id)?.callsign || 'this pilot';
          return `Revoke this award from ${callsign}? The issuance is removed from their record and cannot be undone.`;
        }
        const pilotCount = new Set(pendingRevoke.map(r => r.pilot_id)).size;
        return `Revoke ${pendingRevoke.length} issuances from ${pilotCount} pilot${pilotCount === 1 ? '' : 's'}? The issuances are removed from their records and cannot be undone.`;
      })()}
      confirmText="Revoke"
      cancelText="Cancel"
      type="danger"
      icon="trash"
    />
    </>
  );
};

export default AwardsManagerDialog;
