export const styles = {
    cardBase: {
      width: '100%',
      backgroundColor: '#FFFFFF',
      boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
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
      fontFamily: 'Inter',
      fontStyle: 'normal',
      fontWeight: 300,
      fontSize: '20px',
      lineHeight: '24px',
      color: '#64748B',
      textTransform: 'uppercase' as const,
    },
    editButton: {
      padding: '4px',
      borderRadius: '4px',
      cursor: 'pointer',
      background: 'white',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.1s ease',
      marginLeft: '8px',
      zIndex: 1,
      color: '#64748B',
      width: '24px',
      height: '24px',
    },
    tableCell: {
      fontFamily: 'Inter',
      fontWeight: 400,
      fontSize: '14px',  // Updated from 16px to 14px
      height: '24px', // Matches pilot list
      padding: '0 10px',
      marginBottom: '10px',
    },
    tableCellPlaceholder: {
      color: '#94A3B8', // Lighter color for placeholder text
    },
    tableHeader: {
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: '14px',  // Updated from 16px to 14px
      color: '#646F7E',
      padding: '4px 10px',
    },
    tableInput: {
      width: '100%',
      height: '100%',
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontFamily: 'Inter',
      fontWeight: 400,
      fontSize: '14px',  // Updated from 16px to 14px
      padding: '0',
      margin: '0',
    },
    encryptionButton: {
      width: '36px', // 75% of original 48px
      height: '36px',
      backgroundColor: '#FFFFFF',
      color: '#64748B',
      border: '1px solid #CBD5E1',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      fontFamily: 'Inter',
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
      backgroundColor: '#FFFFFF',
      color: '#64748B',
      borderRadius: '8px',
      border: '1px solid #CBD5E1',
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      fontFamily: 'Inter',
      fontSize: '14px',
      fontWeight: 400,
    },
  };