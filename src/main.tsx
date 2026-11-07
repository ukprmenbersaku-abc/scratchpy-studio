import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import EducationApp from './education/EducationApp';
import './app/styles.css';
import './education/education.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {import.meta.env.VITE_APP_EDUCATION === 'true' ? <EducationApp /> : <App />}
  </React.StrictMode>,
);
