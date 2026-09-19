import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { resolvePreferredEndpoint } from './netPrefer';

async function boot() {
  const root = document.getElementById('root')!;
  root.innerHTML = '<div class="auth-page">正在优选网络（局域网优先）…</div>';
  try {
    await resolvePreferredEndpoint();
  } catch {
    /* ignore */
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();
