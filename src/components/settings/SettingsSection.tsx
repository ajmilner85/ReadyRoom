import React from 'react';
import clsx from 'clsx';

/**
 * Settings content section: 16/700 title + 12px description header, scrolling body,
 * optional sticky footer. Fills the Settings content pane.
 */
export const SettingsSection: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Remove body padding (tables / matrices). */
  flush?: boolean;
  bodyClassName?: string;
}> = ({ title, description, actions, footer, children, flush, bodyClassName }) => (
  <div className="flex flex-col h-full min-h-0 text-text">
    <div className="flex-none flex items-center gap-3 px-4 py-[14px] border-b border-border">
      <div className="min-w-0">
        <div className="text-[16px] font-bold">{title}</div>
        {description ? <div className="text-[12px] text-text2 mt-[1px]">{description}</div> : null}
      </div>
      <div className="flex-1" />
      {actions ? <div className="flex items-center gap-2 flex-none">{actions}</div> : null}
    </div>
    <div className={clsx('flex-1 min-h-0 overflow-auto', !flush && 'p-5', bodyClassName)}>{children}</div>
    {footer ? <div className="flex-none flex items-center gap-[14px] px-4 py-[10px] border-t border-border bg-panel2">{footer}</div> : null}
  </div>
);

export default SettingsSection;
