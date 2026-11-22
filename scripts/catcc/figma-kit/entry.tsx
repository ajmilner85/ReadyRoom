// The CATCC kit page on its own (no sign-in, no app shell), for the Figma generator's headless Chromium:
// scripts/catcc/figma-kit.gen.ts serves it from its own Vite server. The app's global CSS first, as main.tsx loads it.
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import CatccKit from '../../../src/components/catcc/kit/CatccKit.tsx';

createRoot(document.getElementById('root')!).render(<CatccKit />);
