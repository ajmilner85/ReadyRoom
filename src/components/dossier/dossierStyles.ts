// Shared styles for the Pilot Dossier page. Card, shadow and header treatments
// are copied from Roster Management / Events Management for consistency.

export const dossierStyles = {
  container: {
    backgroundColor: '#F0F4F8',
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
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
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
    fontFamily: 'Inter',
    fontStyle: 'normal' as const,
    fontWeight: 300,
    fontSize: '20px',
    lineHeight: '24px',
    color: '#64748B',
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
    color: '#64748B'
  },
  fieldValue: {
    fontSize: '14px',
    color: '#0F172A'
  },
  sectionLabel: {
    fontSize: '12px',
    fontFamily: 'Inter',
    fontWeight: 300,
    textTransform: 'uppercase' as const,
    color: '#64748B',
    borderBottom: '1px solid #E2E8F0',
    paddingBottom: '8px',
    marginBottom: '12px',
    marginTop: '24px'
  },
  selector: {
    width: '100%',
    padding: '8px 12px',
    paddingRight: '32px',
    border: '1px solid #CBD5E1',
    borderRadius: '6px',
    backgroundColor: '#F8FAFC',
    fontSize: '14px',
    appearance: 'none' as const,
    cursor: 'pointer'
  },
  emptyState: {
    display: 'flex',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748B',
    fontSize: '14px',
    textAlign: 'center' as const
  }
};

export function formatDossierDate(date: string | null | undefined): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
