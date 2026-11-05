import React from 'react';
import { Button, Dialog, Icon, IconName } from '../primitives';

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

const ICONS: Record<'trash' | 'archive' | 'warning', IconName> = {
  trash: 'trash',
  archive: 'archive',
  warning: 'alertTriangle',
};

const TONE: Record<'danger' | 'warning' | 'info', { fg: string; bg: string }> = {
  danger: { fg: 'var(--rr-bad)', bg: 'rgba(224,82,78,.14)' },
  warning: { fg: 'var(--rr-warn)', bg: 'rgba(222,154,31,.14)' },
  info: { fg: 'var(--rr-info)', bg: 'rgba(62,155,212,.14)' },
};

/** Confirmation dialog on the kit Dialog (same props as before). */
export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  icon = 'warning',
}) => {
  const tone = TONE[type];
  return (
    <Dialog
      open={isOpen}
      onClose={onCancel}
      width={440}
      zIndex={1100}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>{cancelText}</Button>
          {type === 'danger' ? (
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center justify-center gap-[7px] px-4 py-2 rounded-rr-ctl text-[13px] font-semibold text-white border-0 cursor-pointer bg-bad hover:brightness-110 active:scale-[.93] transition-[filter,transform]"
            >
              {confirmText}
            </button>
          ) : (
            <Button variant="primary" onClick={onConfirm}>{confirmText}</Button>
          )}
        </>
      }
    >
      <div className="flex items-start gap-3">
        {icon !== 'none' ? (
          <span className="flex-none w-9 h-9 rounded-rr-lg flex items-center justify-center" style={{ background: tone.bg, color: tone.fg }}>
            <Icon name={ICONS[icon]} size={18} />
          </span>
        ) : null}
        <p className="m-0 text-[13px] leading-[1.55] text-text2 whitespace-pre-line">{message}</p>
      </div>
    </Dialog>
  );
};

export default ConfirmationDialog;
