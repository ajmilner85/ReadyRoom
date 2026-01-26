import React from 'react';

interface TestKneeboardProps {
  isDarkMode: boolean;
}

export const TestKneeboard: React.FC<TestKneeboardProps> = ({ isDarkMode }) => {
  const colors = {
    text: isDarkMode ? '#e0e0e0' : '#1a1a1a',
    background: isDarkMode ? '#1a1a2e' : '#ffffff',
    border: isDarkMode ? '#3a3a4e' : '#e0e0e0',
    highlight: isDarkMode ? '#2a2a3e' : '#f5f5f5'
  };

  return (
    <div style={{
      padding: '24px',
      color: colors.text
    }}>
      <h2 style={{
        fontSize: '24px',
        fontWeight: 600,
        marginBottom: '24px',
        textAlign: 'center'
      }}>
        Test Page 2
      </h2>

      <div style={{
        backgroundColor: colors.highlight,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '24px'
      }}>
        <h3 style={{
          fontSize: '18px',
          fontWeight: 600,
          marginBottom: '16px'
        }}>
          Page Navigation Test
        </h3>
        <p style={{
          marginBottom: '12px',
          lineHeight: '1.6'
        }}>
          This is a placeholder page for testing OpenKneeboard page navigation.
        </p>
        <p style={{
          marginBottom: '12px',
          lineHeight: '1.6'
        }}>
          Use the navigation buttons in the header or OpenKneeboard's keyboard shortcuts to navigate between pages.
        </p>
      </div>

      <div style={{
        backgroundColor: colors.highlight,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        padding: '24px'
      }}>
        <h3 style={{
          fontSize: '18px',
          fontWeight: 600,
          marginBottom: '16px'
        }}>
          Test Data
        </h3>
        <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0
        }}>
          {[1, 2, 3, 4, 5].map(num => (
            <li key={num} style={{
              padding: '12px',
              borderBottom: `1px solid ${colors.border}`,
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>Test Item {num}</span>
              <span style={{ opacity: 0.7 }}>Value {num * 10}</span>
            </li>
          ))}
        </ul>
      </div>

      <div style={{
        marginTop: '24px',
        padding: '16px',
        backgroundColor: colors.highlight,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        textAlign: 'center',
        fontSize: '14px',
        opacity: 0.8
      }}>
        Current Theme: {isDarkMode ? 'Dark' : 'Light'}
      </div>
    </div>
  );
};
