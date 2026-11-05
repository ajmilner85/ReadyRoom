import React, { useState, useEffect } from 'react';
import { Icon } from '../primitives';

export interface ReminderRecipientTypes {
  accepted: boolean;
  tentative: boolean;
  declined: boolean;
  noResponse: boolean;
}

interface SendReminderDialogProps {
  open: boolean;
  onClose: () => void;
  event: {
    id: string;
    name: string;
  };
  onSend: (recipientTypes: ReminderRecipientTypes) => Promise<void>;
}

export const SendReminderDialog: React.FC<SendReminderDialogProps> = ({
  open,
  onClose,
  event,
  onSend
}) => {
  const [recipientTypes, setRecipientTypes] = useState<ReminderRecipientTypes>({
    accepted: false,
    tentative: true,  // Default checked
    declined: false,
    noResponse: true  // Default checked
  });
  const [sending, setSending] = useState(false);

  // Reset to defaults when dialog opens
  useEffect(() => {
    if (open) {
      setRecipientTypes({
        accepted: false,
        tentative: true,
        declined: false,
        noResponse: true
      });
    }
  }, [open]);

  if (!open) return null;

  const handleSend = async () => {
    if (sending) return;

    // Check if at least one type is selected
    const hasSelection = Object.values(recipientTypes).some(v => v);
    if (!hasSelection) return;

    setSending(true);
    try {
      await onSend(recipientTypes);
      onClose();
    } catch (error) {
      console.error('Error sending reminder:', error);
    } finally {
      setSending(false);
    }
  };

  const toggleRecipientType = (type: keyof ReminderRecipientTypes) => {
    setRecipientTypes(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const hasSelection = Object.values(recipientTypes).some(v => v);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1002,
    padding: '20px',
  };

  const dialogStyle: React.CSSProperties = {
    backgroundColor: 'var(--rr-panel)',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '480px',
    overflow: 'hidden',
    boxShadow: 'var(--rr-shadow-lg)',
  };

  const headerStyle: React.CSSProperties = {
    padding: '24px',
    borderBottom: '1px solid var(--rr-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const headerTitleStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--rr-text)',
    margin: 0,
  };

  const closeButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--rr-text2)',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const contentStyle: React.CSSProperties = {
    padding: '24px',
  };

  const eventNameStyle: React.CSSProperties = {
    fontSize: '14px',
    color: 'var(--rr-text2)',
    marginBottom: '20px',
    lineHeight: '1.5',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--rr-text)',
    marginBottom: '12px',
  };

  const checkboxContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  };

  const checkboxItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    cursor: 'pointer',
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid var(--rr-border)',
    transition: 'all 0.2s ease',
  };

  const checkboxStyle: React.CSSProperties = {
    width: '20px',
    height: '20px',
    border: '2px solid var(--rr-border2)',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '2px',
  };

  const checkboxCheckedStyle: React.CSSProperties = {
    ...checkboxStyle,
    backgroundColor: 'var(--rr-accent)',
    borderColor: 'var(--rr-accent)',
  };

  const checkboxTextContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  const checkboxLabelStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--rr-text)',
  };

  const checkboxDescriptionStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--rr-text2)',
    lineHeight: '1.4',
  };

  const footerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
    padding: '16px 24px 24px 24px',
    borderTop: '1px solid var(--rr-border)',
  };

  const buttonStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const cancelButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: 'var(--rr-panel)',
    borderColor: 'var(--rr-border2)',
    color: 'var(--rr-text)',
  };

  const sendButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: hasSelection ? 'var(--rr-accent)' : 'var(--rr-panel3)',
    borderColor: hasSelection ? 'var(--rr-accent)' : 'var(--rr-border)',
    color: hasSelection ? '#FFFFFF' : 'var(--rr-text3)',
    cursor: hasSelection && !sending ? 'pointer' : 'not-allowed',
  };

  const recipientOptions = [
    {
      key: 'accepted' as const,
      label: 'Accepted',
      description: 'Users who have accepted the event invitation'
    },
    {
      key: 'tentative' as const,
      label: 'Tentative',
      description: 'Users who marked themselves as tentative'
    },
    {
      key: 'declined' as const,
      label: 'Declined',
      description: 'Users who declined the event invitation'
    },
    {
      key: 'noResponse' as const,
      label: 'No Response',
      description: 'Users from participating squadrons who haven\'t responded yet'
    }
  ];

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={headerTitleStyle}>
            <Icon name="bell" size={20} color="#3B82F6" />
            <h2 style={titleStyle}>Send Reminder Now</h2>
          </div>
          <button
            onClick={onClose}
            style={closeButtonStyle}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--rr-text)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--rr-text2)';
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div style={contentStyle}>
          <div style={eventNameStyle}>
            Send an immediate reminder for <strong>{event.name}</strong>
          </div>

          <label style={labelStyle}>
            Select Recipients
          </label>

          <div style={checkboxContainerStyle}>
            {recipientOptions.map(option => {
              const isChecked = recipientTypes[option.key];
              return (
                <div
                  key={option.key}
                  style={checkboxItemStyle}
                  onClick={() => toggleRecipientType(option.key)}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                  }}
                >
                  <div style={isChecked ? checkboxCheckedStyle : checkboxStyle}>
                    {isChecked && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M10 3L4.5 8.5L2 6"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <div style={checkboxTextContainerStyle}>
                    <div style={checkboxLabelStyle}>{option.label}</div>
                    <div style={checkboxDescriptionStyle}>{option.description}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {!hasSelection && (
            <div style={{
              fontSize: '12px',
              color: 'var(--rr-bad)',
              padding: '8px 12px',
              backgroundColor: 'rgba(224,82,78,.12)',
              borderRadius: '4px',
              border: '1px solid #FEE2E2'
            }}>
              Please select at least one recipient type
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button
            onClick={onClose}
            style={cancelButtonStyle}
            disabled={sending}
            onMouseEnter={e => {
              if (!sending) e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
            }}
            onMouseLeave={e => {
              if (!sending) e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            style={sendButtonStyle}
            disabled={!hasSelection || sending}
            onMouseEnter={e => {
              if (hasSelection && !sending) e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={e => {
              if (hasSelection && !sending) e.currentTarget.style.opacity = '1';
            }}
          >
            {sending ? 'Sending...' : 'Send Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
};
