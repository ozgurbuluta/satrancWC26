import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
// The title's typeface, served from this site (SIL Open Font License). Only the weight axis: two small files.
import '@fontsource-variable/fraunces/wght.css';
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
