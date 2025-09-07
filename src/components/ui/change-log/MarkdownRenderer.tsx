import React from 'react';

interface MarkdownRendererProps {
  content: string;
  primaryColor: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, primaryColor }) => {
  // Basic markdown rendering - for production, consider using a library like marked or remark
  const renderMarkdown = (text: string): string => {
    return text
      // Headers
      .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
      
      // Bold and italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      
      // Strikethrough
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      
      // Code blocks and inline code
      .replace(/```([^`]+)```/g, '<pre class="md-code-block"><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
      
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>')
      
      // Lists (basic implementation)
      .replace(/^\* (.+)$/gm, '<li class="md-li">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="md-li-ordered">$2</li>')
      
      // Blockquotes
      .replace(/^> (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>')
      
      // Horizontal rules
      .replace(/^---$/gm, '<hr class="md-hr" />')
      .replace(/^\*\*\*$/gm, '<hr class="md-hr" />')
      
      // Line breaks
      .replace(/\n/g, '<br />');
  };

  // Clean up list formatting
  const cleanupLists = (html: string): string => {
    // Wrap consecutive <li> elements in <ul>
    return html
      .replace(/(<li class="md-li">.*?<\/li>(\s*<br\s*\/?>)*)+/g, (match) => {
        const items = match.replace(/<br\s*\/?>/g, '');
        return `<ul class="md-ul">${items}</ul>`;
      })
      .replace(/(<li class="md-li-ordered">.*?<\/li>(\s*<br\s*\/?>)*)+/g, (match) => {
        const items = match.replace(/<br\s*\/?>/g, '').replace(/md-li-ordered/g, 'md-li');
        return `<ol class="md-ol">${items}</ol>`;
      });
  };

  const renderedContent = cleanupLists(renderMarkdown(content));

  const containerStyle: React.CSSProperties = {
    lineHeight: '1.6',
    color: '#374151',
    fontSize: '14px',
  };

  // CSS styles for markdown elements
  const markdownStyles = `
    .md-h1 {
      font-size: 20px;
      font-weight: 600;
      color: #1F2937;
      margin: 0 0 12px 0;
      line-height: 1.3;
    }
    
    .md-h2 {
      font-size: 18px;
      font-weight: 600;
      color: #1F2937;
      margin: 16px 0 8px 0;
      line-height: 1.3;
    }
    
    .md-h3 {
      font-size: 16px;
      font-weight: 600;
      color: #1F2937;
      margin: 12px 0 6px 0;
      line-height: 1.3;
    }
    
    .md-code {
      background-color: #F3F4F6;
      color: #DB2777;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      font-size: 13px;
    }
    
    .md-code-block {
      background-color: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 12px 16px;
      margin: 12px 0;
      overflow-x: auto;
    }
    
    .md-code-block code {
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      font-size: 13px;
      color: #374151;
      white-space: pre;
    }
    
    .md-link {
      color: ${primaryColor};
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.2s ease;
    }
    
    .md-link:hover {
      border-bottom-color: ${primaryColor};
    }
    
    .md-ul, .md-ol {
      margin: 8px 0;
      padding-left: 20px;
    }
    
    .md-li {
      margin: 4px 0;
      list-style-type: disc;
    }
    
    .md-blockquote {
      border-left: 3px solid ${primaryColor};
      background-color: #F8FAFC;
      padding: 8px 16px;
      margin: 12px 0;
      font-style: italic;
      color: #6B7280;
    }
    
    .md-hr {
      border: none;
      height: 1px;
      background-color: #E5E7EB;
      margin: 20px 0;
    }
    
    strong {
      font-weight: 600;
      color: #1F2937;
    }
    
    em {
      font-style: italic;
    }
    
    del {
      text-decoration: line-through;
      opacity: 0.7;
    }
  `;

  return (
    <>
      <style>{markdownStyles}</style>
      <div 
        style={containerStyle}
        dangerouslySetInnerHTML={{ __html: renderedContent }}
      />
    </>
  );
};

export default MarkdownRenderer;