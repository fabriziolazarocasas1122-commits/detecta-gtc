import * as store from './store.js';
import { CONFIG } from './rules.js';
import { sealDemo } from './workflow.js';
import { route, startLiveOnce } from './portal.js';

await store.load();
if (store.REMOTE) {
  const s = store.getDB()?.settings || {};
  CONFIG.DM_FIRMA_TODO_ASISTENCIAL = s.DM_FIRMA_TODO_ASISTENCIAL === true;
} else {
  CONFIG.DM_FIRMA_TODO_ASISTENCIAL = localStorage.getItem('detecta-gtc:dm') === '1';
  await sealDemo();
}
window.addEventListener('hashchange', () => { route(); document.getElementById('main')?.focus({ preventScroll: true }); window.scrollTo(0, 0); });
route();
startLiveOnce();
// Antes de cerrar la pestaña, intenta enviar lo pendiente
window.addEventListener('beforeunload', (e) => {
  const st = document.getElementById('savestate')?.dataset.state;
  if (store.REMOTE && (st === 'saving' || st === 'error')) { store.flush(); e.preventDefault(); e.returnValue = ''; }
});
