/**
 * Kneeboard page for developers only (access_developer_settings): the current DCS test script, the same file the
 * USB installer puts on the stick (catcc-dcs/usb/TEST-SCRIPT.md), so it can be read in game through OpenKneeboard.
 * The page is only listed for developers; the text itself is part of the app's code, so it holds nothing private.
 */
import React from 'react';
import MarkdownRenderer from '../ui/change-log/MarkdownRenderer';
import script from '../../../catcc-dcs/usb/TEST-SCRIPT.md?raw';

interface Props {
  colors: { text: string; textSecondary: string; accent: string };
}

const TestScriptKneeboard: React.FC<Props> = ({ colors }) => (
  // (the renderer's sizes are the app's; the kneeboard page is 1358 px wide, read at arm's length)
  <div style={{ zoom: 1.6 }}>
    <MarkdownRenderer content={script} primaryColor={colors.accent} headingColor={colors.text} textColor={colors.text} />
  </div>
);

export default TestScriptKneeboard;
