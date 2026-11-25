import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';
import App from './App';
import { initAnalytics } from './lib/analytics';
import { declareCanonical } from './lib/embed';

initAnalytics();
declareCanonical();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
