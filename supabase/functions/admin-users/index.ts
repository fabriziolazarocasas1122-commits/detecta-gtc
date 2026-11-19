// Supabase Edge Function: administración de usuarios de la Plataforma GTC.
// Solo la Jefatura de GTC (rol "gtc", activo) puede usarla.
// Despliegue: Supabase → Edge Functions → Deploy a new function → Via Editor →
//   nombre: admin-users → pegar este archivo → Deploy.
// Variables que Supabase ya entrega a la función: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Opcional: USER_EMAIL_DOMAIN (debe coincidir con js/config.js).
import { createClient } from 'npm:@supabase/supabase-js@2';

const DOMAIN = Deno.env.get('USER_EMAIL_DOMAIN') || 'usuarios.detecta-gtc.local';
const ROLES = ['jefe', 'da', 'dm', 'gg', 'gtc', 'analista', 'procesos', 'colaborador'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Método no permitido', 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // 1. ¿Quién llama?
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail('Inicia sesión para continuar.', 401);
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return fail('Sesión no válida. Vuelve a iniciar sesión.', 401);
  const { data: caller } = await admin.from('profiles').select('id, role, active').eq('id', who.user.id).single();
  if (!caller || caller.role !== 'gtc' || !caller.active) return fail('Solo la Jefatura de GTC puede administrar usuarios.', 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Solicitud no válida.'); }
  const action = String(body.action || '');

  const cleanUser = (v: unknown) => String(v || '').trim().toLowerCase();
  const validPass = (p: unknown) => typeof p === 'string' && p.length >= 8;
  const audit = (detail: Record<string, unknown>) =>
    admin.from('audit_log').insert({ user_id: caller.id, entity: 'profiles', entity_id: String(detail.username || detail.id || ''), action: `usuario_${action}`, detail });

  try {
    if (action === 'create') {
      const username = cleanUser(body.username);
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail('El usuario debe tener de 3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.');
      if (!ROLES.includes(String(body.role))) return fail('Portal no válido.');
      if (!validPass(body.password)) return fail('La contraseña inicial debe tener al menos 8 caracteres.');
      const name = String(body.name || '').trim();
      if (name.length < 5) return fail('Escribe el nombre completo.');
      const { data: exists } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
      if (exists) return fail('Ese usuario ya existe.');
      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${username}@${DOMAIN}`, password: String(body.password), email_confirm: true,
        user_metadata: { username },
      });
      if (error || !created?.user) return fail(`No se pudo crear el usuario: ${error?.message || 'error desconocido'}`);
      const { error: pErr } = await admin.from('profiles').insert({
        id: created.user.id, username, name, cargo: String(body.cargo || ''), role: String(body.role), area: String(body.area || ''), must_change: true, active: true,
      });
      if (pErr) { await admin.auth.admin.deleteUser(created.user.id); return fail(`No se pudo crear el perfil: ${pErr.message}`); }
      await audit({ username, role: body.role });
      return json({ ok: true, id: created.user.id });
    }

    const id = String(body.id || '');
    if (!id) return fail('Falta el usuario.');
    const { data: target } = await admin.from('profiles').select('*').eq('id', id).single();
    if (!target) return fail('El usuario no existe.', 404);

    if (action === 'update') {
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) { const n = String(body.name).trim(); if (n.length < 5) return fail('Escribe el nombre completo.'); patch.name = n; }
      if (body.cargo !== undefined) patch.cargo = String(body.cargo);
      if (body.area !== undefined) patch.area = String(body.area);
      if (body.role !== undefined) {
        if (!ROLES.includes(String(body.role))) return fail('Portal no válido.');
        if (id === caller.id && body.role !== 'gtc') return fail('No puedes quitarte a ti mismo el rol de Jefatura de GTC.');
        patch.role = String(body.role);
      }
      const { error } = await admin.from('profiles').update(patch).eq('id', id);
      if (error) return fail(error.message);
      await audit({ username: target.username, ...patch });
      return json({ ok: true });
    }

    if (action === 'reset_password') {
      if (!validPass(body.password)) return fail('La contraseña temporal debe tener al menos 8 caracteres.');
      const { error } = await admin.auth.admin.updateUserById(id, { password: String(body.password) });
      if (error) return fail(error.message);
      await admin.from('profiles').update({ must_change: true }).eq('id', id);
      await audit({ username: target.username });
      return json({ ok: true });
    }

    if (action === 'set_active') {
      const active = Boolean(body.active);
      if (id === caller.id && !active) return fail('No puedes desactivar tu propia cuenta.');
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' });
      if (error) return fail(error.message);
      await admin.from('profiles').update({ active }).eq('id', id);
      await audit({ username: target.username, active });
      return json({ ok: true });
    }

    return fail('Acción no reconocida.');
  } catch (e) {
    return fail(`Error inesperado: ${(e as Error).message}`, 500);
  }
});
