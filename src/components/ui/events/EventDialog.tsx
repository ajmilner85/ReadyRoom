import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, Upload, Image as ImageIcon } from 'lucide-react';

interface EventDialogProps {
  onSave: (eventData: {
    title: string;
    description: string;
    datetime: string;
    endDatetime?: string;
    duration?: {
      hours: number;
      minutes: number;
    };
    restrictedTo?: string[];
    participants?: string[];
    headerImage?: File | null;
    additionalImages?: (File | null)[];
    trackQualifications?: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  initialData?: {
    title: string;
    description: string;
    datetime: string;
    endDatetime?: string;
    restrictedTo?: string[];
    participants?: string[];
    imageUrl?: string;
    headerImageUrl?: string;
    additionalImageUrls?: string[];
    trackQualifications?: boolean;
  };
  squadrons?: Array<{ id: string; name: string; designation: string; insignia_url?: string | null }>;
  selectedCycle?: { participants?: string[] };
}

export const EventDialog: React.FC<EventDialogProps> = ({
  onSave,
  onCancel,
  initialData,
  squadrons = [],
  selectedCycle
}) => {  
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [datetime, setDatetime] = useState(initialData?.datetime ? new Date(initialData.datetime).toISOString().slice(0, 16) : '');
  const [durationHours, setDurationHours] = useState(1); // Default to 1 hour for new events
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [endDatetime, setEndDatetime] = useState(initialData?.endDatetime ? new Date(initialData.endDatetime).toISOString().slice(0, 16) : '');
  const [restrictedTo, setRestrictedTo] = useState<string[]>(initialData?.restrictedTo || []);
  const [participants, setParticipatingSquadrons] = useState<string[]>(
    initialData?.participants || selectedCycle?.participants || []
  );
  const [trackQualifications, setTrackQualifications] = useState(initialData?.trackQualifications || false);
  const [images, setImages] = useState<(File | null)[]>([null, null, null, null]);
  const [imagePreviews, setImagePreviews] = useState<(string | null)[]>([null, null, null, null]);
  const [dragOverStates, setDragOverStates] = useState<boolean[]>([false, false, false, false]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Update participants when selectedCycle changes
  useEffect(() => {
    if (!initialData?.participants && selectedCycle?.participants) {
      setParticipatingSquadrons(selectedCycle.participants);
    }
  }, [selectedCycle?.participants, initialData?.participants]);

  // Load existing images when editing
  useEffect(() => {
    if (initialData) {
      console.log('[EDIT-DIALOG-DEBUG] Loading initial data:', {
        headerImageUrl: initialData.headerImageUrl,
        additionalImageUrls: initialData.additionalImageUrls,
        imageUrl: initialData.imageUrl
      });
      
      const newPreviews = [null, null, null, null];
      
      // Load header image from legacy imageUrl or new headerImageUrl as first image
      const headerUrl = initialData.headerImageUrl || initialData.imageUrl;
      if (headerUrl) {
        newPreviews[0] = headerUrl;
      }

      // Load additional images into remaining slots
      if (initialData.additionalImageUrls) {
        initialData.additionalImageUrls.forEach((url, index) => {
          if (url && index < 3) {
            newPreviews[index + 1] = url;
          }
        });
      }
      
      console.log('[EDIT-DIALOG-DEBUG] Final image previews:', newPreviews);
      setImagePreviews(newPreviews);
    }
  }, [initialData]);

  // Image handling functions
  const handleImageSelect = (file: File, imageIndex: number) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        
        const newImages = [...images];
        const newPreviews = [...imagePreviews];
        newImages[imageIndex] = file;
        newPreviews[imageIndex] = result;
        setImages(newImages);
        setImagePreviews(newPreviews);
      };
      reader.readAsDataURL(file);
      setError('');
    } else {
      setError('Please select a valid image file');
    }
  };

  const handleDragOver = (e: React.DragEvent, imageIndex: number) => {
    e.preventDefault();
    const newStates = [...dragOverStates];
    newStates[imageIndex] = true;
    setDragOverStates(newStates);
  };

  const handleDragLeave = (e: React.DragEvent, imageIndex: number) => {
    e.preventDefault();
    const newStates = [...dragOverStates];
    newStates[imageIndex] = false;
    setDragOverStates(newStates);
  };

  const handleDrop = (e: React.DragEvent, imageIndex: number) => {
    e.preventDefault();
    const newStates = [...dragOverStates];
    newStates[imageIndex] = false;
    setDragOverStates(newStates);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleImageSelect(files[0], imageIndex);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, imageIndex: number) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file, imageIndex);
    }
  };

  const removeImage = (imageIndex: number) => {
    const newImages = [...images];
    const newPreviews = [...imagePreviews];
    newImages[imageIndex] = null;
    newPreviews[imageIndex] = null;
    setImages(newImages);
    setImagePreviews(newPreviews);
  };
  
  useEffect(() => {
    if (initialData?.datetime && initialData?.endDatetime) {
      const start = new Date(initialData.datetime);
      const end = new Date(initialData.endDatetime);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const durationMs = end.getTime() - start.getTime();
        const totalMinutes = Math.round(durationMs / (1000 * 60));
        
        setDurationHours(Math.floor(totalMinutes / 60));
        setDurationMinutes(totalMinutes % 60);
      }
    }
  }, [initialData]);

  useEffect(() => {
    if (datetime) {
      const start = new Date(datetime);
      
      if (!isNaN(start.getTime())) {
        const durationMs = (durationHours * 60 + durationMinutes) * 60 * 1000;
        const end = new Date(start.getTime() + durationMs);
        
        const formattedEndDate = end.toISOString().slice(0, 16);
        setEndDatetime(formattedEndDate);
      }
    }
  }, [datetime, durationHours, durationMinutes]);

  const handleDatetimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDatetime(e.target.value);
  };

  const handleDurationHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setDurationHours(isNaN(value) || value < 0 ? 0 : value);
  };

  const handleDurationMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    const clamped = isNaN(value) ? 0 : Math.min(59, Math.max(0, value));
    setDurationMinutes(clamped);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return; // Prevent multiple submissions
    
    if (!title.trim()) {
      setError('Please enter an event title');
      return;
    }

    if (!datetime) {
      setError('Please select a start date and time');
      return;
    }
    
    setIsSubmitting(true);
    setError('');

    if (durationHours === 0 && durationMinutes === 0) {
      setError('Please specify an event duration');
      setIsSubmitting(false);
      return;
    }

    const start = new Date(datetime);
    const end = new Date(endDatetime);
    if (end <= start) {
      setError('End time must be after start time');
      setIsSubmitting(false);
      return;
    }

    try {
      await onSave({
      title: title.trim(),
      description: description.trim(),
      datetime,
      endDatetime,
      duration: {
        hours: durationHours,
        minutes: durationMinutes
      },
      restrictedTo: restrictedTo.length > 0 ? restrictedTo : undefined,
      participants: participants.length > 0 ? participants : undefined,
      headerImage: images[0],
      additionalImages: images.slice(1).filter(img => img !== null),
      trackQualifications
    });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred while saving the event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions = ['Cadre', 'Staff', 'All Pilots'];

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}
        onClick={onCancel}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        zIndex: 1001
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #E2E8F0'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#0F172A'
          }}>
            {initialData ? 'Edit Event' : 'Create New Event'}
          </h2>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} color="#64748B" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Event Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  lineHeight: '19px'
                }}
                placeholder="Enter event title"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Start Date & Time
              </label>
              <input
                type="datetime-local"
                value={datetime}
                onChange={handleDatetimeChange}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  lineHeight: '19px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Duration
              </label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Clock size={16} color="#64748B" style={{ marginRight: '8px' }} />
                <input
                  type="number"
                  min="0"
                  value={durationHours}
                  onChange={handleDurationHoursChange}
                  style={{
                    width: '70px',
                    padding: '8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px 0 0 4px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    height: '35px',
                    textAlign: 'center'
                  }}
                />
                <span style={{ padding: '0 6px', border: '1px solid #CBD5E1', borderLeft: 'none', borderRight: 'none', height: '35px', lineHeight: '35px', backgroundColor: '#F8FAFC' }}>h</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={durationMinutes}
                  onChange={handleDurationMinutesChange}
                  style={{
                    width: '70px',
                    padding: '8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '0 4px 4px 0',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    height: '35px',
                    textAlign: 'center'
                  }}
                />
                <span style={{ marginLeft: '6px', height: '35px', lineHeight: '35px' }}>min</span>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Eligibility
              </label>
              <select
                multiple
                value={restrictedTo}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value);
                  setRestrictedTo(values);
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              >
                {roleOptions.map(role => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <div style={{
                fontSize: '12px',
                color: '#64748B',
                marginTop: '4px'
              }}>
                Hold Ctrl/Cmd to select multiple roles. Leave empty for no restrictions.
              </div>
            </div>

            {/* Participating Squadrons */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Participating Squadrons
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    type="button"
                    onClick={() => setParticipatingSquadrons(squadrons.map(s => s.id))}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #DBEAFE',
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontFamily: 'Inter',
                      color: '#1E40AF'
                    }}
                  >
                    All
                  </button>
                  <button 
                    type="button"
                    onClick={() => setParticipatingSquadrons([])}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontFamily: 'Inter',
                      color: '#DC2626'
                    }}
                  >
                    None
                  </button>
                  {selectedCycle?.participants && (
                    <button 
                      type="button"
                      onClick={() => setParticipatingSquadrons(selectedCycle.participants || [])}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        borderRadius: '3px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        fontFamily: 'Inter',
                        color: '#15803D'
                      }}
                    >
                      Reset to Cycle
                    </button>
                  )}
                </div>
              </div>
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid #E5E7EB',
                borderRadius: '4px',
                padding: '4px',
                backgroundColor: '#FAFAFA'
              }}>
                {squadrons.map(squadron => {
                  const isSelected = participants.includes(squadron.id);
                  return (
                    <div
                      key={squadron.id}
                      onClick={() => {
                        if (isSelected) {
                          setParticipatingSquadrons(prev => prev.filter(id => id !== squadron.id));
                        } else {
                          setParticipatingSquadrons(prev => [...prev, squadron.id]);
                        }
                      }}
                      style={{
                        padding: '6px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                        borderRadius: '3px',
                        transition: 'background-color 0.2s',
                        marginBottom: '2px'
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = '#F8FAFC';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: '14px',
                        height: '14px',
                        border: '1px solid #CBD5E1',
                        borderRadius: '3px',
                        backgroundColor: isSelected ? '#3B82F6' : '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {isSelected && (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      
                      {/* Squadron Insignia */}
                      {squadron.insignia_url ? (
                        <div style={{
                          width: '20px',
                          height: '20px',
                          backgroundImage: `url(${squadron.insignia_url})`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                          flexShrink: 0
                        }} />
                      ) : (
                        <div style={{
                          width: '20px',
                          height: '20px',
                          backgroundColor: '#E5E7EB',
                          borderRadius: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <span style={{ fontSize: '10px', color: '#6B7280' }}>?</span>
                        </div>
                      )}
                      
                      {/* Squadron Info */}
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'Inter' }}>
                          {squadron.designation}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'Inter' }}>
                          {squadron.name}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{
                fontSize: '12px',
                color: '#64748B',
                marginTop: '4px'
              }}>
                {participants.length === 0 ? 
                  'No squadrons selected. Event will inherit from cycle.' :
                  `${participants.length} squadron${participants.length !== 1 ? 's' : ''} selected.`
                }
              </div>
            </div>

            {/* Qualification Tracking Toggle */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                <input
                  type="checkbox"
                  checked={trackQualifications}
                  onChange={(e) => setTrackQualifications(e.target.checked)}
                  style={{
                    marginRight: '8px',
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer'
                  }}
                />
                Track responses by qualification type
              </label>
              <div style={{
                fontSize: '12px',
                color: '#64748B',
                marginTop: '4px',
                marginLeft: '24px'
              }}>
                When enabled, responses will be grouped by Mission Commander, Flight Lead, Section Lead, LSO, and JTAC qualifications.
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '120px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter event description"
              />
            </div>

            {/* Image Upload Section - 2x2 Image Grid */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '12px',
                color: '#64748B',
                fontSize: '14px',
                fontWeight: '500'
              }}>
                Event Images (Optional)
              </label>
              
              {/* 2x2 Image Grid */}
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: '1fr 1fr',
                gap: '12px'
                }}>
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={(e) => handleDragLeave(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onClick={() => document.getElementById(`image-upload-${index}`)?.click()}
                      style={{
                        border: `2px dashed ${dragOverStates[index] ? '#3B82F6' : '#CBD5E1'}`,
                        borderRadius: '6px',
                        padding: '12px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        backgroundColor: dragOverStates[index] ? 'rgba(59, 130, 246, 0.05)' : '#FAFAFA',
                        transition: 'all 0.2s ease',
                        minHeight: '100px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {imagePreviews[index] ? (
                        <div style={{ position: 'relative' }}>
                          <img
                            src={imagePreviews[index]!}
                            alt={`Image ${index + 1}`}
                            style={{
                              maxWidth: '120px',
                              maxHeight: '80px',
                              borderRadius: '4px',
                              objectFit: 'cover'
                            }}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImage(index);
                            }}
                            style={{
                              position: 'absolute',
                              top: '2px',
                              right: '2px',
                              background: 'rgba(0, 0, 0, 0.7)',
                              border: 'none',
                              borderRadius: '50%',
                              width: '18px',
                              height: '18px',
                              color: '#fff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <ImageIcon size={20} color="#94A3B8" style={{ margin: '0 auto 4px' }} />
                          <p style={{ color: '#94A3B8', fontSize: '10px', margin: '0' }}>
                            Drop image or click
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Hidden file inputs for all images */}
                  {[0, 1, 2, 3].map((index) => (
                    <input
                      key={index}
                      id={`image-upload-${index}`}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileInputChange(e, index)}
                      style={{ display: 'none' }}
                    />
                  ))}
                </div>
            </div>

            {error && (
              <div style={{
                color: '#EF4444',
                fontSize: '14px',
                marginBottom: '16px'
              }}>
                {error}
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            borderTop: '1px solid #E2E8F0',
            padding: '16px 24px'
          }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                backgroundColor: 'white',
                color: '#64748B',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: isSubmitting ? '#94A3B8' : '#2563EB',
                color: 'white',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isSubmitting && (
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #ffffff40',
                  borderTopColor: '#ffffff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              )}
              {isSubmitting 
                ? (initialData ? 'Updating...' : 'Creating...')
                : (initialData ? 'Update Event' : 'Create Event')
              }
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default EventDialog;