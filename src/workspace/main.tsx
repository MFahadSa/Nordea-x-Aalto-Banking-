import React from 'react';
import { createRoot } from 'react-dom/client';
import './workspace.css';
import { Workspace } from './Workspace.js';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Workspace /></React.StrictMode>);
