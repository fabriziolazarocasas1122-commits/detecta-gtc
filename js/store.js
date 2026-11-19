// Capa de datos.
// · Modo demostración (sin configurar js/config.js): todo se guarda en este navegador.
// · Modo producción (con Supabase configurado): los datos viven en la base de datos compartida,
//   el inicio de sesión lo valida el servidor y las reglas de acceso se aplican allí.
// El resto de la aplicación solo usa las funciones exportadas aquí.
import { uid, nowISO, clone, hashOf, toast } from './util.js';
import * as backend from './backend.js';

export const REMOTE = backend.REMOTE;
const KEY = 'detecta-gtc:v4';
const SESSION = 'detecta-gtc:sesion';
export const DEMO_PASSWORD = 'Detecta2026';
let db = null;
const listeners = new Set();

const SEED_USERS = [
  { id: 'u_jefe1', username: 'rmedina', passHash: '08336d0aba5126b9b5e922691e53e4235e6a15fb71ba1bdf4ec43bbafbae3d21', name: 'Rosa Medina Quispe', role: 'jefe', cargo: 'Jefa de Enfermería', area: 'Hospitalización' },
  { id: 'u_jefe2', username: 'cparedes', passHash: '87706073b51adf0535d79bf531d922c54872aa7e0d4f6479cd9523580fd0c237', name: 'Carlos Paredes León', role: 'jefe', cargo: 'Jefe de Logística', area: 'Logística' },
  { id: 'u_da', username: 'dadministrativa', passHash: 'c0ec11d9cce7601b1acea8c89f439f1e767fd93aa3c1b952fe8cdee1a6fdedf7', name: 'Mónica Salas Ríos', role: 'da', cargo: 'Director Administrativo', area: 'Dirección Administrativa' },
  { id: 'u_dm', username: 'dmedica', passHash: '4f67d3b4c44d3ccf9e17e4769c1bb503715ab9b0709019d09330e039b005ede1', name: 'Luis Salazar Peña', role: 'dm', cargo: 'Director Médico', area: 'Dirección Médica' },
  { id: 'u_gg', username: 'ggeneral', passHash: '5e1a277358e30ad4790aa5f6634d582f9fbdbfef6298a2017c411df7bc97537b', name: 'Jorge Ramírez Castro', role: 'gg', cargo: 'Gerente General', area: 'Gerencia General' },
  { id: 'u_gtc', username: 'jefegtc', passHash: '5479f205c83dc95ffb60f350bbb729d75dc38bfbd7f55e86688901c3e19009e5', name: 'Andrea Vílchez Soto', role: 'gtc', cargo: 'Jefe de Gestión del Talento y Cultura', area: 'Gestión del Talento y Cultura' },
  { id: 'u_an', username: 'analista', passHash: '3fd0a8c21b4adef7a92890453f529121ec3a68883f0e28f5140dce0ff4916f81', name: 'Lucía Torres Ramos', role: 'analista', cargo: 'Analista de Selección', area: 'Gestión del Talento y Cultura' },
  { id: 'u_proc', username: 'procesos', passHash: 'e404bc7a28be7a589adee7665535d1a179f2427cff739c07a782f82d0f8f5d8e', name: 'Diego Huamán Cruz', role: 'procesos', cargo: 'Analista de Procesos', area: 'Procesos' },
  { id: 'u_col', username: 'colaborador', passHash: '80f96f27d0e1688bc57026fb8f70eb4d25ad0984947c46da9b3b803b211d4ba6', name: 'Pedro Lima Vargas', role: 'colaborador', cargo: 'Colaborador', area: '—' },
];

function empty(withUsers = true) {
  return { version: 1, users: withUsers ? clone(SEED_USERS) : [], cases: [], movimientos: [], seq: { RQ: 0, MOV: 0 }, settings: {} };
}

/* ───────── Estado de sincronización (modo producción) ───────── */
const versions = new Map();   // "case:RQ-2026-0001" → versión en el servidor
const synced = new Map();     // "case:RQ-2026-0001" → JSON del último guardado
const keyOf = (kind, id) => `${kind}:${id}`;
let syncTimer = null;
let syncing = false;
let remoteListener = null;

function setSaveState(text, kind = '') {
  const el = document.getElementById('savestate');
  if (el) { el.textContent = text; el.dataset.state = kind; }
}

function adopt(kind, item) {
  versions.set(keyOf(kind, item.obj.id), item.version);
  synced.set(keyOf(kind, item.obj.id), JSON.stringify(item.obj));
  return item.obj;
}

async function loadRemote() {
  const uidNow = await backend.sessionUserId();
  if (!uidNow) { db = empty(false); sessionId = null; return db; }
  const all = await backend.loadAll();
  versions.clear(); synced.clear();
  db = { version: 1, users: all.users, settings: all.settings, seq: {},
    cases: all.cases.map((it) => adopt('case', it)),
    movimientos: all.movimientos.map((it) => adopt('mov', it)) };
  sessionId = uidNow;
  return db;
}

export async function load() {
  if (REMOTE) {
    try { await loadRemote(); } catch (e) { db = empty(false); sessionId = null; console.error(e); toast(backend.friendly(e), 'warn'); }
    return db;
  }
  try { db = JSON.parse(localStorage.getItem(KEY)) || null; } catch { db = null; }
  if (!db) { db = empty(); seedDemo(db); persist(); }
  return db;
}

export function persist() {
  if (REMOTE) { scheduleSync(); }
  else {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error('No se pudo guardar', e); }
  }
  listeners.forEach((fn) => fn(db));
}

function scheduleSync(delay = 700) {
  clearTimeout(syncTimer);
  setSaveState('Guardando…', 'saving');
  syncTimer = setTimeout(syncNow, delay);
}

// Copia en el objeto local la hora oficial que el servidor puso a las firmas nuevas
function patchServerSignatures(local, server) {
  const forms = (o) => [...Object.entries(o?.forms || {}).map(([k, f]) => ['forms.' + k, f]), ...Object.entries(o?.fichas || {}).map(([k, f]) => ['fichas.' + k, f]), ...(o?.form ? [['form', o.form]] : [])];
  const srv = new Map(forms(server));
  for (const [k, f] of forms(local)) {
    const sf = srv.get(k);
    for (const [sk, sig] of Object.entries(f?.signatures || {})) {
      const ss = sf?.signatures?.[sk];
      if (ss && ss.at) { sig.at = ss.at; sig.name = ss.name; sig.cargo = ss.cargo; sig.server = true; }
    }
  }
}

async function syncNow() {
  if (!REMOTE || !db || !sessionId) return true;
  if (syncing) { await new Promise((r) => setTimeout(r, 300)); return syncNow(); }
  syncing = true;
  let failed = false;
  try {
    for (const [kind, list] of [['case', db.cases], ['mov', db.movimientos]]) {
      for (const obj of list) {
        const k = keyOf(kind, obj.id);
        const json = JSON.stringify(obj);
        if (synced.get(k) === json) continue;
        try {
          const row = versions.has(k) ? await backend.updateEntity(kind, obj, versions.get(k)) : await backend.insertEntity(kind, obj);
          versions.set(k, row.version);
          patchServerSignatures(obj, row.data);
          synced.set(k, JSON.stringify(obj));
        } catch (e) {
          failed = true;
          const msg = String(e?.message || e);
          if (/conflicto_version|firma_protegida|firma_ajena|proceso_cerrado|row-level/.test(msg)) {
            toast(backend.friendly(e), 'warn');
            await refreshEntity(kind, obj.id);
          } else {
            setSaveState('Sin conexión: reintentando…', 'error');
            setTimeout(() => scheduleSync(0), 5000);
            return false;
          }
        }
      }
    }
    setSaveState(failed ? 'Se recargó la versión más reciente' : `Guardado ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`, failed ? 'warn' : 'ok');
    return !failed;
  } finally { syncing = false; }
}

// Espera a que los cambios pendientes lleguen al servidor (por ejemplo, después de firmar)
export async function flush() {
  if (!REMOTE) return true;
  clearTimeout(syncTimer);
  return syncNow();
}

async function refreshEntity(kind, id) {
  const item = await backend.fetchEntity(kind, id);
  const list = kind === 'case' ? db.cases : db.movimientos;
  const i = list.findIndex((x) => x.id === id);
  if (!item) { if (i >= 0) list.splice(i, 1); versions.delete(keyOf(kind, id)); synced.delete(keyOf(kind, id)); }
  else { const obj = adopt(kind, item); if (i >= 0) list[i] = obj; else list.unshift(obj); }
  remoteListener?.();
}

// Cambios de otras personas: se recargan si no hay ediciones locales pendientes
export async function startLive(onRemote) {
  remoteListener = onRemote;
  if (!REMOTE) return;
  await backend.subscribe(async (kind, id) => {
    const k = keyOf(kind, id);
    const list = kind === 'case' ? db.cases : db.movimientos;
    const local = list.find((x) => x.id === id);
    if (local && synced.get(k) !== JSON.stringify(local)) return; // hay cambios propios sin guardar
    await refreshEntity(kind, id);
  });
}

export const onChange = (fn) => listeners.add(fn);
export const getDB = () => db;
export const users = () => db.users;

/* ───────── Sesión ───────── */
let sessionId = null;
if (!REMOTE) { try { sessionId = sessionStorage.getItem(SESSION); } catch { sessionId = null; } }
export const currentUser = () => (sessionId && db?.users.find((u) => u.id === sessionId && !u.disabled)) || null;
export const passHashFor = (username, password) => hashOf({ u: String(username).trim().toLowerCase(), p: password });

// Devuelve el usuario o lanza un Error con un mensaje claro
export async function login(username, password) {
  let un = String(username || '').trim().toLowerCase();
  if (REMOTE) {
    try { await backend.signIn(un, password); } catch (e) { throw new Error(backend.friendly(e)); }
    await loadRemote();
    const u = currentUser();
    if (!u) { await backend.signOut(); db = empty(false); sessionId = null; throw new Error('Tu usuario no tiene un perfil activo en la plataforma. Comunícate con la Jefatura de GTC.'); }
    return u;
  }
  const ALIAS = { ltorres: 'analista', itorres: 'analista' };
  if (ALIAS[un] && db.users.some((x) => x.username === ALIAS[un])) un = ALIAS[un];
  const u = db.users.find((x) => (x.username || '').toLowerCase() === un);
  if (!u || u.disabled || (await passHashFor(un, password)) !== u.passHash) throw new Error('Usuario o contraseña incorrectos. Revisa que el usuario esté bien escrito y vuelve a intentarlo.');
  sessionId = u.id;
  try { sessionStorage.setItem(SESSION, u.id); } catch { /* sin almacenamiento */ }
  return u;
}

export async function logout() {
  if (REMOTE) {
    await flush().catch(() => {});
    try { await backend.signOut(); } catch { /* ya cerrada */ }
    db = empty(false); versions.clear(); synced.clear();
  }
  sessionId = null;
  try { sessionStorage.removeItem(SESSION); } catch { /* */ }
}

export async function checkPassword(u, password) {
  if (REMOTE) return backend.verifyPassword(u.username, password);
  return (await passHashFor(u.username, password)) === userById(u.id)?.passHash;
}

// Cambio de la propia contraseña
export async function changeMyPassword(password) {
  const u = currentUser();
  if (REMOTE) { await backend.changeMyPassword(password); u.mustChange = false; return; }
  u.passHash = await passHashFor(u.username, password); u.mustChange = false; persist();
}

export const userById = (id) => db.users.find((u) => u.id === id);

export async function saveMyFirma(img) {
  const u = currentUser();
  u.firma = img;
  if (REMOTE) { try { await backend.saveMyFirma(img); } catch (e) { toast(backend.friendly(e), 'warn'); } }
  else persist();
}

/* ───────── Administración de usuarios (Jefatura de GTC) ───────── */
export async function adminCreateUser({ username, name, cargo, role, area = '', password }) {
  if (REMOTE) { await backend.adminUsers('create', { username, name, cargo, role, area, password }); await reloadUsers(); return; }
  if (db.users.some((x) => x.username === username)) throw new Error('Ese usuario ya existe.');
  db.users.push({ id: uid('u'), username, name, cargo, role, area, passHash: await passHashFor(username, password), mustChange: true });
  persist();
}
export async function adminUpdateUser(id, patch) {
  if (REMOTE) { await backend.adminUsers('update', { id, ...patch }); await reloadUsers(); return; }
  Object.assign(userById(id), patch); persist();
}
export async function adminResetPassword(id, password) {
  if (REMOTE) { await backend.adminUsers('reset_password', { id, password }); await reloadUsers(); return; }
  const u = userById(id); u.passHash = await passHashFor(u.username, password); u.mustChange = true; persist();
}
export async function adminSetActive(id, active) {
  if (REMOTE) { await backend.adminUsers('set_active', { id, active }); await reloadUsers(); return; }
  const u = userById(id); u.disabled = !active; persist();
}
async function reloadUsers() { const all = await backend.loadAll(); db.users = all.users; }

export async function saveSetting(key, value) {
  db.settings = db.settings || {}; db.settings[key] = value;
  if (REMOTE) await backend.saveSetting(key, value); else persist();
}

/* ───────── Expedientes y movimientos ───────── */
async function nextCode(kind) {
  if (REMOTE) return backend.nextCode(kind);
  db.seq[kind] = (db.seq[kind] || 0) + 1;
  return `${kind}-${new Date().getFullYear()}-${String(db.seq[kind]).padStart(4, '0')}`;
}

export async function createCase(user) {
  const c = {
    id: await nextCode('RQ'), createdAt: nowISO(), createdBy: user.id,
    forms: { RQ: { data: {}, signatures: {}, observaciones: [] } },
    fichas: {}, candidatos: [], fechas: {}, estadoFinal: null, timeline: [],
  };
  log(c, user, 'Creó el requerimiento de personal.');
  db.cases.unshift(c);
  if (REMOTE) await flush(); else persist();
  return c;
}
export const getCase = (id) => db.cases.find((c) => c.id === id);

export async function createMov(user, prefill = {}, casoId = null) {
  const m = { id: await nextCode('MOV'), createdAt: nowISO(), createdBy: user.id, casoId, form: { data: prefill, signatures: {}, observaciones: [] }, timeline: [] };
  log(m, user, 'Registró el movimiento interno.');
  db.movimientos.unshift(m);
  if (REMOTE) await flush(); else persist();
  return m;
}
export const getMov = (id) => db.movimientos.find((m) => m.id === id);

export function log(entity, user, text) {
  entity.timeline = entity.timeline || [];
  entity.timeline.unshift({ at: nowISO(), by: user?.name || 'Sistema', role: user?.role, text });
}

export function exportJSON() {
  const safe = { ...db, users: db.users.map(({ passHash, firma, ...u }) => u) };
  return JSON.stringify(safe, null, 2);
}
export function importJSON(txt) {
  if (REMOTE) throw new Error('En la versión conectada a la base de datos no se importan respaldos desde aquí.');
  const parsed = JSON.parse(txt);
  if (!parsed?.users || !parsed?.cases) throw new Error('El archivo no tiene el formato de respaldo de la plataforma.');
  db = parsed; persist();
}
export function resetAll(withDemo = true) { if (REMOTE) return; db = empty(); if (withDemo) seedDemo(db); persist(); }

/* ─────────── Datos de demostración ─────────── */
function demoSignature(name) {
  const c = document.createElement('canvas'); c.width = 420; c.height = 140;
  const g = c.getContext('2d');
  g.strokeStyle = '#1b4f72'; g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath();
  let x = 30; const base = 85;
  g.moveTo(x, base);
  for (const ch of name.slice(0, 14)) {
    const k = ch.charCodeAt(0);
    g.bezierCurveTo(x + 6, base - 30 - (k % 25), x + 14, base + 12, x + 22, base - (k % 18));
    x += 22;
  }
  g.stroke();
  g.beginPath(); g.moveTo(40, base + 22); g.quadraticCurveTo(200, base + 6, x, base + 18); g.stroke();
  return c.toDataURL('image/png');
}

function seedDemo(d) {
  const t = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const sig = (u, extra = {}) => ({ userId: u.id, name: u.name, cargo: u.cargo, role: u.role, at: t(extra.daysAgo ?? 1), img: demoSignature(u.name), hash: 'demo', decision: extra.decision, comment: extra.comment });
  const U = Object.fromEntries(d.users.map((u) => [u.id, u]));

  // Caso 1: reemplazo asistencial, en borrador parcial para que el solicitante lo complete
  d.seq.RQ = 2;
  d.cases.push({
    id: `RQ-${new Date().getFullYear()}-0002`, createdAt: t(0.2), createdBy: 'u_jefe1',
    forms: { RQ: { data: {
      tipo_contrato: 'Contrato D.L. 728 (5ta)', modalidad_ingreso: 'Contrato', categoria: 'Asistencial', motivo: 'reemplazo', atraccion: 'Mixta',
      puesto: 'Enfermera de hospitalización', area: 'Hospitalización', reemplaza_nombre: 'Ana Gutiérrez Soto', motivo_reemplazo: 'Cese',
      jefe_nombre: U.u_jefe1.name, jefe_puesto: U.u_jefe1.cargo,
    }, signatures: {}, observaciones: [] } },
    fichas: {}, fechas: {}, estadoFinal: null,
    timeline: [{ at: t(0.2), by: U.u_jefe1.name, role: 'jefe', text: 'Creó el requerimiento de personal.' }],
  });

  // Caso 2: ampliación administrativa, aprobada por DA, pendiente de Gerencia General
  d.cases.push({
    id: `RQ-${new Date().getFullYear()}-0001`, createdAt: t(3), createdBy: 'u_jefe2',
    forms: { RQ: { data: {
      tipo_contrato: 'Contrato D.L. 728 (5ta)', modalidad_ingreso: 'Contrato', categoria: 'Administrativo', motivo: 'ampliacion', atraccion: 'Externa',
      puesto: 'Asistente de almacén', area: 'Logística', fecha_inicio: new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10), sistema_trabajo: '48 horas a la semana',
      jefe_nombre: U.u_jefe2.name, jefe_puesto: U.u_jefe2.cargo,
      justificacion: 'El volumen de despachos a farmacia y hospitalización creció 38 % en el último semestre; hoy un solo asistente cubre recepción y despacho, con 14 horas extra semanales en promedio.',
      profesion: 'Técnico en logística o administración', experiencia_min: '1 año en almacén de salud', especialidad: '', oficina: 'Almacén central, sótano 1',
      equipos: { PC: 'Se requiere', Laptop: 'No se requiere', 'Teléfono (anexo oficina)': 'Se requiere', 'Teléfono celular': 'No se requiere', 'Sello de V°B': 'No se requiere', 'Sello para informes': 'No se requiere' },
    }, signatures: { solicitante: sig(U.u_jefe2, { daysAgo: 3 }), director: sig(U.u_da, { daysAgo: 2, decision: 'Aprobado', comment: 'Sustento conforme con indicadores de despacho.' }) }, observaciones: [] } },
    fichas: {}, fechas: {}, estadoFinal: null,
    timeline: [
      { at: t(2), by: U.u_da.name, role: 'da', text: 'Firmó como Dirección Administrativa: Aprobado.' },
      { at: t(3), by: U.u_jefe2.name, role: 'jefe', text: 'Firmó como Solicitante.' },
      { at: t(3), by: U.u_jefe2.name, role: 'jefe', text: 'Creó el requerimiento de personal.' },
    ],
  });
}
