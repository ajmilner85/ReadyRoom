/**
 * A unique ID generated once per browser tab / page load.
 * Used to distinguish this tab's own saves from saves made by
 * the same user in another tab, so the realtime self-filter
 * can correctly skip echoes without discarding cross-tab updates.
 */
export const tabSessionId: string = Math.random().toString(36).slice(2, 11);
