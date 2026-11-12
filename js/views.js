// Pantallas de la plataforma.
import { h, fmtDate, hoursSince, toast, $, todayISO } from './util.js';
import * as store from './store.js';
import { FORMS } from './schemas.js';
import { renderForm, validateForm, refreshCalcs } from './engine.js';
import {
  buildCtx, resolvePrefill, activeSignatures, sigLabel, sigRoles, canSign, sign, verifySignature, conformidad,
  sectionState, STAGES, stageOf, ensureForm, ensureFicha, pendingFor, pendingMovs, movStage, fichasAptas,
} from './workflow.js';
import {
  ROLES, CONFIG, motivoLabel, plazo, GRUPOS_OCUP, calcularFicha,
  TIPOS_PUESTO,
} from './rules.js';
import { openSignModal, confirmModal } from './signature.js';

const go = (hash) => { location.hash = hash; };
let saveTimer = null;
const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { store.persist(); flashSaved(); }, 350); };
function flashSaved() { const el = document.getElementById('savestate'); if (el) { el.textContent = `Guardado ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`; el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 600); } }

/* ════════════════════ Layout ════════════════════ */
export function shell(content, active) {
  const u = store.currentUser();
  const db = store.getDB();
  const myCount = pendingFor(u).length + pendingMovs(u).length;
  const nav = [
    ['#/', 'Mi bandeja', 'inbox', myCount],
    ['#/nuevo', 'Nuevo requerimiento', 'plus'],
    ['#/expedientes', 'Expedientes', 'folder', db.cases.length],
    ['#/movimientos', 'Movimientos internos', 'swap', db.movimientos.length],
    ['#/guia', 'Reglas automatizadas', 'book'],
    ['#/ajustes', 'Usuarios y datos', 'gear'],
  ];
  return h('div', { class: 'app' },
    h('a', { class: 'skiplink', href: '#main' }, 'Saltar al contenido'),
    h('aside', { class: 'side' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'Detecta Clínica · inicio' },
        h('img', { src: 'assets/logo.png', alt: 'Detecta Clínica' })),
      h('p', { class: 'brand-sub' }, 'Gestión del Talento y Cultura'),
      h('nav', { 'aria-label': 'Principal' }, nav.map(([href, label, icon, n]) =>
        h('a', { href, class: `nav ${active === href ? 'on' : ''}`, 'aria-current': active === href ? 'page' : false },
          h('span', { class: `ico ico-${icon}`, 'aria-hidden': 'true' }), h('span', {}, label), n ? h('span', { class: 'badge' }, n) : null))),
      h('div', { class: 'whoami' },
        h('label', { for: 'actas', class: 'lbl' }, 'Actuar como (demostración)'),
        h('select', { id: 'actas', class: 'inp', onchange: (e) => { store.setCurrentUser(e.target.value); route(); } },
          Object.entries(ROLES).map(([r, rl]) => h('optgroup', { label: rl }, store.users().filter((x) => x.role === r).map((x) => h('option', { value: x.id, selected: x.id === u.id }, x.name))))),
        h('p', { class: 'muted small' }, `${u.cargo}`),
        h('p', { id: 'savestate', class: 'savestate' }, 'Guardado automático activo'))),
    h('main', { id: 'main', tabindex: '-1' }, content));
}

/* ════════════════════ Bandeja ════════════════════ */
export function viewInbox() {
  const u = store.currentUser();
  const mine = pendingFor(u);
  const movs = pendingMovs(u);
  const db = store.getDB();
  const abiertos = db.cases.filter((c) => !stageOf(c).closed);
  const riesgo = abiertos.filter((c) => ['riesgo', 'vencido'].includes(plazo(caseMeta(c)).estado));
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  return h('div', { class: 'page' },
    h('header', { class: 'hero' },
      h('div', {},
        h('h1', {}, `${saludo}, ${u.name.split(' ')[0]}.`),
        h('p', { class: 'lead' }, mine.length + movs.length
          ? `Tienes ${mine.length + movs.length} documento${mine.length + movs.length === 1 ? '' : 's'} esperando tu acción como ${ROLES[u.role]}.`
          : `No tienes documentos pendientes como ${ROLES[u.role]}.`)),
      h('dl', { class: 'pulse-strip' },
        h('div', {}, h('dt', {}, 'Procesos abiertos'), h('dd', {}, abiertos.length)),
        h('div', { class: riesgo.length ? 'alert' : '' }, h('dt', {}, 'En riesgo de plazo'), h('dd', {}, riesgo.length)),
        h('div', {}, h('dt', {}, 'Movimientos'), h('dd', {}, db.movimientos.filter((m) => !movStage(m).done).length)))),
    h('section', { class: 'block' },
      h('div', { class: 'block-head' }, h('h2', {}, 'Te toca'),
        u.role === 'jefe' ? h('a', { class: 'btn btn-primary', href: '#/nuevo' }, 'Nuevo requerimiento') : null),
      mine.length || movs.length
        ? h('ul', { class: 'tasks' }, mine.map(taskItem), movs.map(movItem))
        : h('div', { class: 'empty' },
          h('p', {}, u.role === 'jefe' ? 'Cuando necesites cubrir una posición, inicia un requerimiento: el sistema lo enviará a quien corresponda según el motivo.' : 'Cuando un documento necesite tu firma o tus datos, aparecerá aquí.'),
          h('a', { class: 'btn btn-ghost', href: '#/expedientes' }, 'Ver todos los expedientes'))),
    h('section', { class: 'block' }, h('h2', {}, 'Actividad reciente'), recentActivity()));
}

function caseMeta(c) { return { ...c, tipoPuesto: c.forms.RQ.data.tipo_puesto }; }

function taskItem(c) {
  const st = stageOf(c);
  const d = c.forms.RQ.data;
  const stg = STAGES.find((s) => s.k === st.k);
  const pl = plazo(caseMeta(c));
  return h('li', {}, h('a', { class: 'task', href: `#/caso/${c.id}` },
    h('span', { class: 'task-code' }, c.id),
    h('span', { class: 'task-main' }, h('strong', {}, d.puesto || 'Puesto sin nombre'), h('span', { class: 'muted' }, `${d.area || 'Área por definir'} · ${motivoLabel(d.motivo)}`)),
    h('span', { class: 'task-stage' }, h('span', { class: 'stage-dot' }), `${stg?.l || ''}: ${st.note}`),
    slaChip(pl)));
}
function movItem(m) {
  const d = m.form.data;
  return h('li', {}, h('a', { class: 'task', href: `#/movimiento/${m.id}` },
    h('span', { class: 'task-code' }, m.id),
    h('span', { class: 'task-main' }, h('strong', {}, d.colaborador || 'Colaborador por registrar'), h('span', { class: 'muted' }, d.tipo || 'Movimiento interno')),
    h('span', { class: 'task-stage' }, h('span', { class: 'stage-dot' }), movStage(m).label), h('span', {})));
}

function slaChip(pl) {
  if (pl.estado === 'pendiente') return h('span', { class: 'sla sla-na', title: 'El plazo corre desde la validación de GTC' }, 'Plazo aún no inicia');
  const txt = pl.estado === 'cerrado' ? `Cubierto en ${pl.usados} d.ú.` : `${pl.usados} de ${pl.total} días útiles`;
  return h('span', { class: `sla sla-${pl.estado}`, title: `Anexo 5 PRC-GTC-02 · ${pl.tipo.l}` }, txt);
}

function recentActivity() {
  const db = store.getDB();
  const items = [...db.cases.flatMap((c) => (c.timeline || []).map((t) => ({ ...t, ref: c.id, href: `#/caso/${c.id}` }))),
    ...db.movimientos.flatMap((m) => (m.timeline || []).map((t) => ({ ...t, ref: m.id, href: `#/movimiento/${m.id}` })))]
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  if (!items.length) return h('p', { class: 'muted' }, 'Todavía no hay actividad registrada.');
  return h('ol', { class: 'feed' }, items.map((t) => h('li', {}, h('time', {}, fmtDate(t.at, true)), h('span', {}, h('strong', {}, t.by), ' ', t.text, ' ', h('a', { href: t.href }, t.ref)))));
}

/* ════════════════════ Nuevo requerimiento ════════════════════ */
export function viewNew() {
  const u = store.currentUser();
  if (u.role !== 'jefe') {
    return h('div', { class: 'page' }, h('h1', {}, 'Nuevo requerimiento'),
      h('div', { class: 'empty' }, h('p', {}, `Según PRC-GTC-01, el requerimiento lo inicia el Jefe inmediato que necesita cubrir la posición. Estás actuando como ${ROLES[u.role]}.`),
        h('p', {}, 'Cambia de usuario en el panel izquierdo para probar el flujo como jefatura.')));
  }
  const c = store.createCase(u);
  setTimeout(() => go(`#/caso/${c.id}`), 0);
  return h('div', { class: 'page' }, h('p', {}, 'Creando expediente…'));
}

/* ════════════════════ Expedientes ════════════════════ */
export function viewCases() {
  const db = store.getDB();
  let filtro = sessionStorage.getItem('f-exp') || 'abiertos';
  const list = () => db.cases.filter((c) => {
    const st = stageOf(c);
    return filtro === 'todos' || (filtro === 'abiertos' ? !st.closed : !!st.closed);
  });
  const body = h('div');
  const draw = () => {
    const rows = list();
    body.replaceChildren(rows.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl tbl-list' },
      h('thead', {}, h('tr', {}, ['Código', 'Puesto', 'Motivo', 'Avance', 'Etapa actual', 'Plazo'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((c) => {
        const d = c.forms.RQ.data; const st = stageOf(c);
        return h('tr', { class: 'clickable', tabindex: 0, onclick: () => go(`#/caso/${c.id}`), onkeydown: (e) => { if (e.key === 'Enter') go(`#/caso/${c.id}`); } },
          h('td', { class: 'mono' }, c.id),
          h('td', {}, h('strong', {}, d.puesto || '—'), h('br'), h('span', { class: 'muted small' }, d.area || '')),
          h('td', {}, motivoLabel(d.motivo)),
          h('td', {}, miniRibbon(c)),
          h('td', {}, st.closed ? h('span', { class: `tag tag-${st.closed}` }, st.note) : h('span', {}, st.note, h('br'), h('span', { class: 'muted small' }, st.roles.map((r) => ROLES[r]).join(' / ')))),
          h('td', {}, slaChip(plazo(caseMeta(c)))));
      })))) : h('div', { class: 'empty' }, h('p', {}, 'No hay expedientes en este filtro.')));
  };
  draw();
  return h('div', { class: 'page' },
    h('div', { class: 'block-head' }, h('h1', {}, 'Expedientes de selección'),
      h('div', { class: 'seg', role: 'tablist' }, [['abiertos', 'En curso'], ['cerrados', 'Cerrados'], ['todos', 'Todos']].map(([k, l]) =>
        h('button', { role: 'tab', 'aria-selected': filtro === k, class: filtro === k ? 'on' : '', onclick: (e) => { filtro = k; sessionStorage.setItem('f-exp', k); e.target.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === e.target); b.setAttribute('aria-selected', b === e.target); }); draw(); } }, l)))),
    body);
}

function miniRibbon(c) {
  const st = stageOf(c); const ap = st.applies;
  const idx = st.k === 'fin' ? STAGES.length : STAGES.findIndex((s) => s.k === st.k);
  return h('span', { class: 'mini', 'aria-label': `Etapa ${idx + 1} de ${STAGES.length}` }, STAGES.map((s, i) => {
    const skip = s.optional && !ap[s.k];
    return h('i', { class: skip ? 'skip' : i < idx ? 'done' : i === idx ? (st.closed === 'desaprobado' ? 'bad' : 'now') : '' });
  }));
}

/* ════════════════════ Cinta de etapas (elemento firma de la marca) ════════════════════ */
function ribbon(caso, activeTab, onPick) {
  const st = stageOf(caso);
  const ap = st.applies;
  const cur = st.k === 'fin' ? STAGES.length : STAGES.findIndex((s) => s.k === st.k);
  const gap = 78, top = 28, cx = 26, amp = 17;
  const H = top * 2 + gap * (STAGES.length - 1);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 52 ${H}`); svg.setAttribute('class', 'ribbon-svg'); svg.setAttribute('aria-hidden', 'true');
  const mk = (tag, attrs) => { const e = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  const defs = mk('defs', {});
  const grad = mk('linearGradient', { id: 'rb-blue', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(mk('stop', { offset: '0', 'stop-color': '#53C0E2' }), mk('stop', { offset: '1', 'stop-color': '#3B8FD8' }));
  defs.append(grad); svg.append(defs);
  for (let i = 0; i < STAGES.length - 1; i++) {
    const y0 = top + i * gap, y1 = y0 + gap;
    const done = i < cur;
    const a = `M${cx},${y0} C${cx + amp + 6},${y0 + gap * 0.35} ${cx + amp + 6},${y1 - gap * 0.35} ${cx},${y1}`;
    const b = `M${cx},${y0} C${cx - amp - 6},${y0 + gap * 0.35} ${cx - amp - 6},${y1 - gap * 0.35} ${cx},${y1}`;
    const flip = i % 2 === 0;
    svg.append(mk('path', { d: flip ? b : a, class: done ? 'rb rb-lime' : 'rb rb-idle' }));
    svg.append(mk('path', { d: flip ? a : b, class: done ? 'rb rb-blue' : 'rb rb-idle' }));
  }
  STAGES.forEach((s, i) => {
    const y = top + i * gap;
    const skip = s.optional && !ap[s.k];
    const cls = skip ? 'nd nd-skip' : i < cur ? 'nd nd-done' : i === cur ? (st.closed === 'desaprobado' ? 'nd nd-bad' : 'nd nd-now') : 'nd';
    svg.append(mk('circle', { cx, cy: y, r: i === cur ? 9 : 6.5, class: cls }));
  });
  const labels = h('ol', { class: 'ribbon-labels', style: `--gap:${gap}px;--top:${top}px` }, STAGES.map((s, i) => {
    const skip = s.optional && !ap[s.k];
    const avail = !skip && i <= cur && formAvailable(caso, s.form);
    const state = skip ? 'No aplica para este motivo' : i < cur ? 'Completado' : i === cur ? (st.closed ? st.note : st.note) : 'Pendiente';
    return h('li', { class: `${i === cur ? 'now' : ''} ${skip ? 'skip' : ''} ${activeTab === s.form && avail ? 'sel' : ''}` },
      avail ? h('button', { type: 'button', onclick: () => onPick(s.form) }, h('strong', {}, s.l), h('span', {}, state))
        : h('div', {}, h('strong', {}, s.l), h('span', {}, state)),
      h('small', {}, s.proc));
  }));
  return h('div', { class: 'ribbon' }, svg, labels);
}

function formAvailable(caso, key) {
  if (key === 'RQ') return true;
  const st = stageOf(caso);
  const order = ['rq', 'aprob', 'gtc', 'perfil', 'entrev', 'fin'];
  const at = order.indexOf(st.k);
  if (key === 'PERFIL') return caso.forms.RQ.data.motivo === 'puesto_nuevo' && at >= order.indexOf('perfil');
  if (key === 'FICHA') return at >= order.indexOf('entrev');
  return false;
}

/* ════════════════════ Expediente ════════════════════ */
export function viewCase(id, tab, sub) {
  const caso = store.getCase(id);
  if (!caso) return notFound('No existe el expediente ' + id);
  const u = store.currentUser();
  const st = stageOf(caso);
  const d = caso.forms.RQ.data;
  if (!tab) tab = STAGES.find((s) => s.k === st.k)?.form || 'RQ';
  if (!formAvailable(caso, tab)) tab = 'RQ';

  const tabs = [['RQ', 'Requerimiento']];
  if (formAvailable(caso, 'PERFIL')) tabs.push(['PERFIL', 'Perfil del puesto']);
  if (formAvailable(caso, 'FICHA')) tabs.push(['FICHA', 'Entrevistas']);
  tabs.push(['HIST', 'Historial']);

  const pick = (k, s2) => go(`#/caso/${id}/${k}${s2 ? '/' + s2 : ''}`);
  let panel;
  if (tab === 'HIST') panel = history(caso);
  else if (tab === 'FICHA') panel = sub ? fichaPanel(caso, sub) : fichasList(caso);
  else {
    const form = ensureForm(caso, tab);
    panel = formPanel({ schema: FORMS[tab], form, entity: caso, caso, ctxFn: () => buildCtx(caso, tab), rerender: () => route() });
  }

  return h('div', { class: 'page page-case' },
    h('header', { class: 'case-head' },
      h('div', {},
        h('p', { class: 'crumbs' }, h('a', { href: '#/expedientes' }, 'Expedientes'), ' / ', h('span', { class: 'mono' }, caso.id)),
        h('h1', {}, d.puesto || 'Nuevo requerimiento de personal'),
        h('p', { class: 'case-tags' },
          d.area ? h('span', { class: 'tag' }, d.area) : null,
          d.motivo ? h('span', { class: `tag tag-m-${d.motivo}` }, motivoLabel(d.motivo)) : null,
          d.categoria ? h('span', { class: 'tag' }, d.categoria) : null,
          d.atraccion ? h('span', { class: 'tag' }, `Atracción ${d.atraccion.toLowerCase()}`) : null,
          null)),
      h('div', { class: 'case-side' }, slaChip(plazo(caseMeta(caso))),
        st.closed ? h('span', { class: `tag tag-${st.closed}` }, st.note) : h('p', { class: 'next' }, h('span', { class: 'muted' }, 'Siguiente: '), `${st.note} · `, h('strong', {}, st.roles.map((r) => ROLES[r]).join(' / '))))),
    h('div', { class: 'case-body' },
      h('aside', { class: 'case-rail' }, ribbon(caso, tab, (k) => pick(k))),
      h('div', { class: 'case-main' },
        h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': tab === k, class: tab === k ? 'on' : '', onclick: () => pick(k) }, l))),
        panel)));
}

function history(entity) {
  return h('div', { class: 'panel' }, h('h2', {}, 'Historial del expediente'),
    h('p', { class: 'muted' }, 'Registro inalterable de cada acción, con fecha, hora y responsable.'),
    h('ol', { class: 'feed feed-full' }, (entity.timeline || []).map((t) => h('li', {}, h('time', {}, fmtDate(t.at, true)), h('span', {}, h('strong', {}, t.by), t.role ? h('span', { class: 'muted' }, ` (${ROLES[t.role] || t.role})`) : null, ' ', t.text)))));
}

/* ───────── Panel de formulario (reutilizable) ───────── */
function formPanel({ schema, form, entity, caso, ctxFn, rerender, extraTop, extraBottom, cand }) {
  const u = store.currentUser();
  let showErrors = !!form._showErrors;
  const host = h('div', { class: 'panel form-panel' });
  if (schema.confidential && !schema.visibleTo.includes(u.role)) {
    host.append(h('div', { class: 'empty' }, h('p', {}, 'Documento confidencial. Solo lo ven GTC, la jefatura solicitante y los evaluadores definidos en el Anexo 2.')));
    return host;
  }

  const draw = () => {
    const ctx = ctxFn();
    const states = (sec) => sectionState(schema, form, sec, u, ctx, caso);
    const onText = () => { saveSoon(); refreshCalcs(host, schema, form.data, ctx); updateMeter(); clearErr(); };
    const onDiscrete = (k) => { saveSoon(); hooks(schema, form, entity, k); const y = window.scrollY; draw(); window.scrollTo(0, y); };
    const sheet = renderForm({ schema, form, ctx, user: u, states, onText, onDiscrete, showErrors, prefill: resolvePrefill });
    const meter = h('div', { class: 'meter', role: 'status' });
    function editableIds() { return schema.sections.filter((s) => (!s.show || s.show(form.data, ctx)) && states(s).editable).map((s) => s.id); }
    function updateMeter() {
      const ids = editableIds();
      if (!ids.length) { meter.hidden = true; return; }
      meter.hidden = false;
      const v = validateForm(schema, form.data, ctx, ids);
      const pend = v.missing + v.hard.length;
      const pct = v.total ? Math.round(((v.total - Math.min(v.missing, v.total)) / v.total) * 100) : 100;
      meter.replaceChildren(
        h('span', { class: 'meter-bar' }, h('span', { style: `width:${pct}%` })),
        h('span', { class: 'meter-txt' }, pend ? `Te falta${pend === 1 ? '' : 'n'} ${pend} dato${pend === 1 ? '' : 's'} obligatorio${pend === 1 ? '' : 's'} para poder firmar` : 'Tus secciones están completas. Ya puedes firmar.'),
        pend ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => jumpToFirst(ids) }, 'Ir al siguiente pendiente') : h('a', { class: 'btn btn-sm btn-lime', href: '#firmas' }, 'Ir a firmas'));
    }
    function clearErr() { /* los errores se recalculan al redibujar */ }
    function jumpToFirst(ids) {
      showErrors = form._showErrors = true;
      draw();
      const v = validateForm(schema, form.data, ctx, ids);
      const first = [...v.problems.keys()][0];
      const el = first && (host.querySelector(`[data-k="${CSS.escape(first)}"]`) || host.querySelector(`[data-k="${CSS.escape(first.split('.')[0])}"]`));
      if (el) { el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); const i = el.querySelector('input,select,textarea'); i?.focus({ preventScroll: true }); }
    }
    updateMeter();

    const obs = (form.observaciones || []).length ? h('div', { class: 'obs' },
      h('strong', {}, 'Observaciones por subsanar'),
      h('ul', {}, form.observaciones.slice(0, 3).map((o) => h('li', {}, h('span', { class: 'muted' }, `${o.by} (${o.cargo}), ${fmtDate(o.at, true)}: `), o.text)))) : null;

    host.replaceChildren(...[
      docHeader(schema, entity, cand),
      schema.intro ? h('p', { class: 'intro' }, schema.intro) : null,
      obs, extraTop ? extraTop(ctx, draw) : null,
      sheet,
      extraBottom ? extraBottom(ctx, draw) : null,
      signaturesBlock({ schema, form, entity, caso, ctx, onNeedFields: (ids) => jumpToFirst(ids), redraw: () => { rerender ? rerender() : draw(); } }),
      meter].filter(Boolean));
  };
  draw();
  return host;
}

function docHeader(schema, entity, cand) {
  return h('div', { class: 'doc-head' },
    h('img', { src: 'assets/isotipo.png', alt: '', class: 'doc-iso' }),
    h('div', { class: 'doc-title' }, h('h2', {}, schema.title), h('p', {}, cand ? `Candidato: ${cand.nombre}` : `Expediente ${entity.id}`, ' · ', h('a', { href: `#/imprimir/${entity.forms ? 'caso' : 'mov'}/${entity.id}/${schema.key}${cand ? '/' + cand.dni : ''}`, target: '_blank', rel: 'noopener' }, 'Versión imprimible'))),
    h('dl', { class: 'doc-code' },
      h('div', {}, h('dt', {}, 'Código'), h('dd', {}, schema.code)),
      h('div', {}, h('dt', {}, 'Versión'), h('dd', {}, schema.version)),
      h('div', {}, h('dt', {}, 'Procedimiento'), h('dd', {}, schema.procedure))));
}

function hooks() { /* reservado para efectos de campos */ }

/* ───────── Firmas y doble conformidad ───────── */
function signaturesBlock({ schema, form, entity, caso, ctx, onNeedFields, redraw }) {
  const u = store.currentUser();
  const data = form.data || {};
  const act = activeSignatures(schema, data);
  const conf = conformidad(schema, form);
  const cdef = schema.conformidad;

  const seals = h('div', { class: 'seals' }, act.map((s) => {
    const sg = form.signatures?.[s.key];
    const roles = sigRoles(s, data);
    const isConf = s.key === cdef.entrega || s.key === cdef.recibe;
    if (sg) {
      const integ = h('span', { class: 'integ' }, 'Verificando…');
      verifySignature(schema, form, s, ctx).then((ok) => { integ.textContent = ok ? 'Íntegra' : 'Contenido alterado'; integ.className = `integ ${ok ? 'ok' : 'bad'}`; integ.title = ok ? `Huella ${sg.hash.slice(0, 16)}…` : 'El contenido firmado cambió después de la firma.'; });
      return h('figure', { class: `seal signed ${isConf ? 'conf' : ''}` },
        h('figcaption', {}, sigLabel(s, data)),
        h('img', { src: sg.img, alt: `Firma de ${sg.name}` }),
        h('p', { class: 'seal-who' }, h('strong', {}, sg.name), h('br'), h('span', { class: 'muted' }, sg.cargo)),
        h('p', { class: 'seal-meta' }, fmtDate(sg.at, true), sg.decision ? h('span', { class: `dec dec-${sg.decision.toLowerCase()}` }, sg.decision) : null, integ),
        sg.comment ? h('p', { class: 'seal-comment' }, `“${sg.comment}”`) : null);
    }
    const chk = canSign(schema, form, s, u, ctx, caso);
    const mine = roles.includes(u.role);
    return h('figure', { class: `seal ${mine ? 'mine' : ''} ${isConf ? 'conf' : ''}` },
      h('figcaption', {}, sigLabel(s, data)),
      h('div', { class: 'seal-empty' }, h('span', {}, roles.map((r) => ROLES[r]).join(' / '))),
      mine ? h('button', { class: `btn ${chk.ok ? 'btn-primary' : 'btn-ghost'} btn-sm`, onclick: async () => {
        if (!chk.ok) { toast(chk.reason, 'warn'); if (chk.incomplete) onNeedFields(s.requires); return; }
        const isTablet = s.tablet && u.role !== 'colaborador';
        const r = await openSignModal({
          title: sigLabel(s, data), signerLabel: isTablet ? 'Firma en tablet del nuevo colaborador, en presencia de GTC' : `${u.name} · ${u.cargo}`,
          user: u, decisionOpts: s.decision, tablet: isTablet,
          declaration: s.key === cdef.entrega ? cdef.textoEntrega : s.key === cdef.recibe ? cdef.textoRecibe : 'Declaro que revisé el contenido de este documento y doy mi conformidad.',
        });
        if (!r) return;
        const signer = isTablet ? { ...u, id: `tablet:${u.id}`, name: r.signerName, cargo: 'Firmado en tablet · registrado por ' + u.name } : u;
        await sign({ schema, form, sdef: s, user: signer, img: r.img, decision: r.decision, comment: r.comment, ctx, entity });
        toast(r.decision === 'Observado' ? 'Documento observado: vuelve a borrador para subsanar.' : r.decision === 'Desaprobado' ? 'Vacante desaprobada. Proceso concluido.' : 'Firma registrada.', r.decision && r.decision !== 'Aprobado' ? 'warn' : 'ok');
        redraw();
      } }, 'Firmar') : null,
      h('p', { class: 'seal-why' }, chk.ok ? (mine ? 'Disponible para tu firma.' : 'Esperando firma.') : chk.reason));
  }));

  const half = (titulo, estado, texto, who) => h('div', { class: `conf-half ${estado === true ? 'ok' : estado === 'na' ? 'na' : ''}` },
    h('span', { class: 'conf-mark', 'aria-hidden': 'true' }),
    h('div', {}, h('strong', {}, titulo), h('p', {}, texto), h('p', { class: 'muted small' }, estado === 'na' ? 'No aplica en este caso.' : estado ? `Conforme: ${who}` : 'Pendiente')));
  const sigName = (k) => form.signatures?.[k]?.name || '';
  const confEl = h('div', { class: `conformidad ${conf.completa ? 'done' : ''}` },
    h('div', { class: 'conf-title' }, h('h3', {}, 'Doble conformidad'), h('span', { class: `tag ${conf.completa ? 'tag-ok' : ''}` }, conf.completa ? 'Completa · documento cerrado' : 'Pendiente')),
    h('div', { class: 'conf-grid' },
      half('Quien entrega', conf.entrega, cdef.textoEntrega, sigName(cdef.entrega)),
      h('span', { class: 'conf-knot', 'aria-hidden': 'true' }),
      half('Quien recibe y valida', conf.recibe, cdef.textoRecibe, sigName(cdef.recibe))),
    h('p', { class: 'muted small' }, 'Cada firma exige trazo manuscrito, nombre confirmado y declaración expresa. El documento solo se cierra con ambas conformidades y queda sellado con una huella SHA-256 que detecta cualquier cambio posterior.'));

  return h('section', { class: 'firmas', id: 'firmas' }, h('h3', {}, 'Firmas y autorizaciones'), seals, confEl);
}

/* ───────── Entrevistas ───────── */
function fichasList(caso) {
  const u = store.currentUser();
  if (!FORMS.FICHA.visibleTo.includes(u.role)) return h('div', { class: 'panel' }, h('div', { class: 'empty' }, h('p', {}, 'Las fichas de entrevista son confidenciales.')));
  caso.candidatos = caso.candidatos || [];
  const cands = caso.candidatos;
  const rq = caso.forms.RQ.data;
  const grupo = GRUPOS_OCUP.find((g) => g.v === rq.grupo_ocupacional);
  const canEdit = ['analista', 'gtc'].includes(u.role) && !caso.seleccionado && !caso.estadoFinal;
  const fichaDe = (c) => caso.fichas?.[c.dni];
  const descartado = (c) => { const f = fichaDe(c); return f && conformidad(FORMS.FICHA, f).completa && calcularFicha(f.data).resultado === 'NO APTO'; };
  const enTerna = cands.filter((c) => !descartado(c)).length;

  // Alta de candidato de la terna
  let addForm = null;
  if (canEdit) {
    const nom = h('input', { class: 'inp', placeholder: 'Apellidos y nombres', 'aria-label': 'Apellidos y nombres' });
    const dni = h('input', { class: 'inp', placeholder: 'DNI / CE', 'aria-label': 'DNI o CE', inputmode: 'numeric' });
    const ori = h('select', { class: 'inp', 'aria-label': 'Origen' }, h('option', { value: 'Externo' }, 'Externo'), h('option', { value: 'Interno' }, 'Interno (colaborador)'));
    const msg = h('p', { class: 'err' });
    addForm = h('form', { class: 'addcand', onsubmit: (e) => {
      e.preventDefault();
      const n = nom.value.trim(); const d = dni.value.trim();
      if (n.length < 5) { msg.textContent = 'Escriba apellidos y nombres completos.'; nom.focus(); return; }
      if (!/^[0-9A-Za-z]{8,12}$/.test(d)) { msg.textContent = 'El DNI o CE debe tener entre 8 y 12 caracteres.'; dni.focus(); return; }
      if (cands.some((c) => c.dni === d)) { msg.textContent = 'Ese documento ya está registrado en este proceso.'; dni.focus(); return; }
      if (enTerna >= CONFIG.MAX_TERNA) { msg.textContent = `La terna admite hasta ${CONFIG.MAX_TERNA} candidatos en evaluación (PRC-GTC-02 paso 17).`; return; }
      cands.push({ nombre: n, dni: d, origen: ori.value });
      store.log(caso, u, `Agregó a ${n} a la terna.`); store.persist(); route();
    } },
      h('div', { class: 'addcand-row' }, nom, dni, ori, h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Agregar a la terna')), msg);
  }

  // Cierre del proceso
  let cierre = null;
  if (caso.seleccionado) {
    const sel = caso.seleccionado;
    const mov = store.getDB().movimientos.find((m) => m.casoId === caso.id);
    cierre = h('div', { class: 'banner banner-action' },
      h('span', {}, `Proceso cerrado (${fmtDate(sel.at, true)}). Candidato seleccionado: `, h('strong', {}, sel.nombre), '.'),
      sel.origen === 'Interno' ? (mov ? h('a', { class: 'btn btn-ghost btn-sm', href: `#/movimiento/${mov.id}` }, `Abrir ${mov.id}`)
        : ['analista', 'gtc', 'jefe'].includes(u.role) ? h('button', { class: 'btn btn-primary btn-sm', onclick: () => {
          const m = store.createMov(u, { colaborador: sel.nombre, dni: sel.dni, posiciones: { 'Área': ['', rq.area], 'Puesto': ['', rq.puesto], 'Jefe directo': ['', rq.jefe_nombre], 'Remuneración (S/)': ['', rq.sal_aprobada], 'Jornada / turno': ['', rq.sistema_trabajo] } }, caso.id);
          store.log(caso, u, `Generó el movimiento interno ${m.id} para ${sel.nombre}.`); store.persist(); go(`#/movimiento/${m.id}`);
        } }, 'Crear movimiento interno') : null) : null);
  } else {
    const listos = fichasAptas(caso);
    if (listos.length && canEdit) {
      const pick = h('select', { class: 'inp', 'aria-label': 'Candidato seleccionado' }, listos.map((c) => h('option', { value: c.dni }, `${c.nombre} · ${calcularFicha(fichaDe(c).data).resultado} · ${calcularFicha(fichaDe(c).data).pct} %`)));
      cierre = h('div', { class: 'banner banner-action' },
        h('span', {}, 'Hay candidatos aptos con ficha cerrada y recomendación “Contratar”.'),
        h('div', { class: 'addcand-row' }, pick, h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
          const c = listos.find((x) => x.dni === pick.value);
          if (!(await confirmModal({ title: 'Cerrar el proceso de selección', body: `Se registrará a ${c.nombre} como candidato seleccionado y se detendrá el plazo del Anexo 5. Las fichas quedan archivadas en el expediente.`, ok: 'Cerrar proceso' }))) return;
          caso.seleccionado = { ...c, at: new Date().toISOString(), by: u.name };
          caso.fechas.cierre = caso.seleccionado.at;
          store.log(caso, u, `Cerró el proceso: candidato seleccionado ${c.nombre}.`); store.persist(); toast('Proceso cerrado.'); route();
        } }, 'Cerrar proceso con este candidato')));
    } else if (cands.length && cands.every(descartado)) {
      cierre = h('div', { class: 'obs' }, h('strong', {}, 'Ningún candidato de la terna resultó apto.'), h('p', {}, 'Registre nuevos candidatos para continuar la evaluación.'));
    }
  }

  return h('div', { class: 'panel' },
    h('h2', {}, 'Entrevista en cadena'),
    h('p', { class: 'muted' }, 'Cada candidato de la terna tiene su Ficha de evaluación (GTC.PRS.02). GTC completa las secciones 1 a 3, la remite a la jefatura y la jefatura la devuelve firmada en 24 horas.'),
    grupo ? h('div', { class: 'matrix-note' }, h('strong', {}, `Entrevistan (Anexo 2 · ${grupo.l}):`), h('ul', {}, grupo.entrevistan.map((x) => h('li', {}, x)))) : null,
    cierre,
    h('ul', { class: 'cands' }, cands.map((c) => {
      const f = fichaDe(c);
      const r = f ? calcularFicha(f.data) : null;
      const conf = f ? conformidad(FORMS.FICHA, f) : null;
      let estado = 'Ficha sin iniciar';
      if (f && f.remitidaAt && !f.signatures?.jefatura) {
        const hrs = hoursSince(f.remitidaAt);
        estado = hrs > CONFIG.HORAS_DEVOLUCION_FICHA ? `Jefatura excede 24 h (${Math.floor(hrs)} h)` : `En jefatura · ${Math.max(0, Math.ceil(CONFIG.HORAS_DEVOLUCION_FICHA - hrs))} h restantes`;
      } else if (f && conf?.completa) estado = 'Ficha cerrada';
      else if (f) estado = 'En evaluación RRHH';
      const removable = canEdit && (!f || !Object.keys(f.signatures || {}).length);
      return h('li', { class: 'cand-li' }, h('a', { class: 'cand', href: `#/caso/${caso.id}/FICHA/${encodeURIComponent(c.dni)}` },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, c.nombre.split(' ').map((x) => x[0]).slice(0, 2).join('')),
        h('span', {}, h('strong', {}, c.nombre), h('br'), h('span', { class: 'muted small' }, `${c.origen} · ${c.dni}`)),
        h('span', { class: `muted small ${estado.includes('excede') ? 'late' : ''}` }, estado),
        r ? h('span', { class: `verdict ${{ 'APTO': 'r-apto', 'APTO CON OBSERVACIONES': 'r-obs', 'NO APTO': 'r-no' }[r.resultado] || 'r-cont'}` }, r.completo || r.resultado === 'NO APTO' ? `${r.resultado} · ${r.pct} %` : r.resultado) : h('span', {})),
        removable ? h('button', { class: 'btn-x', title: 'Quitar de la terna', 'aria-label': `Quitar a ${c.nombre}`, onclick: () => {
          caso.candidatos = cands.filter((x) => x.dni !== c.dni); if (caso.fichas) delete caso.fichas[c.dni];
          store.log(caso, u, `Quitó a ${c.nombre} de la terna.`); store.persist(); route();
        } }, '×') : null);
    })),
    !cands.length ? h('div', { class: 'empty' }, h('p', {}, canEdit ? 'Registra a los candidatos preseleccionados (hasta 3) para abrir su ficha de entrevista.' : 'GTC aún no registra la terna.')) : null,
    addForm);
}

function fichaPanel(caso, dni) {
  dni = decodeURIComponent(dni);
  const cand = (caso.candidatos || []).find((c) => c.dni === dni);
  if (!cand) return h('div', { class: 'panel' }, h('p', {}, 'Candidato no encontrado.'));
  const f = ensureFicha(caso, cand);
  const u = store.currentUser();
  return h('div', {},
    h('p', { class: 'crumbs' }, h('a', { href: `#/caso/${caso.id}/FICHA` }, '← Volver a la terna')),
    formPanel({
      schema: FORMS.FICHA, form: f, entity: caso, caso, cand, ctxFn: () => buildCtx(caso, 'FICHA', cand), rerender: () => route(),
      extraTop: () => {
        if (f.data.continua !== 'Sí') return null;
        if (f.remitidaAt) {
          const hrs = hoursSince(f.remitidaAt);
          const late = !f.signatures?.jefatura && hrs > CONFIG.HORAS_DEVOLUCION_FICHA;
          return h('div', { class: `banner ${late ? 'banner-late' : ''}` }, `Remitida a la jefatura el ${fmtDate(f.remitidaAt, true)}.`,
            f.signatures?.jefatura ? ' Devuelta con evaluación.' : late ? ` Plazo de 24 h excedido (${Math.floor(hrs)} h).` : ` Debe devolverse en ${Math.max(0, Math.ceil(CONFIG.HORAS_DEVOLUCION_FICHA - hrs))} h.`);
        }
        if (u.role !== 'analista' && u.role !== 'gtc') return h('div', { class: 'banner' }, 'GTC completa las secciones 1 a 3 y luego remite la ficha a la jefatura.');
        const v = validateForm(FORMS.FICHA, f.data, buildCtx(caso, 'FICHA', cand), ['f1', 'f2', 'f3']);
        return h('div', { class: 'banner banner-action' },
          h('span', {}, v.complete ? 'Secciones de GTC completas. Remite la ficha para la entrevista técnica.' : `Completa las secciones 1 a 3 (faltan ${v.missing + v.hard.length}) para remitir a la jefatura.`),
          h('button', { class: 'btn btn-primary btn-sm', disabled: !v.complete, onclick: () => {
            f.remitidaAt = new Date().toISOString(); store.log(caso, u, `Remitió la ficha de ${cand.nombre} a la jefatura (plazo de devolución: 24 h).`); store.persist(); toast('Ficha remitida a la jefatura.'); route();
          } }, 'Remitir a jefatura'));
      },
    }));
}

/* ════════════════════ Movimientos internos ════════════════════ */
export function viewMovs() {
  const db = store.getDB();
  const u = store.currentUser();
  return h('div', { class: 'page' },
    h('div', { class: 'block-head' }, h('h1', {}, 'Movimientos internos de personal'),
      ['analista', 'gtc', 'jefe'].includes(u.role) ? h('button', { class: 'btn btn-primary', onclick: () => { const m = store.createMov(u); go(`#/movimiento/${m.id}`); } }, 'Registrar movimiento') : null),
    h('p', { class: 'muted' }, 'Ascensos, traslados, cambios de puesto o de jornada (GTC.PRS.03). Requieren firma del colaborador, ambas jefaturas y GTC.'),
    db.movimientos.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl tbl-list' },
      h('thead', {}, h('tr', {}, ['Código', 'Colaborador', 'Tipo', 'Fecha efectiva', 'Estado'].map((t) => h('th', {}, t)))),
      h('tbody', {}, db.movimientos.map((m) => { const d = m.form.data; const st = movStage(m); return h('tr', { class: 'clickable', tabindex: 0, onclick: () => go(`#/movimiento/${m.id}`), onkeydown: (e) => { if (e.key === 'Enter') go(`#/movimiento/${m.id}`); } },
        h('td', { class: 'mono' }, m.id), h('td', {}, d.colaborador || '—'), h('td', {}, d.tipo || '—'), h('td', {}, d.fecha_efectiva ? fmtDate(d.fecha_efectiva) : '—'),
        h('td', {}, h('span', { class: `tag ${st.done ? 'tag-ok' : ''}` }, st.label))); }))))
      : h('div', { class: 'empty' }, h('p', {}, 'No hay movimientos registrados. Los movimientos de candidatos internos también se generan desde la etapa de ingreso.')));
}

export function viewMov(id) {
  const m = store.getMov(id);
  if (!m) return notFound('No existe el movimiento ' + id);
  return h('div', { class: 'page' },
    h('p', { class: 'crumbs' }, h('a', { href: '#/movimientos' }, 'Movimientos'), ' / ', h('span', { class: 'mono' }, m.id), m.casoId ? [' · vinculado a ', h('a', { href: `#/caso/${m.casoId}/ING` }, m.casoId)] : null),
    h('div', { class: 'mov-layout' },
      formPanel({ schema: FORMS.MOV, form: m.form, entity: m, caso: null, ctxFn: () => buildCtx(null, 'MOV'), rerender: () => route() }),
      h('aside', {}, history(m))));
}

/* ════════════════════ Guía de reglas ════════════════════ */
export function viewGuide() {
  const row = (regla, origen, como) => h('tr', {}, h('td', {}, regla), h('td', { class: 'muted small' }, origen), h('td', {}, como));
  return h('div', { class: 'page page-narrow' },
    h('h1', {}, 'Reglas que la plataforma aplica por ti'),
    h('p', { class: 'lead' }, 'La plataforma digitaliza los formatos RQ, GTC.PRS.02, GTC.PRS.03 y GTC.PRS.04. Cada regla viene de los procedimientos PRC-GTC-01, 02 y 03. Si un procedimiento cambia, se ajusta en js/rules.js o js/schemas.js.'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Regla'), h('th', {}, 'Origen'), h('th', {}, 'Cómo se automatiza'))),
      h('tbody', {},
        row('Ningún formato se firma incompleto', 'Solicitud de la clínica', 'Cada firma exige que todas las secciones que respalda estén completas y sin errores; un medidor indica qué falta y lleva al campo.'),
        row('Ampliación y puesto nuevo requieren Dirección y Gerencia General', 'PRC-GTC-01 §6.1 y pasos a–c', 'Las firmas de Dirección (DA o DM según la categoría) y de GG aparecen solo para esos motivos. “Observado” devuelve el formato a borrador; “Desaprobado” cierra el expediente.'),
        row('GTC no inicia sin la firma del Jefe de GTC', 'PRC-GTC-01 paso 3', 'La entrevista en cadena se habilita solo con la firma “Aprobado” de GTC, que también fija el inicio del plazo.'),
        row('Terna de hasta 3 candidatos', 'PRC-GTC-02 paso 17', 'No se pueden registrar más de 3 candidatos en evaluación; los declarados NO APTO liberan su lugar.'),
        row('Puesto nuevo pasa por levantamiento de perfil y MOF', 'PRC-GTC-01 pasos 6–9', 'Se activa el formato GTC.PRS.04 y una sección para el Área de Procesos antes de las entrevistas.'),
        row('Plazos de cobertura', 'PRC-GTC-02 Anexo 5', `Semáforo en días útiles: ${TIPOS_PUESTO.map((t) => `${t.l.toLowerCase()} ${t.dias}`).join(', ')}. Se detiene al cerrar el proceso con el candidato seleccionado.`),
        row('Quién entrevista', 'PRC-GTC-02 Anexo 2', 'El grupo ocupacional que registra GTC define si aplica entrevista final y muestra a los responsables.'),
        row('Devolución de la ficha en 24 horas', 'PRC-GTC-02 paso 23', 'Al remitir la ficha corre un contador visible para la jefatura y GTC.'),
        row('Resultado de la entrevista en cadena', 'GTC.PRS.02 sección 6', 'Cálculo automático del puntaje, ponderación técnica ×2, base 80 o 100 y veredicto. Un requisito crítico incumplido impide APTO y no se puede recomendar “Contratar”.'),
        row('Evidencia en notas extremas', 'GTC.PRS.02 sección 3', 'Las notas 1, 2 y 5 exigen evidencia escrita.'),
        row('Doble conformidad', 'Solicitud de la clínica', 'Cada documento define quién entrega y quién recibe; se cierra solo con ambas firmas y una huella SHA-256 detecta cambios posteriores. Una persona no puede firmar dos casilleros del mismo formato.'),
        row('Datos de salud reservados', 'Ley 29733', 'En suplencias solo se registra el motivo; las fichas de entrevista solo son visibles para GTC y los evaluadores.'),
      ))));
}

/* ════════════════════ Ajustes ════════════════════ */
export function viewSettings() {
  const list = h('div');
  const draw = () => list.replaceChildren(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['Nombre', 'Cargo', 'Rol en el flujo', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, store.users().map((u) => h('tr', {},
      h('td', {}, h('input', { class: 'inp', value: u.name, 'aria-label': 'Nombre', onchange: (e) => { store.saveUser({ ...u, name: e.target.value }); } })),
      h('td', {}, h('input', { class: 'inp', value: u.cargo, 'aria-label': 'Cargo', onchange: (e) => { store.saveUser({ ...u, cargo: e.target.value }); } })),
      h('td', {}, h('select', { class: 'inp', 'aria-label': 'Rol', onchange: (e) => store.saveUser({ ...u, role: e.target.value }) }, Object.entries(ROLES).map(([k, l]) => h('option', { value: k, selected: u.role === k }, l)))),
      h('td', {}, h('button', { class: 'btn-x', title: 'Eliminar', 'aria-label': `Eliminar a ${u.name}`, onclick: () => { if (store.users().length > 1) { store.removeUser(u.id); draw(); } } }, '×'))))))),
    h('button', { class: 'btn btn-ghost btn-sm add-row', onclick: () => { store.saveUser({ name: 'Nuevo usuario', cargo: 'Cargo', role: 'jefe', area: '' }); draw(); } }, '+ Agregar usuario'));
  draw();
  const fileIn = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
    try { store.importJSON(await e.target.files[0].text()); toast('Respaldo importado.'); route(); } catch (err) { toast(err.message, 'warn'); }
  } });
  return h('div', { class: 'page page-narrow' },
    h('h1', {}, 'Usuarios y datos'),
    h('section', { class: 'block' }, h('h2', {}, 'Usuarios del flujo'), h('p', { class: 'muted' }, 'Cada rol habilita qué secciones puede llenar y qué casilleros puede firmar. En producción, estos usuarios vendrán del inicio de sesión institucional.'), list),
    h('section', { class: 'block' }, h('h2', {}, 'Parámetros'),
      h('label', { class: 'decl' }, h('input', { type: 'checkbox', checked: CONFIG.DM_FIRMA_TODO_ASISTENCIAL, onchange: (e) => { CONFIG.DM_FIRMA_TODO_ASISTENCIAL = e.target.checked; localStorage.setItem('detecta-gtc:dm', e.target.checked ? '1' : '0'); toast('Parámetro actualizado.'); } }),
        h('span', {}, 'Exigir firma de Dirección Médica en todo requerimiento asistencial, aunque sea reemplazo o suplencia (como indica el formato RQ físico; PRC-GTC-01 no lo exige).'))),
    h('section', { class: 'block' }, h('h2', {}, 'Respaldo'),
      h('p', { class: 'muted' }, 'Esta versión guarda la información en este navegador. Exporta un respaldo con frecuencia o conecta una base de datos (ver README).'),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn btn-primary', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' })), download: `detecta-gtc-respaldo-${todayISO()}.json` }); a.click(); } }, 'Exportar respaldo'),
        h('button', { class: 'btn btn-ghost', onclick: () => fileIn.click() }, 'Importar respaldo'), fileIn,
        h('button', { class: 'btn btn-danger', onclick: async () => { if (await confirmModal({ title: 'Restablecer datos', body: 'Se borrarán todos los expedientes de este navegador y se cargarán los ejemplos de demostración.', ok: 'Restablecer', danger: true })) { store.resetAll(true); route(); } } }, 'Restablecer demostración'))));
}

/* ════════════════════ Impresión ════════════════════ */
export function viewPrint(kind, id, formKey, dni) {
  const entity = kind === 'caso' ? store.getCase(id) : store.getMov(id);
  if (!entity) return notFound('Documento no encontrado');
  const schema = FORMS[formKey];
  let form; let cand = null; let ctx;
  if (kind === 'mov') { form = entity.form; ctx = buildCtx(null, 'MOV'); }
  else if (formKey === 'FICHA') { cand = (entity.candidatos || []).find((c) => c.dni === decodeURIComponent(dni)); form = entity.fichas?.[cand?.dni]; ctx = buildCtx(entity, 'FICHA', cand); }
  else { form = entity.forms[formKey]; ctx = buildCtx(entity, formKey); }
  if (!form) return notFound('El formato aún no tiene datos.');
  const u = store.currentUser();
  if (schema.confidential && !schema.visibleTo.includes(u.role)) return notFound('Documento confidencial.');
  const sheet = renderForm({ schema, form, ctx, user: u, states: () => ({ editable: false, reason: '' }), onText() {}, onDiscrete() {} });
  const act = activeSignatures(schema, form.data);
  const conf = conformidad(schema, form);
  return h('div', { class: 'print-doc' },
    h('div', { class: 'print-bar' }, h('button', { class: 'btn btn-primary', onclick: () => window.print() }, 'Imprimir o guardar PDF'), h('a', { class: 'btn btn-ghost', href: kind === 'caso' ? `#/caso/${id}` : `#/movimiento/${id}` }, 'Volver')),
    h('table', { class: 'p-head' }, h('tr', {},
      h('td', { class: 'p-logo' }, h('img', { src: 'assets/logo.png', alt: 'Detecta Clínica' })),
      h('td', { class: 'p-title' }, schema.title.toUpperCase()),
      h('td', { class: 'p-code' }, h('div', {}, h('b', {}, 'Código: '), schema.code), h('div', {}, h('b', {}, 'Versión: '), schema.version), h('div', {}, h('b', {}, 'Expediente: '), entity.id), h('div', {}, h('b', {}, 'Emitido: '), fmtDate(new Date().toISOString(), true))))),
    cand ? h('p', {}, h('b', {}, 'Candidato: '), cand.nombre, ' · DNI ', cand.dni) : null,
    sheet,
    h('div', { class: 'p-sigs' }, act.map((s) => { const sg = form.signatures?.[s.key]; return h('div', { class: 'p-sig' }, sg ? h('img', { src: sg.img, alt: '' }) : h('div', { class: 'p-sig-empty' }), h('div', { class: 'p-line' }), h('b', {}, sigLabel(s, form.data)), h('div', {}, sg ? `${sg.name} · ${fmtDate(sg.at, true)}${sg.decision ? ' · ' + sg.decision : ''}` : 'Pendiente'), sg ? h('div', { class: 'p-hash' }, `Huella ${sg.hash.slice(0, 24)}…`) : null); })),
    h('p', { class: 'p-foot' }, `Doble conformidad: ${conf.completa ? 'COMPLETA' : 'PENDIENTE'}. Documento generado por la plataforma digital de GTC de Detecta Clínica. Toda copia impresa es una copia no controlada.`));
}

function notFound(msg) { return h('div', { class: 'page' }, h('h1', {}, 'No encontrado'), h('p', {}, msg), h('a', { class: 'btn btn-ghost', href: '#/' }, 'Ir a mi bandeja')); }

/* ════════════════════ Router ════════════════════ */
export function route() {
  const app = document.getElementById('app');
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const [a, b, c, d2] = parts;
  document.body.classList.toggle('printing', a === 'imprimir');
  if (a === 'imprimir') { app.replaceChildren(viewPrint(b, c, d2, parts[4])); return; }
  let view; let active = '#/';
  switch (a) {
    case undefined: view = viewInbox(); break;
    case 'nuevo': view = viewNew(); active = '#/nuevo'; break;
    case 'expedientes': view = viewCases(); active = '#/expedientes'; break;
    case 'caso': view = viewCase(b, c, d2); active = '#/expedientes'; break;
    case 'movimientos': view = viewMovs(); active = '#/movimientos'; break;
    case 'movimiento': view = viewMov(b); active = '#/movimientos'; break;
    case 'guia': view = viewGuide(); active = '#/guia'; break;
    case 'ajustes': view = viewSettings(); active = '#/ajustes'; break;
    default: view = notFound('La dirección no existe.');
  }
  app.replaceChildren(shell(view, active));
  document.title = `${document.querySelector('main h1')?.textContent || 'GTC'} · Detecta Clínica`;
}
