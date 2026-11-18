// Motor de flujo: firmas, bloqueo por firma, doble conformidad y etapa de cada expediente.
import { FORMS } from './schemas.js';
import { validateForm, sectionFieldKeys } from './engine.js';
import {
  ROLES, requiereAprobacion, directorDeLinea, aplicaEntrevistaFinal, calcularFicha, esAsistencial,
} from './rules.js';
import { hashOf, nowISO, todayISO } from './util.js';
import * as store from './store.js';

const val = (x, ...args) => (typeof x === 'function' ? x(...args) : x);

/* ───────── Contexto que reciben las reglas de cada formato ───────── */
export function buildCtx(caso, formKey, cand = null) {
  const rq = caso?.forms?.RQ?.data || {};
  const ctx = { caso, rq, cand, user: store.currentUser() };
  if (caso) {
    const s = caso.forms.RQ.signatures || {};
    const sigsRQ = activeSignatures(FORMS.RQ, rq);
    ctx.readyForGTC = sigsRQ.filter((x) => x.key !== 'gtc').every((x) => s[x.key] && s[x.key].decision !== 'Observado');
    ctx.candidatos = caso.candidatos || [];
  }
  return ctx;
}

/* ───────── Precarga de campos ───────── */
export function resolvePrefill(path, ctx) {
  const rq = ctx.rq || {};
  switch (path) {
    case 'today': return todayISO();
    case 'user.name': return ctx.user?.name;
    case 'user.cargo': return ctx.user?.cargo;
    case 'cand.nombre': return ctx.cand?.nombre;
    case 'rq.tipo_vacante': return { puesto_nuevo: 'Nueva', reemplazo: 'Reemplazo', ampliacion: 'Ampliación', suplencia: 'Suplencia' }[rq.motivo];
    case 'rq.perfil': return rq.categoria ? (esAsistencial(rq) ? 'Asistencial' : 'Administrativo') : undefined;
    case 'rq.horario': return rq.sistema_trabajo ? (rq.sistema_trabajo.startsWith('48') ? '48 horas semanales' : '150 horas mensuales') : undefined;
    case 'rq.final_aplica': return rq.grupo_ocupacional ? (aplicaEntrevistaFinal(rq.grupo_ocupacional) ? 'Sí' : 'N/A') : undefined;
    case 'rq.tipo_contrato': return rq.tipo_contrato === 'Otra modalidad' ? rq.tipo_contrato_otro : rq.tipo_contrato;
    default:
      if (path.startsWith('rq.')) return rq[path.slice(3)];
      return undefined;
  }
}

/* ───────── Firmas ───────── */
export function activeSignatures(schema, data) {
  return schema.signatures.filter((s) => (s.when ? s.when(data) : true));
}
export const sigLabel = (s, data) => val(s.label, data);
export const sigRoles = (s, data) => val(s.roles, data);

export function lockedSections(schema, form) {
  const locked = new Set();
  const data = form.data || {};
  for (const s of activeSignatures(schema, data)) {
    if (form.signatures?.[s.key]) s.requires.forEach((id) => locked.add(id));
  }
  if (schema.key === 'FICHA' && form.remitidaAt) ['f1', 'f2', 'f3'].forEach((id) => locked.add(id));
  return locked;
}

export function sectionVisible(sec, data, ctx) { return sec.show ? sec.show(data, ctx) : true; }

export function sectionState(schema, form, sec, user, ctx, caso) {
  const data = form.data || {};
  if (caso?.estadoFinal) return { editable: false, reason: 'Expediente cerrado' };
  if (lockedSections(schema, form).has(sec.id)) return { editable: false, reason: 'Firmado · bloqueado' };
  if (sec.unlockAfter && !sec.unlockAfter(ctx, form, data)) return { editable: false, reason: 'Se habilita en una etapa posterior', waiting: true };
  if (!sec.by.includes(user.role)) return { editable: false, reason: `Lo completa: ${sec.by.map((r) => ROLES[r]).join(' / ')}` };
  return { editable: true };
}

export function canSign(schema, form, sdef, user, ctx, caso) {
  const data = form.data || {};
  const sigs = form.signatures || {};
  if (caso?.estadoFinal) return { ok: false, reason: 'Expediente cerrado.' };
  if (sigs[sdef.key]) return { ok: false, reason: 'Ya firmado.' };
  const roles = sigRoles(sdef, data);
  if (!roles.includes(user.role)) return { ok: false, reason: `Firma: ${roles.map((r) => ROLES[r]).join(' / ')}.` };
  const active = activeSignatures(schema, data).map((s) => s.key);
  const pend = (sdef.after || []).filter((k) => active.includes(k) && (!sigs[k] || sigs[k].decision === 'Observado'));
  if (pend.length) {
    const labels = pend.map((k) => sigLabel(schema.signatures.find((x) => x.key === k), data));
    return { ok: false, reason: `Antes debe firmar: ${labels.join(', ')}.` };
  }
  if (Object.values(sigs).some((s) => s.userId === user.id) && !sdef.tablet) return { ok: false, reason: 'Una misma persona no puede firmar dos casilleros del mismo formato (doble conformidad).' };
  if (schema.key === 'FICHA' && data.continua === 'Sí' && !form.remitidaAt && sdef.key !== 'rrhh') return { ok: false, reason: 'GTC aún no remite la ficha a la jefatura.' };
  const v = validateForm(schema, data, ctx, sdef.requires);
  if (v.missing > 0 || v.hard.length) return { ok: false, reason: `Faltan ${v.missing + v.hard.length} campo(s) obligatorio(s) en las secciones que esta firma respalda.`, incomplete: true };
  const blocking = v.soft.filter((e) => (sdef.blockIfSoft || []).some((k) => e.k === k || e.k.startsWith(k)));
  if (blocking.length) return { ok: false, reason: blocking[0].m };
  return { ok: true };
}

export function signedPayload(schema, data, sdef, ctx) {
  const keys = sdef.requires.flatMap((id) => sectionFieldKeys(schema, id));
  const out = {};
  keys.forEach((k) => { if (data[k] !== undefined) out[k] = data[k]; });
  return { form: schema.key, sig: sdef.key, caso: ctx?.caso?.id || null, data: out };
}

export async function sign({ schema, form, sdef, user, img, decision, comment, ctx, entity }) {
  const data = form.data || {};
  const hash = await hashOf(signedPayload(schema, data, sdef, ctx));
  const label = sigLabel(sdef, data);
  form.signatures = form.signatures || {};
  const userId = sdef.tablet && user.role !== 'colaborador' && !String(user.id).startsWith('tablet:') ? `tablet:${user.id}` : user.id;
  form.signatures[sdef.key] = { userId, name: user.name, cargo: user.cargo, role: user.role, at: nowISO(), img, hash, decision: decision || null, comment: comment || '' };
  store.log(entity, user, `Firmó “${label}” en ${schema.title}${decision ? `: ${decision}` : ''}${comment ? ` — ${comment}` : ''}.`);

  if (decision === 'Observado') {
    form.observaciones = form.observaciones || [];
    form.observaciones.unshift({ at: nowISO(), by: user.name, cargo: user.cargo, text: comment });
    form.signatures = {}; // vuelve a borrador: se invalidan todas las firmas del formato
    if (schema.key === 'FICHA') delete form.remitidaAt;
    store.log(entity, user, `${schema.title} volvió a borrador para subsanar observaciones.`);
  }
  if (decision === 'Desaprobado' && entity.forms) {
    entity.estadoFinal = 'desaprobado';
    store.log(entity, user, 'Gerencia General desaprobó la vacante. Proceso concluido.');
  }
  // Hitos de plazo
  if (entity.forms && schema.key === 'RQ' && sdef.key === 'gtc' && decision === 'Aprobado') entity.fechas.validacionGTC = nowISO();
  store.persist();
}

export async function verifySignature(schema, form, sdef, ctx) {
  const s = form.signatures?.[sdef.key];
  if (!s) return null;
  const h = await hashOf(signedPayload(schema, form.data || {}, sdef, ctx));
  return h === s.hash;
}

export function conformidad(schema, form) {
  const c = schema.conformidad;
  const sigs = form.signatures || {};
  const data = form.data || {};
  const ok = (k) => !!sigs[k] && sigs[k].decision !== 'Observado' && sigs[k].decision !== 'Desaprobado';
  const entregaNA = c.fallbackEntrega?.(data);
  const entrega = entregaNA ? 'na' : ok(c.entrega);
  const recibe = ok(c.recibe);
  const active = activeSignatures(schema, data);
  const todas = active.every((s) => ok(s.key));
  return { entrega, recibe, completa: !!entrega && recibe && todas, todas };
}

/* ───────── Etapas del expediente ───────── */
export const STAGES = [
  { k: 'rq', l: 'Requerimiento', form: 'RQ', proc: 'PRC-GTC-01 · 1–2' },
  { k: 'aprob', l: 'Aprobación de la vacante', form: 'RQ', proc: 'PRC-GTC-01 · a–d', optional: true },
  { k: 'gtc', l: 'Validación GTC', form: 'RQ', proc: 'PRC-GTC-01 · 3–5' },
  { k: 'perfil', l: 'Perfil del puesto nuevo', form: 'PERFIL', proc: 'PRC-GTC-01 · 6–9', optional: true },
  { k: 'entrev', l: 'Entrevista en cadena', form: 'FICHA', proc: 'PRC-GTC-02 · 14–23' },
];

export function ensureForm(caso, key) {
  caso.forms[key] = caso.forms[key] || { data: {}, signatures: {}, observaciones: [] };
  return caso.forms[key];
}
export function ensureFicha(caso, cand) {
  caso.fichas = caso.fichas || {};
  caso.fichas[cand.dni] = caso.fichas[cand.dni] || { data: {}, signatures: {}, observaciones: [], candidato: cand.nombre };
  return caso.fichas[cand.dni];
}

function nextSigner(schema, form) {
  const data = form.data || {};
  const sigs = form.signatures || {};
  for (const s of activeSignatures(schema, data)) {
    if (!sigs[s.key]) return s;
  }
  return null;
}

export function stageOf(caso) {
  const rq = caso.forms.RQ;
  const d = rq.data || {};
  const s = rq.signatures || {};
  const out = (k, roles, note) => ({ k, roles: [...new Set(roles)], note, applies: stageApplies(caso) });
  if (caso.estadoFinal === 'desaprobado') return { ...out('aprob', [], 'Desaprobado por Gerencia General'), closed: 'desaprobado' };
  if (caso.estadoFinal === 'anulado') return { ...out('rq', [], 'Anulado'), closed: 'anulado' };
  if (!s.solicitante) return out('rq', ['jefe'], rq.observaciones?.length ? 'Subsanar observaciones' : 'Completar y firmar');
  if (requiereAprobacion(d)) {
    if (!s.director) return out('aprob', [directorDeLinea(d)], `Evalúa ${directorDeLinea(d) === 'dm' ? 'Dirección Médica' : 'Dirección Administrativa'}`);
    if (!s.gg) return out('aprob', ['gg'], 'Evalúa Gerencia General');
  }
  if (activeSignatures(FORMS.RQ, d).some((x) => x.key === 'dm_asistencial') && !s.dm_asistencial) return out('aprob', ['dm'], 'Firma Dirección Médica');
  if (!s.gtc) return out('gtc', ['gtc'], 'Registrar remuneración, asignar analista y validar');
  if (d.motivo === 'puesto_nuevo') {
    const p = caso.forms.PERFIL;
    if (!p || !p.signatures?.procesos) {
      const nx = p ? nextSigner(FORMS.PERFIL, p) : FORMS.PERFIL.signatures[0];
      return out('perfil', p ? sigRoles(nx, p.data) : ['analista', 'jefe'], p ? `Firma pendiente: ${sigLabel(nx, p.data)}` : 'Convocar a la jefatura al levantamiento del perfil');
    }
  }
  if (caso.seleccionado) return { ...out('fin', [], `Seleccionado: ${caso.seleccionado.nombre}`), closed: 'completado' };
  const cands = caso.candidatos || [];
  if (!cands.length) return out('entrev', ['analista'], 'Registrar la terna y aplicar la entrevista en cadena');
  if (fichasAptas(caso).length) return out('entrev', ['analista'], 'Cerrar el proceso con el candidato seleccionado');
  const roles = [];
  cands.forEach((c) => {
    const f = caso.fichas?.[c.dni];
    if (!f || (f.data.continua === 'Sí' && !f.remitidaAt)) { roles.push('analista'); return; }
    const nx = nextSigner(FORMS.FICHA, f);
    if (nx) roles.push(...sigRoles(nx, f.data));
  });
  return out('entrev', roles.length ? roles : ['analista'], roles.length ? 'Evaluar a la terna' : 'Ningún candidato apto: registrar nuevos candidatos');
}

// Candidatos con ficha cerrada (doble conformidad), resultado apto y recomendación "Contratar"
export function fichasAptas(caso) {
  return (caso.candidatos || []).filter((c) => {
    const f = caso.fichas?.[c.dni];
    if (!f) return false;
    const r = calcularFicha(f.data).resultado;
    return (r === 'APTO' || r === 'APTO CON OBSERVACIONES') && f.data.recomendacion === 'Contratar' && conformidad(FORMS.FICHA, f).completa;
  });
}

export function stageApplies(caso) {
  const d = caso.forms.RQ.data || {};
  return { aprob: requiereAprobacion(d) || activeSignatures(FORMS.RQ, d).some((x) => x.key === 'dm_asistencial'), perfil: d.motivo === 'puesto_nuevo' };
}

export function pendingFor(user, list = store.getDB().cases) {
  return list.filter((c) => {
    const st = stageOf(c);
    if (st.closed) return false;
    if (!st.roles.includes(user.role)) return false;
    if (user.role === 'jefe') return c.createdBy === user.id;
    if (user.role === 'analista' && c.forms.RQ.data.analista_id && st.k !== 'rq') return c.forms.RQ.data.analista_id === user.id;
    return true;
  });
}

export function pendingMovs(user) {
  return store.getDB().movimientos.filter((m) => {
    const nx = nextSigner(FORMS.MOV, m.form);
    return nx && sigRoles(nx, m.form.data).includes(user.role);
  });
}

export function movStage(m) {
  const nx = nextSigner(FORMS.MOV, m.form);
  if (!nx) return { done: true, label: 'Ejecutado' };
  return { done: false, label: `Pendiente: ${sigLabel(nx, m.form.data)}`, roles: sigRoles(nx, m.form.data) };
}

/* Al cargar datos de demostración, sella sus firmas con el hash real */
export async function sealDemo() {
  const db = store.getDB();
  let changed = false;
  for (const c of db.cases) {
    for (const [k, f] of Object.entries(c.forms)) {
      const schema = FORMS[k];
      if (!schema) continue;
      for (const s of schema.signatures) {
        const sg = f.signatures?.[s.key];
        if (sg && sg.hash === 'demo') { sg.hash = await hashOf(signedPayload(schema, f.data, s, { caso: c })); changed = true; }
      }
    }
  }
  if (changed) store.persist();
}
