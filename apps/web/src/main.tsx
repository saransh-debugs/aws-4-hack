import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { startApiMocking } from './mocks/browser';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

await startApiMocking();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
