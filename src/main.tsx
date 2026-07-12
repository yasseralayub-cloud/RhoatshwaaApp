import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker for Progressive Web App capabilities
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
      .catch((err) => console.warn('Service Worker registration failed:', err));
  });
} else if ('serviceWorker' in navigator) {
  // Also register in dev for testing / preview simulation support
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker registered in dev mode:', reg.scope))
      .catch((err) => console.warn('Service Worker registration failed in dev:', err));
  });
}

