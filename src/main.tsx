import { createRoot } from 'react-dom/client';
import { VaultProvider } from './features/vault/VaultProvider';
import { App } from './App';
import { WorkbenchUI } from './shared/WorkbenchUI';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <WorkbenchUI>
    <VaultProvider>
      <App />
    </VaultProvider>
  </WorkbenchUI>,
);
