import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { WebsiteIntro } from './components/WebsiteIntro/WebsiteIntro';
import './index.css';

/*
 * Both flags opt in to v7 behaviour that React Router 6 already implements
 * behind them: state updates wrapped in `React.startTransition`, and relative
 * paths inside splat routes resolving against the splat rather than its parent.
 * Opting in now silences the upgrade warnings and means the eventual move to
 * v7 is a version bump rather than a behaviour change.
 */
const future = { v7_startTransition: true, v7_relativeSplatPath: true };

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Outside the router and every provider: nothing the shop re-renders can
        remount it, so it plays once per session and never again. */}
    <WebsiteIntro />
    <BrowserRouter future={future}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
