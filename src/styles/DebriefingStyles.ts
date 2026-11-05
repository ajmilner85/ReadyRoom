// Mission Debriefing page styles - mirrors RosterManagement pattern

export const debriefingStyles = {
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
    maxWidth: '2009px', // baseWidth * 3 + 20
    margin: '0 auto',
    width: '100%'
  },
  columnsContainer: {
    display: 'flex',
    gap: '20px',
    flex: 1,
    height: 'calc(100vh - 40px)',
    overflow: 'visible'
  }
};

export const missionListStyles = {
  container: {
    width: '663px',
    backgroundColor: 'var(--rr-panel)',
    boxShadow: 'var(--rr-shadow)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    overflow: 'hidden',
    height: 'calc(100vh - 40px)',
    boxSizing: 'border-box' as const
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '2px 10px 0 10px',
    paddingRight: '20px',
  },
  missionRow: (isSelected: boolean, isHovered: boolean) => ({
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '12px 16px',
    marginBottom: '10px',
    cursor: 'pointer',
    backgroundColor: isSelected ? 'var(--rr-accent-weak)' : isHovered ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
    transition: 'background-color 0.2s ease',
    borderRadius: '8px',
    gap: '4px'
  }),
  missionName: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--rr-text)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    marginRight: '8px'
  },
  missionTime: {
    fontSize: '13px',
    fontWeight: 300,
    color: 'var(--rr-text2)'
  },
  outcomeBadge: (outcome: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    backgroundColor:
      outcome === 'success' ? 'rgba(64,168,91,.14)' :
      outcome === 'partial_success' ? '#FEF3C7' :
      outcome === 'failure' ? '#FEE2E2' :
      '#E5E7EB', // pending - grey
    color:
      outcome === 'success' ? 'var(--rr-good)' :
      outcome === 'partial_success' ? '#854D0E' :
      outcome === 'failure' ? '#991B1B' :
      '#6B7280' // pending - darker grey
  }),
  emptyList: {
    textAlign: 'center' as const,
    color: 'var(--rr-text2)',
    marginTop: '20px',
    padding: '40px 20px'
  }
};

export const missionDetailsStyles = {
  container: {
    width: '1326px', // baseWidth * 2
    backgroundColor: 'var(--rr-panel)',
    boxShadow: 'var(--rr-shadow)',
    borderRadius: '8px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    overflowY: 'auto' as const,
    height: 'calc(100vh - 40px)',
    boxSizing: 'border-box' as const
  },
  emptyState: {
    display: 'flex',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--rr-text2)',
    fontSize: '14px'
  },
  header: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--rr-border)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '24px'
  },
  missionName: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--rr-text)',
    marginBottom: '8px'
  },
  missionTime: {
    fontSize: '14px',
    fontWeight: 400,
    color: 'var(--rr-text2)'
  },
  squadronsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px'
  }
};

export const squadronTileStyles = {
  container: {
    backgroundColor: 'var(--rr-panel2)',
    borderRadius: '8px',
    border: '1px solid var(--rr-border)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const
  },
  header: {
    backgroundColor: 'var(--rr-panel2)',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  insignia: {
    width: '32px',
    height: '32px',
    objectFit: 'contain' as const
  },
  squadronDesignation: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--rr-text)',
    marginBottom: '2px'
  },
  squadronName: {
    fontSize: '12px',
    fontWeight: 400,
    color: 'var(--rr-text2)'
  },
  flightsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '12px'
  }
};
