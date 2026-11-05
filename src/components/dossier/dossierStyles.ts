// Shared styles for the Pilot Dossier page. Card, shadow and header treatments
// are copied from Roster Management / Events Management for consistency.

export const dossierStyles = {
  container: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '14px',
    boxSizing: 'border-box' as const,
    overflowY: 'hidden' as const
  },
  contentWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minHeight: 0,
    position: 'relative' as const,
    zIndex: 1,
    width: '100%'
  },
  columnsContainer: {
    display: 'flex',
    gap: '14px',
    flex: 1,
    minHeight: 0,
    overflow: 'visible'
  },
  card: {
    backgroundColor: 'var(--rr-panel)',
    boxShadow: 'var(--rr-shadow)',
    border: '1px solid var(--rr-border)',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    overflow: 'hidden',
    boxSizing: 'border-box' as const
  },
  cardHeader: {
    padding: '12px 14px',
    borderBottom: '1px solid var(--rr-border)'
  },
  cardHeaderText: {
    fontFamily: 'inherit',
    fontStyle: 'normal' as const,
    fontWeight: 600,
    fontSize: '12px',
    letterSpacing: '.14em',
    lineHeight: '16px',
    color: 'var(--rr-text2)',
    textTransform: 'uppercase' as const,
    display: 'block',
    textAlign: 'left' as const
  },
  cardContent: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '14px'
  },
  fieldLabel: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--rr-text2)'
  },
  fieldValue: {
    fontSize: '14px',
    color: 'var(--rr-text)'
  },
  sectionLabel: {
    fontSize: '10px',
    fontFamily: 'var(--rr-font-mono)',
    letterSpacing: '.14em',
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    color: 'var(--rr-text2)',
    borderBottom: '1px solid var(--rr-border)',
    paddingBottom: '8px',
    marginBottom: '12px',
    marginTop: '24px'
  },
  selector: {
    width: '100%',
    padding: '8px 12px',
    paddingRight: '32px',
    border: '1px solid var(--rr-border2)',
    borderRadius: '6px',
    backgroundColor: 'var(--rr-panel2)',
    fontSize: '14px',
    appearance: 'none' as const,
    cursor: 'pointer'
  },
  emptyState: {
    display: 'flex',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--rr-text2)',
    fontSize: '14px',
    textAlign: 'center' as const
  }
};

export function formatDossierDate(date: string | null | undefined): string {
  if (!date) return '—';
  // Date-only strings (e.g. awarded_date '2026-07-08') must be parsed as LOCAL
  // dates — new Date('2026-07-08') parses as UTC midnight, which displays as
  // the previous day in western timezones.
  let parsed: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number);
    parsed = new Date(year, month - 1, day);
  } else {
    parsed = new Date(date);
  }
  if (isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
