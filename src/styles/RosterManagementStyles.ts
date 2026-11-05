
export const rosterStyles = {
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
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%'
  },
  error: {
    color: 'red',
    textAlign: 'center' as const,
    padding: '20px'
  },
  addPilotButton: {
    width: '119px',
    height: '30px',
    background: 'var(--rr-panel)',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s ease-in-out',
    fontFamily: 'inherit',
    fontStyle: 'normal',
    fontWeight: 400,
    fontSize: '20px',
    lineHeight: '24px',
    color: 'var(--rr-text2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};

export const pilotListStyles = {
  container: {
    width: '770px',
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
  statusGroup: {
    position: 'relative' as const,
    textAlign: 'center' as const,
    margin: '20px 0'
  },
  statusDivider: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: '50%',
    height: '1px',
    backgroundColor: 'var(--rr-panel3)'
  },
  statusLabel: {
    position: 'relative' as const,
    backgroundColor: 'var(--rr-panel)',
    padding: '0 16px',
    fontSize: '12px',
    fontFamily: 'inherit',
    fontWeight: 300,
    textTransform: 'uppercase' as const,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px'
  },
  pilotRow: (isSelected: boolean, isHovered: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    height: '24px',
    marginBottom: '10px',
    cursor: 'pointer',
    backgroundColor: isSelected ? 'var(--rr-accent-weak)' : isHovered ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
    transition: 'background-color 0.2s ease',
    borderRadius: '8px',
    padding: '2px 10px',
    gap: '12px'
  }),
  boardNumber: {
    width: '62px',
    textAlign: 'center' as const,
    fontSize: '16px',
    fontWeight: 400,
    color: 'var(--rr-text2)'
  },
  callsign: {
    fontSize: '16px',
    fontWeight: 700,
    flex: '0 0 120px'
  },
  role: {
    fontSize: '16px',
    fontWeight: 300,
    color: 'var(--rr-text2)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  badgeContainer: {
    display: 'flex',
    gap: '4px',
    marginLeft: 'auto',
    height: '24px'
  },
  emptyList: {
    textAlign: 'center' as const,
    color: 'var(--rr-text2)',
    marginTop: '20px'
  }
};

export const pilotDetailsStyles = {
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
    color: 'var(--rr-text2)'
  },
  header: {
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px'
  },
  headerTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--rr-text)',
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    margin: 0
  },
  boardNumber: {
    fontWeight: 400,
    color: 'var(--rr-text2)'
  },
  roleText: {
    fontSize: '18px',
    fontWeight: 400,
    color: 'var(--rr-text2)',
    fontStyle: 'normal'
  },
  sectionTitle: {
    borderBottom: '1px solid var(--rr-border)',
    paddingBottom: '8px'
  },
  fieldContainer: {
    marginBottom: '16px'
  },
  fieldLabel: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--rr-text2)'
  },
  fieldValue: {
    padding: '8px 12px',
    border: '1px solid var(--rr-border2)',
    borderRadius: '6px',
    backgroundColor: 'var(--rr-panel2)',
    fontSize: '14px',
    width: '33%'
  },
  selectorContainer: {
    position: 'relative' as const,
    width: '450px'
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
  selectorArrow: {
    position: 'absolute' as const,
    top: '50%',
    right: '12px',
    transform: 'translateY(-50%)',
    pointerEvents: 'none' as const
  },
  qualContainer: {
    width: '450px'
  },
  qualList: {
    display: 'space-y-2 p-4 border border-gray-200 rounded-md bg-slate-50',
    width: '450px'
  },
  qualItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--rr-border)'
  },
  emptyQualMessage: {
    padding: '16px',
    textAlign: 'center' as const,
    color: 'var(--rr-text3)',
    fontStyle: 'italic'
  },
  filterTab: (isActive: boolean) => ({
    cursor: 'pointer',
    padding: '5px 12px',
    marginRight: '8px',
    borderRadius: '4px',
    backgroundColor: isActive ? 'rgba(249, 115, 22, 0.1)' : 'transparent',
    color: isActive ? '#F97316' : 'var(--rr-text2)'
  })
};

// Status filter tabs
export const statusFilterStyles = {
  container: {
    display: 'flex',
    padding: '5px'
  }
};