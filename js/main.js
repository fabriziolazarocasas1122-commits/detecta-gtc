import * as store from './store.js';
import { CONFIG } from './rules.js';
import { sealDemo } from './workflow.js';
import { route } from './portal.js';

store.load();
CONFIG.DM_FIRMA_TODO_ASISTENCIAL = localStorage.getItem('detecta-gtc:dm') === '1';
await sealDemo();
window.addEventListener('hashchange', () => { route(); document.getElementById('main')?.focus({ preventScroll: true }); window.scrollTo(0, 0); });
route();
