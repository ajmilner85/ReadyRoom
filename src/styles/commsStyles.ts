export const styles = {
    cardBase: {
      width: '100%',
      backgroundColor: 'var(--rr-panel)',
      boxShadow: 'var(--rr-shadow)',
      borderRadius: '8px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column' as const,
      position: 'relative' as const,
      overflowY: 'auto' as const,
      boxSizing: 'border-box' as const,
    },
    sectionHeader: {
      textAlign: 'center' as const,
      marginBottom: '16px',
    },
    headerLabel: {
      fontFamily: 'inherit',
      fontStyle: 'normal',
      fontWeight: 300,
      fontSize: '20px',
      lineHeight: '24px',
      color: 'var(--rr-text2)',
      textTransform: 'uppercase' as const,
    },
    editButton: {
      padding: '4px',
      borderRadius: '4px',
      cursor: 'pointer',
      background: 'var(--rr-panel)',
      boxShadow: 'var(--rr-shadow)',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.1s ease',
      marginLeft: '8px',
      zIndex: 1,
      color: 'var(--rr-text2)',
      width: '24px',
      height: '24px',
    },
    tableCell: {
      fontFamily: 'inherit',
      fontWeight: 400,
      fontSize: '14px',  // Updated from 16px to 14px
      height: '24px', // Matches pilot list
      padding: '0 10px',
      marginBottom: '10px',
    },
    tableCellPlaceholder: {
      color: 'var(--rr-text3)', // Lighter color for placeholder text
    },
    tableHeader: {
      fontFamily: 'inherit',
      fontWeight: 700,
      fontSize: '14px',  // Updated from 16px to 14px
      color: 'var(--rr-text2)',
      padding: '4px 10px',
    },
    tableInput: {
      width: '100%',
      height: '100%',
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontFamily: 'inherit',
      fontWeight: 400,
      fontSize: '14px',  // Updated from 16px to 14px
      padding: '0',
      margin: '0',
    },
    encryptionButton: {
      width: '36px', // 75% of original 48px
      height: '36px',
      backgroundColor: 'var(--rr-panel)',
      color: 'var(--rr-text2)',
      border: '1px solid var(--rr-border2)',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      fontFamily: 'inherit',
      fontSize: '12px', // Reduced from 14px
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '10px', // Added padding at bottom
    },
    encryptionContainer: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '10px', // Additional bottom margin for container
    },
    exportButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      backgroundColor: 'var(--rr-panel)',
      color: 'var(--rr-text2)',
      borderRadius: '8px',
      border: '1px solid var(--rr-border2)',
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      fontFamily: 'inherit',
      fontSize: '14px',
      fontWeight: 400,
    },
  };