import { createRoot } from 'react-dom/client';
import { VaultProvider } from './features/vault/VaultProvider';
import { App } from './App';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <VaultProvider>
    <App />
  </VaultProvider>,
);
