// Adaptador de Supabase: inicio de sesión, lectura y guardado en la base de datos compartida.
import { SUPABASE_URL, SUPABASE_ANON_KEY, USER_EMAIL_DOMAIN } from './config.js';

export const REMOTE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let sb = null;

async function client() {
  if (!REMOTE) throw new Error('La base de datos no está configurada.');
  if (!sb) {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'detecta-gtc-auth' } });
  }
  return sb;
}

const emailOf = (username) => `${String(username || '').trim().toLowerCase()}@${USER_EMAIL_DOMAIN}`;

// Traduce los errores del servidor a mensajes claros
export function friendly(err) {
  const m = String(err?.message || err || '');
  if (/conflicto_version/.test(m)) return 'Otra persona guardó este documento mientras lo editabas. Se cargó la versión más reciente.';
  if (/firma_protegida|firma_ajena|proceso_cerrado|Solo la Jefatura/.test(m)) return m.replace(/^.*?(firma_protegida|firma_ajena|proceso_cerrado):\s*/, '');
  if (/Invalid login credentials/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if (/banned|User is banned/i.test(m)) return 'Esta cuenta está desactivada. Comunícate con la Jefatura de GTC.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión con el servidor. Revisa tu internet; tus cambios se guardarán al reconectar.';
  if (/row-level security/i.test(m)) return 'No tienes permiso para guardar este documento.';
  return m || 'Ocurrió un error inesperado.';
}

export async function signIn(username, password) {
  const c = await client();
  const { data, error } = await c.auth.signInWithPassword({ email: emailOf(username), password });
  if (error) throw error;
  return data.user;
}
export async function signOut() { const c = await client(); await c.auth.signOut(); }
export async function sessionUserId() {
  const c = await client();
  const { data } = await c.auth.getSession();
  return data?.session?.user?.id || null;
}
export async function verifyPassword(username, password) {
  try { await signIn(username, password); return true; } catch { return false; }
}
export async function changeMyPassword(password) {
  const c = await client();
  const { error } = await c.auth.updateUser({ password });
  if (error) throw error;
  const uid = await sessionUserId();
  const { error: e2 } = await c.from('profiles').update({ must_change: false }).eq('id', uid);
  if (e2) throw e2;
}

const mapProfile = (p) => ({ id: p.id, username: p.username, name: p.name, cargo: p.cargo, role: p.role, area: p.area, firma: p.firma || null, mustChange: p.must_change, disabled: !p.active });

export async function loadAll() {
  const c = await client();
  const [pr, cs, mv, st] = await Promise.all([
    c.from('profiles').select('*').order('name'),
    c.from('cases').select('id, data, version, created_by').order('created_at', { ascending: false }),
    c.from('movimientos').select('id, data, version, created_by').order('created_at', { ascending: false }),
    c.from('settings').select('*'),
  ]);
  for (const r of [pr, cs, mv, st]) if (r.error) throw r.error;
  return {
    users: pr.data.map(mapProfile),
    cases: cs.data.map((r) => ({ obj: { ...r.data, id: r.id, createdBy: r.created_by }, version: r.version })),
    movimientos: mv.data.map((r) => ({ obj: { ...r.data, id: r.id, createdBy: r.created_by }, version: r.version })),
    settings: Object.fromEntries(st.data.map((s) => [s.key, s.value])),
  };
}

export async function nextCode(kind) {
  const c = await client();
  const { data, error } = await c.rpc('next_code', { p_kind: kind });
  if (error) throw error;
  return data;
}

const table = (kind) => (kind === 'case' ? 'cases' : 'movimientos');

export async function insertEntity(kind, obj) {
  const c = await client();
  const row = { id: obj.id, created_by: obj.createdBy, data: obj };
  if (kind === 'mov' && obj.casoId) row.caso_id = obj.casoId;
  const { data, error } = await c.from(table(kind)).insert(row).select('id, data, version').single();
  if (error) throw error;
  return data;
}

export async function updateEntity(kind, obj, version) {
  const c = await client();
  const { data, error } = await c.from(table(kind)).update({ data: obj, version }).eq('id', obj.id).select('id, data, version').single();
  if (error) throw error;
  return data;
}

export async function fetchEntity(kind, id) {
  const c = await client();
  const { data, error } = await c.from(table(kind)).select('id, data, version, created_by').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? { obj: { ...data.data, id: data.id, createdBy: data.created_by }, version: data.version } : null;
}

export async function saveMyFirma(img) {
  const c = await client();
  const uid = await sessionUserId();
  const { error } = await c.from('profiles').update({ firma: img }).eq('id', uid);
  if (error) throw error;
}

export async function saveSetting(key, value) {
  const c = await client();
  const { error } = await c.from('settings').update({ value }).eq('key', key);
  if (error) throw error;
}

export async function adminUsers(action, payload) {
  const c = await client();
  const { data, error } = await c.functions.invoke('admin-users', { body: { action, ...payload } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* sin detalle */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Cambios hechos por otras personas, en vivo
export async function subscribe(onChange) {
  const c = await client();
  const me = await sessionUserId();
  const ch = c.channel('gtc-cambios');
  for (const t of ['cases', 'movimientos']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (payload) => {
      const row = payload.new;
      if (!row?.id || row.updated_by === me) return;
      onChange(t === 'cases' ? 'case' : 'mov', row.id);
    });
  }
  ch.subscribe();
  return () => c.removeChannel(ch);
}
