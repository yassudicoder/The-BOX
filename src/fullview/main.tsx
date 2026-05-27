import React from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace } from './App';
import '../sidepanel/styles.css';

const el = document.getElementById('root');
if (el) createRoot(el).render(<Workspace />);
