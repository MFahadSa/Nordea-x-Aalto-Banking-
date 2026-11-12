import React from 'react';
import { createRoot } from 'react-dom/client';
import './glasses.css';
import { Glasses } from './Glasses.js';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Glasses /></React.StrictMode>);
