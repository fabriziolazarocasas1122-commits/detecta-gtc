// Capa de datos. Por defecto usa localStorage (ideal para GitHub Pages / demostración).
// Para producción, reemplace load()/persist() por llamadas a una API o a Supabase/Firebase:
// el resto de la aplicación solo usa las funciones exportadas aquí.
import { uid, nowISO, clone } from './util.js';

const KEY = 'detecta-gtc:v2';
let db = null;
const listeners = new Set();

const SEED_USERS = [
  { id: 'u_jefe1', name: 'Rosa Medina Quispe', role: 'jefe', cargo: 'Jefa de Enfermería', area: 'Hospitalización' },
  { id: 'u_jefe2', name: 'Carlos Paredes León', role: 'jefe', cargo: 'Jefe de Logística', area: 'Logística' },
  { id: 'u_da', name: 'Directora Administrativa', role: 'da', cargo: 'Director Administrativo', area: 'Dirección Administrativa' },
  { id: 'u_dm', name: 'Director Médico', role: 'dm', cargo: 'Director Médico', area: 'Dirección Médica' },
  { id: 'u_gg', name: 'Gerente General', role: 'gg', cargo: 'Gerente General', area: 'Gerencia General' },
  { id: 'u_gtc', name: 'Jefe de GTC', role: 'gtc', cargo: 'Jefe de Gestión del Talento y Cultura', area: 'Gestión del Talento y Cultura' },
  { id: 'u_an', name: 'Lucía Torres Ramos', role: 'analista', cargo: 'Analista de Selección', area: 'Gestión del Talento y Cultura' },
  { id: 'u_proc', name: 'Analista de Procesos', role: 'procesos', cargo: 'Analista de Procesos', area: 'Procesos' },
  { id: 'u_col', name: 'Colaborador (tablet de firma)', role: 'colaborador', cargo: 'Colaborador', area: '—' },
];

function empty() {
  return { version: 1, users: clone(SEED_USERS), currentUserId: 'u_jefe1', cases: [], movimientos: [], seq: { RQ: 0, MOV: 0 } };
}

export function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)) || null; } catch { db = null; }
  if (!db) { db = empty(); seedDemo(db); persist(); }
  return db;
}
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error('No se pudo guardar', e); }
  listeners.forEach((fn) => fn(db));
}
export const onChange = (fn) => listeners.add(fn);
export const getDB = () => db;

export const users = () => db.users;
export const currentUser = () => db.users.find((u) => u.id === db.currentUserId) || db.users[0];
export const setCurrentUser = (id) => { db.currentUserId = id; persist(); };
export const userById = (id) => db.users.find((u) => u.id === id);
export function saveUser(u) {
  const i = db.users.findIndex((x) => x.id === u.id);
  if (i >= 0) db.users[i] = u; else db.users.push({ ...u, id: uid('u') });
  persist();
}
export function removeUser(id) { db.users = db.users.filter((u) => u.id !== id); persist(); }

function nextCode(kind) {
  db.seq[kind] = (db.seq[kind] || 0) + 1;
  return `${kind}-${new Date().getFullYear()}-${String(db.seq[kind]).padStart(4, '0')}`;
}

export function createCase(user) {
  const c = {
    id: nextCode('RQ'), createdAt: nowISO(), createdBy: user.id,
    forms: { RQ: { data: {}, signatures: {}, observaciones: [] } },
    fichas: {}, candidatos: [], fechas: {}, estadoFinal: null, timeline: [],
  };
  db.cases.unshift(c);
  log(c, user, 'Creó el requerimiento de personal.');
  persist();
  return c;
}
export const getCase = (id) => db.cases.find((c) => c.id === id);
export function deleteCase(id) { db.cases = db.cases.filter((c) => c.id !== id); persist(); }

export function createMov(user, prefill = {}, casoId = null) {
  const m = { id: nextCode('MOV'), createdAt: nowISO(), createdBy: user.id, casoId, form: { data: prefill, signatures: {}, observaciones: [] }, timeline: [] };
  db.movimientos.unshift(m);
  log(m, user, 'Registró el movimiento interno.');
  persist();
  return m;
}
export const getMov = (id) => db.movimientos.find((m) => m.id === id);

export function log(entity, user, text) {
  entity.timeline = entity.timeline || [];
  entity.timeline.unshift({ at: nowISO(), by: user?.name || 'Sistema', role: user?.role, text });
}

export function exportJSON() { return JSON.stringify(db, null, 2); }
export function importJSON(txt) {
  const parsed = JSON.parse(txt);
  if (!parsed?.users || !parsed?.cases) throw new Error('El archivo no tiene el formato de respaldo de la plataforma.');
  db = parsed; persist();
}
export function resetAll(withDemo = true) { db = empty(); if (withDemo) seedDemo(db); persist(); }

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
