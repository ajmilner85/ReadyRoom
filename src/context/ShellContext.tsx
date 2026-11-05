import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/** Context strip content: `CODE / Title · meta`. */
export interface ShellHeader {
  code?: string;
  title?: string;
  meta?: string;
}

export interface PresencePerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  color?: string;
  /** Currently active / typing — pulses. */
  active?: boolean;
}

interface ShellContextValue {
  header: ShellHeader | null;
  setHeader: (h: ShellHeader | null) => void;
  presence: PresencePerson[];
  setPresence: (p: PresencePerson[]) => void;
  /** Extra controls a page wants in the context strip (right side, before theme toggle). */
  stripActions: React.ReactNode;
  setStripActions: (n: React.ReactNode) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [header, setHeader] = useState<ShellHeader | null>(null);
  const [presence, setPresence] = useState<PresencePerson[]>([]);
  const [stripActions, setStripActions] = useState<React.ReactNode>(null);
  const value = useMemo(
    () => ({ header, setHeader, presence, setPresence, stripActions, setStripActions }),
    [header, presence, stripActions],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
};

export function useShell() {
  return useContext(ShellContext);
}

/**
 * Set the context-strip header for the current page. Pass only what differs from the
 * route defaults (e.g. a mission name as title, or "· 16 pilots" as meta).
 * Cleared automatically on unmount.
 */
export function usePageHeader(header: ShellHeader | null) {
  const shell = useContext(ShellContext);
  const key = header ? `${header.code ?? ''}|${header.title ?? ''}|${header.meta ?? ''}` : '';
  useEffect(() => {
    if (!shell) return;
    shell.setHeader(header);
    return () => shell.setHeader(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Publish presence avatars (e.g. other users viewing this mission) to the context strip. */
export function usePagePresence(people: PresencePerson[]) {
  const shell = useContext(ShellContext);
  const key = people.map(p => `${p.id}:${p.active ? 1 : 0}`).join(',');
  useEffect(() => {
    if (!shell) return;
    shell.setPresence(people);
    return () => shell.setPresence([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
