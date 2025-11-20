// Mission Debriefing page styles - mirrors RosterManagement pattern

export const debriefingStyles = {
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
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
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
    backgroundColor: isSelected ? '#EFF6FF' : isHovered ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
    transition: 'background-color 0.2s ease',
    borderRadius: '8px',
    gap: '4px'
  }),
  missionName: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#1E293B',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    marginRight: '8px'
  },
  missionTime: {
    fontSize: '13px',
    fontWeight: 300,
    color: '#64748B'
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
      outcome === 'success' ? '#DCFCE7' :
      outcome === 'partial_success' ? '#FEF3C7' :
      outcome === 'failure' ? '#FEE2E2' :
      '#E5E7EB', // pending - grey
    color:
      outcome === 'success' ? '#166534' :
      outcome === 'partial_success' ? '#854D0E' :
      outcome === 'failure' ? '#991B1B' :
      '#6B7280' // pending - darker grey
  }),
  emptyList: {
    textAlign: 'center' as const,
    color: '#64748B',
    marginTop: '20px',
    padding: '40px 20px'
  }
};

export const missionDetailsStyles = {
  container: {
    width: '1326px', // baseWidth * 2
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
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
    color: '#64748B',
    fontSize: '14px'
  },
  header: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #E2E8F0',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '24px'
  },
  missionName: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1E293B',
    marginBottom: '8px'
  },
  missionTime: {
    fontSize: '14px',
    fontWeight: 400,
    color: '#64748B'
  },
  squadronsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px'
  }
};

export const squadronTileStyles = {
  container: {
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const
  },
  header: {
    backgroundColor: '#F8FAFC',
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
    color: '#1E293B',
    marginBottom: '2px'
  },
  squadronName: {
    fontSize: '12px',
    fontWeight: 400,
    color: '#64748B'
  },
  flightsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '12px'
  }
};
