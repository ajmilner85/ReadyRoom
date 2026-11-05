// Shared styles for the Pilot Dossier page. Card, shadow and header treatments
// are copied from Roster Management / Events Management for consistency.

export const dossierStyles = {
  container: {
    backgroundColor: 'var(--rr-panel2)',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '20px 20px 20px 20px',
    boxSizing: 'border-box' as const,
    overflowY: 'hidden' as const
  },
  contentWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: 'calc(100vh - 40px)',
    position: 'relative' as const,
    zIndex: 1,
    maxWidth: '2009px',
    margin: '0 auto',
    width: '100%'
  },
  columnsContainer: {
    display: 'flex',
    gap: '20px',
    flex: 1,
    height: 'calc(100vh - 40px)',
    overflow: 'visible'
  },
  card: {
    backgroundColor: 'var(--rr-panel)',
    boxShadow: 'var(--rr-shadow)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    overflow: 'hidden',
    boxSizing: 'border-box' as const
  },
  cardHeader: {
    padding: '16px 24px 8px'
  },
  cardHeaderText: {
    fontFamily: 'inherit',
    fontStyle: 'normal' as const,
    fontWeight: 300,
    fontSize: '20px',
    lineHeight: '24px',
    color: 'var(--rr-text2)',
    textTransform: 'uppercase' as const,
    display: 'block',
    textAlign: 'center' as const
  },
  cardContent: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px 24px 24px'
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
    fontSize: '12px',
    fontFamily: 'inherit',
    fontWeight: 300,
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
