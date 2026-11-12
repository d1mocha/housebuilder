import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { useProject } from './store/projectStore';
import { useUi } from './store/uiStore';

// Отладочный доступ к хранилищам (используется e2e-сценариями).
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__hb = { useProject, useUi };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
