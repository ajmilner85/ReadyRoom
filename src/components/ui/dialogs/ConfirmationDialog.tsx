import React from 'react';
import { AlertTriangle, Trash2, Archive } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  icon?: 'trash' | 'archive' | 'warning' | 'none';
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  icon = 'warning'
}) => {
  if (!isOpen) return null;

  const getIconComponent = () => {
    switch (icon) {
      case 'trash':
        return <Trash2 size={20} />;
      case 'archive':
        return <Archive size={20} />;
      case 'warning':
        return <AlertTriangle size={20} />;
      case 'none':
      default:
        return null;
    }
  };

  const getTypeColors = () => {
    switch (type) {
      case 'danger':
        return {
          iconColor: '#EF4444',
          confirmBg: '#EF4444',
          confirmBorder: '#EF4444'
        };
      case 'warning':
        return {
          iconColor: '#F59E0B',
          confirmBg: '#F59E0B',
          confirmBorder: '#F59E0B'
        };
      case 'info':
      default:
        return {
          iconColor: '#3B82F6',
          confirmBg: '#3B82F6',
          confirmBorder: '#3B82F6'
        };
    }
  };

  const colors = getTypeColors();

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
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '400px',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  };

  const headerStyle: React.CSSProperties = {
    padding: '24px 24px 16px 24px',
    textAlign: 'center',
  };

  const iconStyle: React.CSSProperties = {
    color: colors.iconColor,
    marginBottom: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1F2937',
    margin: '0 0 12px 0',
  };

  const messageStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#6B7280',
    lineHeight: '1.5',
    margin: 0,
  };

  const footerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
    padding: '16px 24px 24px 24px',
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
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    color: '#374151',
  };

  const confirmButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.confirmBg,
    borderColor: colors.confirmBorder,
    color: '#FFFFFF',
  };

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          {icon !== 'none' && (
            <div style={iconStyle}>
              {getIconComponent()}
            </div>
          )}
          <h2 style={titleStyle}>{title}</h2>
          <p style={messageStyle}>{message}</p>
        </div>

        <div style={footerStyle}>
          <button
            onClick={onCancel}
            style={cancelButtonStyle}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#F9FAFB';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={confirmButtonStyle}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};