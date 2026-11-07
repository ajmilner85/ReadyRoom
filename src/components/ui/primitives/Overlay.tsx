import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon, IconName } from './Icon';
import { Floating, Placement } from './Floating';

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Extra content in the header, right of the title (before the close button). */
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  /** px or CSS width (default 460). */
  width?: number | string;
  /** Fill most of the viewport height. */
  tall?: boolean;
  children: React.ReactNode;
  /** Close on overlay click (default true). */
  dismissible?: boolean;
  bodyClassName?: string;
  /** Remove body padding (for full-bleed content). */
  flush?: boolean;
  zIndex?: number;
}

/** Dialog — overlay rgba(0,0,0,.55), 12px radius, header / body / footer. */
export const Dialog: React.FC<DialogProps> = ({
  open, onClose, title, headerExtra, footer, width = 460, tall, children, dismissible = true, bodyClassName, flush, zIndex = 80,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && dismissible) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissible]);

  // Only treat a click as "outside" if the press also started on the overlay
  // (prevents closing when a text selection drag ends on the overlay).
  const downOnOverlay = useRef(false);

  if (!open) return null;
  return createPortal(
    <div
      onMouseDown={e => { downOnOverlay.current = e.target === e.currentTarget; }}
      onClick={e => { if (dismissible && downOnOverlay.current && e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 flex items-center justify-center p-6 max-[760px]:p-2"
      style={{ zIndex, background: 'var(--rr-overlay)', animation: 'rrFadeIn .15s ease' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex flex-col bg-panel border border-border2 rounded-rr-2xl shadow-rr-lg overflow-hidden max-w-full text-text"
        style={{ width, maxHeight: tall ? '94vh' : '88vh', height: tall ? '94vh' : undefined, animation: 'rrPopIn .18s ease' }}
      >
        {title !== undefined ? (
          <div className="flex-none flex items-center justify-between gap-3 px-[18px] py-4 border-b border-border">
            <div className="text-[16px] font-bold min-w-0 truncate">{title}</div>
            <div className="flex items-center gap-2 flex-none">
              {headerExtra}
              <CloseButton onClick={onClose} />
            </div>
          </div>
        ) : null}
        <div className={clsx('flex-1 min-h-0 overflow-y-auto', !flush && 'p-[18px]', bodyClassName)}>{children}</div>
        {footer ? (
          <div className="flex-none flex items-center justify-end gap-[10px] px-[18px] py-[14px] border-t border-border">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};

export const CloseButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Close' }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="w-7 h-7 rounded-rr-md flex items-center justify-center text-text3 hover:bg-panel2 hover:text-text bg-transparent border-0 cursor-pointer"
  >
    <Icon name="close" size={16} />
  </button>
);

/* ------------------------------------------------------------------ */
/* Drawer (slides from the right, 340px)                               */
/* ------------------------------------------------------------------ */
export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}> = ({ open, onClose, title, footer, width = 340, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[75] flex justify-end"
      style={{ background: 'rgba(0,0,0,.4)', animation: 'rrFadeIn .15s ease' }}
    >
      <div
        className="h-full max-w-[90%] bg-panel border-l border-border2 shadow-rr-lg flex flex-col text-text"
        style={{ width, animation: 'rrSlideInRight .22s cubic-bezier(.2,.8,.2,1)' }}
      >
        <div className="flex-none flex items-center justify-between px-[18px] py-4 border-b border-border">
          <span className="text-[16px] font-bold">{title}</span>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-[18px]">{children}</div>
        {footer ? <div className="flex-none flex items-center justify-between gap-[10px] px-[18px] py-[14px] border-t border-border">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
};

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */
export const Tooltip: React.FC<{
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: Placement;
  delay?: number;
  disabled?: boolean;
}> = ({ content, children, placement = 'top', delay = 250, disabled }) => {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const t = useRef<number | undefined>(undefined);
  const show = () => { if (disabled || !content) return; window.clearTimeout(t.current); t.current = window.setTimeout(() => setOpen(true), delay); };
  const hide = () => { window.clearTimeout(t.current); setOpen(false); };
  useEffect(() => () => window.clearTimeout(t.current), []);
  return (
    <>
      <span ref={setAnchor} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} className="inline-flex max-w-full">
        {children}
      </span>
      <Floating anchor={anchor} open={open} placement={placement} offset={8} zIndex={2600} dismissOnOutside={false} style={{ pointerEvents: 'none' }}>
        <div className="max-w-[280px] text-[11px] font-medium px-[9px] py-[5px] rounded-rr-md shadow-rr-lg" style={{ background: 'var(--rr-text)', color: 'var(--rr-bg)' }}>
          {content}
        </div>
      </Floating>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */
export type ToastTone = 'good' | 'bad' | 'warn' | 'info';
interface ToastItem { id: number; tone: ToastTone; message: React.ReactNode; duration: number }

const TOAST_ICON: Record<ToastTone, IconName> = { good: 'check', bad: 'alertCircle', warn: 'alertTriangle', info: 'info' };

interface ToastApi {
  show: (message: React.ReactNode, tone?: ToastTone, duration?: number) => void;
  success: (message: React.ReactNode) => void;
  error: (message: React.ReactNode) => void;
  info: (message: React.ReactNode) => void;
  warn: (message: React.ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const dismiss = useCallback((id: number) => setItems(list => list.filter(i => i.id !== id)), []);
  const show = useCallback((message: React.ReactNode, tone: ToastTone = 'good', duration = 4000) => {
    const id = ++idRef.current;
    setItems(list => [...list.slice(-3), { id, tone, message, duration }]);
    if (duration > 0) window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);
  const api = React.useMemo<ToastApi>(() => ({
    show,
    success: m => show(m, 'good'),
    error: m => show(m, 'bad', 6000),
    info: m => show(m, 'info'),
    warn: m => show(m, 'warn', 5000),
  }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-32px)] pointer-events-none">
          {items.map(t => <Toast key={t.id} tone={t.tone} onDismiss={() => dismiss(t.id)}>{t.message}</Toast>)}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
};

/** Toast — left colour border, icon, dismiss. */
export const Toast: React.FC<{ tone?: ToastTone; children: React.ReactNode; onDismiss?: () => void }> = ({ tone = 'good', children, onDismiss }) => (
  <div
    role="status"
    className="pointer-events-auto flex items-center gap-[10px] px-3 py-[10px] rounded-rr-lg bg-panel2 border border-border2 shadow-rr-lg text-text"
    style={{ borderLeft: `3px solid var(--rr-${tone})`, animation: 'rrPopIn .2s ease' }}
  >
    <span className="flex" style={{ color: `var(--rr-${tone})` }}><Icon name={TOAST_ICON[tone]} size={17} /></span>
    <span className="flex-1 text-[13px] min-w-0">{children}</span>
    {onDismiss ? (
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="flex text-text2 hover:text-text bg-transparent border-0 cursor-pointer">
        <Icon name="close" size={16} />
      </button>
    ) : null}
  </div>
);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback so components outside the provider don't crash.
    const log = (m: React.ReactNode) => console.log('[toast]', m);
    return { show: log, success: log, error: log, info: log, warn: log };
  }
  return ctx;
}
