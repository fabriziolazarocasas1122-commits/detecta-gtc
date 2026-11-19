// Portales por rol, inicio de sesión y navegación.
// Cada persona entra con su usuario y ve solo su ventana, según los procedimientos PRC-GTC-01/02/03.
import { h, toast, fmtDate, hoursSince, normalize, todayISO } from './util.js';
import * as store from './store.js';
import { FORMS } from './schemas.js';
import { ROLES, CONFIG, motivoLabel, plazo, requiereAprobacion, esAsistencial, aplicaEntrevistaFinal, calcularFicha } from './rules.js';
import { stageOf, pendingFor, pendingMovs, movStage, conformidad, STAGES, activeSignatures } from './workflow.js';
import { detecto, detectoSays } from './detecto.js';
import { confirmModal } from './signature.js';
import {
  go, caseMeta, taskItem, movItem, slaChip, recentActivity, miniRibbon, notFound,
  viewNew, viewCase, viewMovs, viewMov, viewGuide, viewPrint,
} from './views.js';

/* ════════════ Portales ════════════ */
const NAV = {
  home: ['#/', 'Inicio', 'home'],
  nuevo: ['#/nuevo', 'Nuevo requerimiento', 'plus'],
  misReq: ['#/mis-requerimientos', 'Mis requerimientos', 'folder'],
  entrevistas: ['#/entrevistas', 'Entrevistas por evaluar', 'chat'],
  porValidar: ['#/por-validar', 'Por validar', 'check'],
  procesos: ['#/procesos', 'Todos los procesos', 'folder'],
  misProcesos: ['#/mis-procesos', 'Mis procesos', 'folder'],
  porAprobar: ['#/por-aprobar', 'Por aprobar', 'check'],
  decisiones: ['#/decisiones', 'Mis decisiones', 'book'],
  perfiles: ['#/perfiles', 'Perfiles por validar', 'check'],
  movs: ['#/movimientos', 'Movimientos internos', 'swap'],
  usuarios: ['#/usuarios', 'Usuarios y datos', 'gear'],
  guia: ['#/guia', 'Reglas del proceso', 'book'],
};

export const PORTALS = {
  jefe: { title: 'Portal del Solicitante', who: 'Jefatura inmediata', nav: ['home', 'nuevo', 'misReq', 'entrevistas', 'movs'],
    intro: 'Aquí solicitas personal, revisas en qué etapa va cada requerimiento y evalúas a los candidatos que GTC te envía.' },
  gtc: { title: 'Portal Jefatura de GTC', who: 'Gestión del Talento y Cultura', nav: ['home', 'porValidar', 'procesos', 'movs', 'usuarios', 'guia'],
    intro: 'Validas los requerimientos aprobados, defines la remuneración, asignas a la analista y supervisas todos los procesos.' },
  analista: { title: 'Portal Analista de Selección', who: 'Gestión del Talento y Cultura', nav: ['home', 'misProcesos', 'movs', 'guia'],
    intro: 'Llevas los procesos que te asignaron: perfil del puesto, terna, entrevistas en cadena y movimientos internos.' },
  da: { title: 'Portal Dirección Administrativa', who: 'Aprobaciones de la línea administrativa', nav: ['home', 'porAprobar', 'decisiones', 'movs'],
    intro: 'Apruebas u observas las ampliaciones y los puestos nuevos de la línea administrativa.' },
  dm: { title: 'Portal Dirección Médica', who: 'Aprobaciones de la línea asistencial', nav: ['home', 'porAprobar', 'decisiones'],
    intro: 'Apruebas u observas las ampliaciones y los puestos nuevos del personal asistencial.' },
  gg: { title: 'Portal Gerencia General', who: 'Aprobación final de vacantes', nav: ['home', 'porAprobar', 'decisiones', 'movs'],
    intro: 'Das la aprobación final a las ampliaciones y a los puestos nuevos antes de que GTC inicie la selección.' },
  procesos: { title: 'Portal Área de Procesos', who: 'MOF y organigrama', nav: ['home', 'perfiles'],
    intro: 'Validas las funciones de los puestos nuevos y actualizas el MOF y el organigrama.' },
  colaborador: { title: 'Portal del Colaborador', who: 'Movimientos internos', nav: ['home', 'movs'],
    intro: 'Revisas y firmas los movimientos internos que te involucran.' },
};
const portalOf = (u) => PORTALS[u.role] || PORTALS.colaborador;
const navAllowed = (u, key) => portalOf(u).nav.includes(key);

/* ════════════ Permisos de acceso ════════════ */
const signedBy = (u, c) => [...Object.values(c.forms || {}), ...Object.values(c.fichas || {})].some((f) => Object.values(f.signatures || {}).some((s) => s.userId === u.id));

export function canOpenCase(u, c) {
  if (!u || !c) return false;
  const rq = c.forms.RQ.data || {};
  switch (u.role) {
    case 'gtc': case 'analista': return true;
    case 'jefe': return c.createdBy === u.id;
    case 'da': case 'dm': case 'gg':
      return requiereAprobacion(rq) || signedBy(u, c) || (u.role === 'dm' && CONFIG.DM_FIRMA_TODO_ASISTENCIAL && esAsistencial(rq)) || aplicaEntrevistaFinal(rq.grupo_ocupacional);
    case 'procesos': return rq.motivo === 'puesto_nuevo' && !!c.forms.RQ.signatures?.gtc;
    default: return false;
  }
}

export function caseTabsFor(u, c) {
  const rq = c.forms.RQ.data || {};
  if (['jefe', 'gtc', 'analista'].includes(u.role)) return ['RQ', 'PERFIL', 'FICHA', 'HIST'];
  if (['da', 'dm', 'gg'].includes(u.role)) return ['RQ', 'PERFIL', ...(aplicaEntrevistaFinal(rq.grupo_ocupacional) ? ['FICHA'] : []), 'HIST'];
  if (u.role === 'procesos') return ['PERFIL', 'HIST'];
  return ['HIST'];
}

export function canOpenMov(u, m) {
  if (!u) return false;
  const sigs = Object.values(m.form.signatures || {});
  const mine = sigs.some((s) => s.userId === u.id);
  const st = movStage(m);
  const waitingMe = !st.done && (st.roles || []).includes(u.role);
  switch (u.role) {
    case 'gtc': case 'analista': return true;
    case 'jefe': return m.createdBy === u.id || mine || waitingMe;
    case 'da': case 'gg': return mine || waitingMe;
    case 'colaborador': return mine || normalize(m.form.data.colaborador) === normalize(u.name) || waitingMe;
    default: return false;
  }
}

export function listHref(u) {
  return { jefe: '#/mis-requerimientos', gtc: '#/procesos', analista: '#/mis-procesos', da: '#/por-aprobar', dm: '#/por-aprobar', gg: '#/por-aprobar', procesos: '#/perfiles', colaborador: '#/movimientos' }[u?.role] || '#/';
}

const visibleCases = (u) => store.getDB().cases.filter((c) => canOpenCase(u, c));
const visibleMovs = (u) => store.getDB().movimientos.filter((m) => canOpenMov(u, m));
const myPendingMovs = (u) => pendingMovs(u).filter((m) => canOpenMov(u, m));

/* ════════════ Inicio de sesión ════════════ */
export function viewLogin() {
  const user = h('input', { class: 'inp', id: 'lg-user', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const pass = h('input', { class: 'inp', id: 'lg-pass', type: 'password', autocomplete: 'current-password', required: true });
  const eye = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Mostrar contraseña', onclick: () => { pass.type = pass.type === 'password' ? 'text' : 'password'; eye.textContent = pass.type === 'password' ? 'Ver' : 'Ocultar'; } }, 'Ver');
  const err = h('p', { class: 'login-err', role: 'alert' });
  const btn = h('button', { class: 'btn btn-primary btn-big login-btn', type: 'submit' }, 'Ingresar');
  const form = h('form', { class: 'login-form', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Verificando…';
    try {
      await store.login(user.value, pass.value);
      if (store.REMOTE) CONFIG.DM_FIRMA_TODO_ASISTENCIAL = store.getDB().settings?.DM_FIRMA_TODO_ASISTENCIAL === true;
    } catch (ex) {
      btn.disabled = false; btn.textContent = 'Ingresar';
      err.textContent = ex.message; pass.select(); return;
    }
    btn.disabled = false; btn.textContent = 'Ingresar';
    location.hash = '#/'; route(); startLiveOnce();
  } },
    h('label', { class: 'lbl', for: 'lg-user' }, 'Usuario'), user,
    h('label', { class: 'lbl', for: 'lg-pass' }, 'Contraseña'), h('div', { class: 'pass-row' }, pass, eye),
    err, btn);

  const demo = store.REMOTE ? null : h('details', { class: 'demo-users' },
    h('summary', {}, 'Usuarios de demostración'),
    h('p', { class: 'muted small' }, `Contraseña de todos: ${store.DEMO_PASSWORD}. Toca un usuario para completarlo.`),
    h('ul', {}, store.users().filter((u) => !u.disabled).map((u) => h('li', {}, h('button', { type: 'button', onclick: () => { user.value = u.username; pass.value = store.DEMO_PASSWORD; btn.focus(); } },
      h('strong', {}, portalOf(u).title.replace('Portal ', '').replace(/^del |^de la |^de /, '').replace(/^./, (x) => x.toUpperCase())), h('span', {}, `${u.username} · ${u.name}`))))));

  setTimeout(() => user.focus(), 50);
  return h('div', { class: 'login' },
    h('section', { class: 'login-art' },
      h('div', { class: 'login-art-in' },
        detecto('idle', 'login-bot'),
        h('h1', {}, 'Hola, soy Detecto.'),
        h('p', {}, 'Te acompaño en cada paso: desde el requerimiento de personal hasta la selección del candidato. Cada área tiene su propia ventana.'))),
    h('section', { class: 'login-panel' },
      h('img', { src: 'assets/logo.png', alt: 'Detecta Clínica', class: 'login-logo' }),
      h('h2', {}, 'Ingresa a tu portal'),
      h('p', { class: 'muted' }, 'Gestión del Talento y Cultura'),
      form, demo));
}

/* ════════════ Marco de cada portal ════════════ */
function shell(content, active) {
  const u = store.currentUser();
  const P = portalOf(u);
  const counts = { home: pendingFor(u).length + myPendingMovs(u).length };
  const initials = u.name.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('');
  return h('div', { class: `app role-${u.role}` },
    h('a', { class: 'skiplink', href: '#main' }, 'Saltar al contenido'),
    h('aside', { class: 'side' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'Detecta Clínica · inicio' }, h('img', { src: 'assets/logo.png', alt: 'Detecta Clínica' })),
      h('div', { class: 'portal-id' }, h('strong', {}, P.title), h('span', {}, P.who)),
      h('nav', { 'aria-label': 'Principal' }, P.nav.map((k) => {
        const [href, label, icon] = NAV[k];
        const n = counts[k];
        return h('a', { href, class: `nav ${k === 'nuevo' ? 'nav-cta' : ''} ${active === href ? 'on' : ''}`, 'aria-current': active === href ? 'page' : false },
          h('span', { class: `ico ico-${icon}`, 'aria-hidden': 'true' }), h('span', {}, label), n ? h('span', { class: 'badge', title: 'Pendientes' }, n) : null);
      })),
      h('div', { class: 'whoami' },
        h('div', { class: 'me' }, h('span', { class: 'me-av', 'aria-hidden': 'true' }, initials), h('span', {}, h('strong', {}, u.name), h('br'), h('span', { class: 'small' }, u.cargo))),
        h('div', { class: 'me-actions' },
          h('button', { class: 'btn btn-side btn-sm', onclick: () => passwordModal(u) }, 'Cambiar contraseña'),
          h('button', { class: 'btn btn-side btn-sm', onclick: async (e) => { e.target.disabled = true; await store.logout(); location.hash = '#/'; route(); } }, 'Cerrar sesión')),
        h('p', { id: 'savestate', class: 'savestate' }, 'Guardado automático activo'))),
    h('main', { id: 'main', tabindex: '-1' }, content));
}

/* ════════════ Inicio de cada portal ════════════ */
function statsFor(u) {
  const cs = visibleCases(u);
  const abiertos = cs.filter((c) => !stageOf(c).closed);
  const mineDecided = (pred) => cs.filter((c) => Object.values(c.forms).some((f) => Object.values(f.signatures || {}).some((s) => s.userId === u.id && pred(s)))).length;
  switch (u.role) {
    case 'jefe': return [['Requerimientos en curso', abiertos.length], ['En aprobación', abiertos.filter((c) => stageOf(c).k === 'aprob').length], ['Cerrados', cs.length - abiertos.length]];
    case 'da': case 'dm': case 'gg': return [['Por aprobar', pendingFor(u).length, pendingFor(u).length > 0], ['Aprobados por mí', mineDecided((s) => s.decision === 'Aprobado')], ['Observados por mí', mineDecided((s) => s.decision === 'Observado')]];
    case 'procesos': return [['Perfiles por validar', pendingFor(u).length, pendingFor(u).length > 0]];
    case 'colaborador': return [['Movimientos por firmar', myPendingMovs(u).length]];
    default: {
      const riesgo = abiertos.filter((c) => ['riesgo', 'vencido'].includes(plazo(caseMeta(c)).estado));
      return [['Procesos abiertos', abiertos.length], ['En riesgo de plazo', riesgo.length, riesgo.length > 0], ['Movimientos abiertos', visibleMovs(u).filter((m) => !movStage(m).done).length]];
    }
  }
}

function viewHome() {
  const u = store.currentUser();
  const P = portalOf(u);
  const mine = pendingFor(u);
  const movs = myPendingMovs(u);
  const total = mine.length + movs.length;
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const first = u.name.split(' ')[0];
  const stats = statsFor(u);

  return h('div', { class: 'page' },
    h('header', { class: 'hero' },
      h('div', { class: 'hero-hi' },
        detecto(total ? 'idle' : 'happy', 'hero-bot'),
        h('div', {},
          h('p', { class: 'portal-kicker' }, P.title),
          h('h1', {}, `${saludo}, ${first}.`),
          h('p', { class: 'lead' }, total
            ? `Tienes ${total} ${total === 1 ? 'documento esperándote' : 'documentos esperándote'}. Empieza por el primero: te guío paso a paso.`
            : 'Estás al día: no tienes documentos pendientes.'))),
      h('dl', { class: 'pulse-strip' }, stats.map(([l, v, alert]) => h('div', { class: alert ? 'alert' : '' }, h('dt', {}, l), h('dd', {}, v))))),
    u.role === 'jefe' ? h('a', { class: 'big-cta', href: '#/nuevo' },
      h('span', { class: 'big-cta-plus', 'aria-hidden': 'true' }, '+'),
      h('span', {}, h('strong', {}, '¿Necesitas cubrir una posición?'), h('br'), h('span', {}, 'Inicia un requerimiento de personal. Detecto te pedirá solo lo necesario.'))) : null,
    h('section', { class: 'block' },
      h('div', { class: 'block-head' }, h('h2', {}, 'Te toca')),
      total ? h('ul', { class: 'tasks' }, mine.map(taskItem), movs.map(movItem))
        : h('div', { class: 'empty' }, h('p', {}, emptyText(u)))),
    h('section', { class: 'block' }, h('h2', {}, 'Qué hace este portal'), h('p', { class: 'muted portal-intro' }, P.intro)),
    h('section', { class: 'block' }, h('h2', {}, 'Actividad reciente'), recentActivity(visibleCases(u), visibleMovs(u))));
}

function emptyText(u) {
  return {
    jefe: 'Cuando GTC te envíe candidatos para evaluar o te devuelvan un requerimiento con observaciones, aparecerá aquí.',
    gtc: 'Cuando un requerimiento llegue para validación o una ficha necesite tu firma, aparecerá aquí.',
    analista: 'Cuando te asignen un proceso o una ficha vuelva de la jefatura, aparecerá aquí.',
    da: 'Cuando una ampliación o un puesto nuevo necesite tu aprobación, aparecerá aquí.',
    dm: 'Cuando una ampliación o un puesto nuevo asistencial necesite tu aprobación, aparecerá aquí.',
    gg: 'Cuando una vacante necesite la aprobación de Gerencia, aparecerá aquí.',
    procesos: 'Cuando GTC valide el perfil de un puesto nuevo, aparecerá aquí para que actualices el MOF.',
    colaborador: 'Cuando tengas un movimiento interno por firmar, aparecerá aquí.',
  }[u.role] || '';
}

/* ════════════ Listas de cada portal ════════════ */
function caseTable(rows, empty) {
  if (!rows.length) return h('div', { class: 'empty' }, h('p', {}, empty));
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl tbl-list' },
    h('thead', {}, h('tr', {}, ['Código', 'Puesto', 'Motivo', 'Avance', 'Etapa actual', 'Plazo'].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows.map((c) => {
      const d = c.forms.RQ.data; const st = stageOf(c);
      return h('tr', { class: 'clickable', tabindex: 0, onclick: () => go(`#/caso/${c.id}`), onkeydown: (e) => { if (e.key === 'Enter') go(`#/caso/${c.id}`); } },
        h('td', { class: 'mono' }, c.id),
        h('td', {}, h('strong', {}, d.puesto || 'Borrador sin nombre'), h('br'), h('span', { class: 'muted small' }, d.area || '')),
        h('td', {}, motivoLabel(d.motivo)),
        h('td', {}, miniRibbon(c)),
        h('td', {}, st.closed ? h('span', { class: `tag tag-${st.closed}` }, st.note) : h('span', {}, st.note, h('br'), h('span', { class: 'muted small' }, st.roles.map((r) => ROLES[r]).join(' / ')))),
        h('td', {}, slaChip(plazo(caseMeta(c)))));
    }))));
}

function listPage(title, lead, rows, empty, filters = null) {
  return h('div', { class: 'page' },
    h('div', { class: 'block-head' }, h('div', {}, h('h1', {}, title), lead ? h('p', { class: 'lead' }, lead) : null)),
    filters, caseTable(rows, empty));
}

function filtered(title, lead, all, empty, key) {
  let f = sessionStorage.getItem(key) || 'abiertos';
  const body = h('div');
  const draw = () => body.replaceChildren(caseTable(all.filter((c) => { const st = stageOf(c); return f === 'todos' || (f === 'abiertos' ? !st.closed : !!st.closed); }), empty));
  const seg = h('div', { class: 'seg', role: 'tablist' }, [['abiertos', 'En curso'], ['cerrados', 'Cerrados'], ['todos', 'Todos']].map(([k, l]) =>
    h('button', { role: 'tab', 'aria-selected': f === k, class: f === k ? 'on' : '', onclick: (e) => { f = k; sessionStorage.setItem(key, k); seg.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === e.target); b.setAttribute('aria-selected', b === e.target); }); draw(); } }, l)));
  draw();
  return h('div', { class: 'page' }, h('div', { class: 'block-head' }, h('div', {}, h('h1', {}, title), lead ? h('p', { class: 'lead' }, lead) : null), seg), body);
}

function viewInterviews() {
  const u = store.currentUser();
  const rows = [];
  visibleCases(u).forEach((c) => (c.candidatos || []).forEach((cand) => {
    const f = c.fichas?.[cand.dni];
    if (!f || f.data.continua !== 'Sí' || !f.remitidaAt) return;
    rows.push({ c, cand, f });
  }));
  const pend = rows.filter((r) => !r.f.signatures?.jefatura);
  const done = rows.filter((r) => r.f.signatures?.jefatura);
  const item = ({ c, cand, f }) => {
    const hrs = hoursSince(f.remitidaAt);
    const late = !f.signatures?.jefatura && hrs > CONFIG.HORAS_DEVOLUCION_FICHA;
    const r = calcularFicha(f.data);
    return h('li', {}, h('a', { class: 'task', href: `#/caso/${c.id}/FICHA/${encodeURIComponent(cand.dni)}` },
      h('span', { class: 'task-code' }, c.id),
      h('span', { class: 'task-main' }, h('strong', {}, cand.nombre), h('span', { class: 'muted' }, c.forms.RQ.data.puesto)),
      h('span', { class: `task-stage ${late ? 'late' : ''}` }, f.signatures?.jefatura ? `Devuelta · ${r.resultado}` : late ? `Plazo de 24 h excedido (${Math.floor(hrs)} h)` : `Devuélvela en ${Math.max(0, Math.ceil(CONFIG.HORAS_DEVOLUCION_FICHA - hrs))} h`),
      h('span', {}), h('span', { class: 'go' }, f.signatures?.jefatura ? 'Ver' : 'Evaluar')));
  };
  return h('div', { class: 'page' },
    h('h1', {}, 'Entrevistas por evaluar'),
    h('p', { class: 'lead' }, 'GTC te remite la ficha de cada candidato de la terna. Completa la entrevista técnica y fírmala en un máximo de 24 horas.'),
    h('section', { class: 'block' }, h('h2', {}, 'Pendientes'), pend.length ? h('ul', { class: 'tasks' }, pend.map(item)) : h('div', { class: 'empty' }, h('p', {}, 'No tienes fichas pendientes.'))),
    done.length ? h('section', { class: 'block' }, h('h2', {}, 'Devueltas'), h('ul', { class: 'tasks' }, done.map(item))) : null);
}

function viewDecisions() {
  const u = store.currentUser();
  const rows = [];
  visibleCases(u).forEach((c) => Object.entries(c.forms).forEach(([k, f]) => Object.values(f.signatures || {}).forEach((s) => { if (s.userId === u.id) rows.push({ c, k, s }); })));
  rows.sort((a, b) => b.s.at.localeCompare(a.s.at));
  return h('div', { class: 'page' },
    h('h1', {}, 'Mis decisiones'),
    h('p', { class: 'lead' }, 'Todo lo que aprobaste u observaste, con fecha y comentario.'),
    rows.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl tbl-list' },
      h('thead', {}, h('tr', {}, ['Fecha', 'Expediente', 'Puesto', 'Documento', 'Decisión', 'Comentario'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map(({ c, k, s }) => h('tr', { class: 'clickable', tabindex: 0, onclick: () => go(`#/caso/${c.id}/${k}`) },
        h('td', {}, fmtDate(s.at, true)), h('td', { class: 'mono' }, c.id), h('td', {}, c.forms.RQ.data.puesto || '—'), h('td', {}, FORMS[k]?.title || k),
        h('td', {}, s.decision ? h('span', { class: `dec dec-${s.decision.toLowerCase()}` }, s.decision) : 'Firmado'), h('td', { class: 'muted small' }, s.comment || '—'))))))
      : h('div', { class: 'empty' }, h('p', {}, 'Aún no has tomado decisiones.')));
}

/* ════════════ Usuarios (solo Jefatura de GTC) ════════════ */
const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); return true; } catch (e) { toast(e.message || String(e), 'warn'); return false; } };

function askPassword(title, body) {
  return new Promise((resolve) => {
    const inp = h('input', { class: 'inp', type: 'text', autocomplete: 'off', 'aria-label': 'Contraseña temporal' });
    const msg = h('p', { class: 'err' });
    const close = (v) => { bg.remove(); resolve(v); };
    const bg = h('div', { class: 'modal-bg' }, h('form', { class: 'modal modal-sm', role: 'dialog', 'aria-modal': 'true', onsubmit: (e) => {
      e.preventDefault();
      if (inp.value.length < 8) { msg.textContent = 'Mínimo 8 caracteres.'; return; }
      close(inp.value);
    } },
      h('header', {}, h('h2', {}, title), h('p', { class: 'muted' }, body)),
      h('label', { class: 'lbl' }, 'Contraseña temporal (mínimo 8 caracteres)'), inp, msg,
      h('footer', {}, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => close(null) }, 'Cancelar'), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar'))));
    document.body.append(bg); inp.focus();
  });
}

function viewUsers() {
  const me = store.currentUser();
  const list = h('div');
  const draw = () => list.replaceChildren(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['Nombre', 'Usuario', 'Cargo', 'Portal', 'Estado', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, store.users().map((u) => h('tr', { class: u.disabled ? 'row-off' : '' },
      h('td', {}, h('input', { class: 'inp', value: u.name, 'aria-label': 'Nombre', onchange: (e) => run(() => store.adminUpdateUser(u.id, { name: e.target.value.trim() }), 'Nombre actualizado.') })),
      h('td', { class: 'mono' }, u.username),
      h('td', {}, h('input', { class: 'inp', value: u.cargo, 'aria-label': 'Cargo', onchange: (e) => run(() => store.adminUpdateUser(u.id, { cargo: e.target.value }), 'Cargo actualizado.') })),
      h('td', {}, h('select', { class: 'inp', 'aria-label': 'Portal', disabled: u.id === me.id, onchange: async (e) => { await run(() => store.adminUpdateUser(u.id, { role: e.target.value }), 'Portal actualizado.'); draw(); } }, Object.keys(PORTALS).map((k) => h('option', { value: k, selected: u.role === k }, PORTALS[k].title)))),
      h('td', {}, u.disabled ? h('span', { class: 'tag tag-desaprobado' }, 'Desactivado') : h('span', { class: 'tag tag-ok' }, u.mustChange ? 'Activo · clave temporal' : 'Activo')),
      h('td', { class: 'row-actions' },
        h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
          const pw = store.REMOTE ? await askPassword('Restablecer contraseña', `Escribe una contraseña temporal para ${u.name}. Al ingresar se le pedirá crear una propia.`) : store.DEMO_PASSWORD;
          if (!pw) return;
          if (!store.REMOTE && !(await confirmModal({ title: 'Restablecer contraseña', body: `La contraseña de ${u.name} volverá a ser ${store.DEMO_PASSWORD}.`, ok: 'Restablecer' }))) return;
          await run(() => store.adminResetPassword(u.id, pw), 'Contraseña restablecida. Comunícasela a la persona por un canal privado.');
          draw();
        } }, 'Restablecer clave'),
        u.id !== me.id ? h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
          const act = u.disabled;
          if (!act && !(await confirmModal({ title: 'Desactivar usuario', body: `${u.name} ya no podrá ingresar. Sus firmas y registros anteriores se conservan.`, ok: 'Desactivar', danger: true }))) return;
          await run(() => store.adminSetActive(u.id, act), act ? 'Usuario reactivado.' : 'Usuario desactivado.');
          draw();
        } }, u.disabled ? 'Reactivar' : 'Desactivar') : null)))))));
  draw();

  const nName = h('input', { class: 'inp', placeholder: 'Nombre completo', 'aria-label': 'Nombre completo' });
  const nUser = h('input', { class: 'inp', placeholder: 'usuario', 'aria-label': 'Usuario', autocapitalize: 'none' });
  const nCargo = h('input', { class: 'inp', placeholder: 'Cargo', 'aria-label': 'Cargo' });
  const nRole = h('select', { class: 'inp', 'aria-label': 'Portal' }, Object.keys(PORTALS).map((k) => h('option', { value: k }, PORTALS[k].title)));
  const nPass = h('input', { class: 'inp', placeholder: 'Contraseña temporal', 'aria-label': 'Contraseña temporal', autocomplete: 'off', value: store.REMOTE ? '' : store.DEMO_PASSWORD });
  const msg = h('p', { class: 'err' });
  const add = h('form', { class: 'addcand', onsubmit: async (e) => {
    e.preventDefault(); msg.textContent = '';
    const un = nUser.value.trim().toLowerCase();
    if (nName.value.trim().length < 5) { msg.textContent = 'Escribe el nombre completo.'; return nName.focus(); }
    if (!/^[a-z0-9._-]{3,30}$/.test(un)) { msg.textContent = 'El usuario debe tener de 3 a 30 caracteres: minúsculas, números, punto o guion, sin espacios ni tildes.'; return nUser.focus(); }
    if (store.users().some((x) => x.username === un)) { msg.textContent = 'Ese usuario ya existe.'; return nUser.focus(); }
    if (nPass.value.length < 8) { msg.textContent = 'La contraseña temporal debe tener al menos 8 caracteres.'; return nPass.focus(); }
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    const ok = await run(() => store.adminCreateUser({ name: nName.value.trim(), username: un, cargo: nCargo.value.trim() || PORTALS[nRole.value].who, role: nRole.value, password: nPass.value }), `Usuario creado. Entrega a la persona su usuario (${un}) y la contraseña temporal.`);
    btn.disabled = false;
    if (ok) route();
  } }, h('div', { class: 'addcand-row' }, nName, nUser, nCargo, nRole, nPass, h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Crear usuario')), msg);

  const fileIn = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
    try { store.importJSON(await e.target.files[0].text()); toast('Respaldo importado.'); route(); } catch (err) { toast(err.message, 'warn'); }
  } });
  return h('div', { class: 'page page-narrow' },
    h('h1', {}, 'Usuarios y datos'),
    h('p', { class: 'lead' }, 'Cada usuario entra a su propio portal según su rol. Las cuentas nuevas reciben una contraseña temporal y deben cambiarla al ingresar. Desactivar a alguien conserva sus firmas anteriores.'),
    store.REMOTE ? h('p', { class: 'tag tag-ok conn-tag' }, 'Conectado a la base de datos compartida') : h('p', { class: 'tag tag-warn conn-tag' }, 'Modo demostración: los datos se guardan solo en este navegador'),
    h('section', { class: 'block' }, h('h2', {}, 'Usuarios'), list, h('h3', { class: 'sub-h' }, 'Agregar usuario'), add),
    h('section', { class: 'block' }, h('h2', {}, 'Parámetros'),
      h('label', { class: 'decl' }, h('input', { type: 'checkbox', checked: CONFIG.DM_FIRMA_TODO_ASISTENCIAL, onchange: async (e) => {
        const v = e.target.checked;
        if (await run(() => store.saveSetting('DM_FIRMA_TODO_ASISTENCIAL', v), 'Parámetro actualizado.')) { CONFIG.DM_FIRMA_TODO_ASISTENCIAL = v; if (!store.REMOTE) localStorage.setItem('detecta-gtc:dm', v ? '1' : '0'); }
        else e.target.checked = !v;
      } }),
        h('span', {}, 'Exigir firma de Dirección Médica en todo requerimiento asistencial, aunque sea reemplazo o suplencia (como indica el formato RQ físico; PRC-GTC-01 no lo exige).'))),
    h('section', { class: 'block' }, h('h2', {}, 'Respaldo'),
      h('p', { class: 'muted' }, store.REMOTE ? 'La información se guarda en la base de datos de Supabase, que hace copias de seguridad automáticas según el plan contratado. Aquí puedes descargar una copia de lo que tienes visible.' : 'Esta versión guarda la información en este navegador. Exporta un respaldo con frecuencia.'),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn btn-primary', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' })), download: `detecta-gtc-respaldo-${todayISO()}.json` }); a.click(); } }, 'Exportar respaldo'),
        store.REMOTE ? null : h('button', { class: 'btn btn-ghost', onclick: () => fileIn.click() }, 'Importar respaldo'), fileIn,
        store.REMOTE ? null : h('button', { class: 'btn btn-danger', onclick: async () => { if (await confirmModal({ title: 'Restablecer datos', body: 'Se borrarán todos los expedientes y usuarios de este navegador y se cargarán los de demostración.', ok: 'Restablecer', danger: true })) { store.resetAll(true); await store.logout(); route(); } } }, 'Restablecer demostración'))));
}

/* ════════════ Cambio de contraseña ════════════ */
export function passwordModal(u, forced = false) {
  const cur = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password', 'aria-label': 'Contraseña actual' });
  const n1 = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password', 'aria-label': 'Nueva contraseña' });
  const n2 = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password', 'aria-label': 'Repite la nueva contraseña' });
  const msg = h('p', { class: 'err' });
  const close = () => bg.remove();
  const bg = h('div', { class: 'modal-bg' }, h('form', { class: 'modal modal-sm', role: 'dialog', 'aria-modal': 'true', onsubmit: async (e) => {
    e.preventDefault(); msg.textContent = '';
    if (n1.value.length < 8) { msg.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return n1.focus(); }
    if (n1.value !== n2.value) { msg.textContent = 'Las contraseñas nuevas no coinciden.'; return n2.focus(); }
    if (n1.value === cur.value) { msg.textContent = 'La nueva contraseña debe ser distinta de la actual.'; return n1.focus(); }
    const sb = e.target.querySelector('button[type=submit]'); sb.disabled = true;
    if (!(await store.checkPassword(u, cur.value))) { sb.disabled = false; msg.textContent = 'La contraseña actual no es correcta.'; return cur.focus(); }
    try { await store.changeMyPassword(n1.value); } catch (ex) { sb.disabled = false; msg.textContent = ex.message || String(ex); return; }
    close(); toast('Contraseña actualizada.'); route();
  } },
    h('header', {}, h('h2', {}, forced ? 'Crea tu contraseña personal' : 'Cambiar contraseña'), forced ? h('p', { class: 'muted' }, 'Estás usando la contraseña inicial. Cámbiala para proteger tus firmas.') : null),
    h('label', { class: 'lbl' }, 'Contraseña actual'), cur,
    h('label', { class: 'lbl' }, 'Nueva contraseña (mínimo 8 caracteres)'), n1,
    h('label', { class: 'lbl' }, 'Repite la nueva contraseña'), n2, msg,
    h('footer', {}, forced ? null : h('button', { type: 'button', class: 'btn btn-ghost', onclick: close }, 'Cancelar'), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar'))));
  document.body.append(bg);
  cur.focus();
}

/* ════════════ Cambios en vivo ════════════ */
let liveStarted = false;
let pendingRender = false;
export function startLiveOnce() {
  if (liveStarted || !store.REMOTE || !store.currentUser()) return;
  liveStarted = true;
  store.startLive(() => {
    // No interrumpir a quien está escribiendo: se actualiza al salir del campo
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !a.closest('.login') ) { pendingRender = true; return; }
    if (document.querySelector('.modal-bg')) { pendingRender = true; return; }
    route();
  }).catch((e) => console.warn('Sin actualización en vivo', e));
  document.addEventListener('focusout', () => setTimeout(() => {
    const a = document.activeElement;
    if (pendingRender && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) && !document.querySelector('.modal-bg')) { pendingRender = false; route(); }
  }, 300));
}

/* ════════════ Router ════════════ */
export function route() {
  const app = document.getElementById('app');
  document.querySelectorAll('.modal-bg').forEach((m) => { if (!store.currentUser()) m.remove(); });
  const u = store.currentUser();
  if (!u) { document.body.classList.remove('printing'); app.replaceChildren(viewLogin()); document.title = 'Ingresar · GTC Detecta Clínica'; return; }
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const [a, b, c, d2] = parts;
  document.body.classList.toggle('printing', a === 'imprimir');
  if (a === 'imprimir') { app.replaceChildren(viewPrint(b, c, d2, parts[4])); return; }
  const deny = () => notFound('Esta sección no forma parte de tu portal.');
  const need = (key, fn) => (navAllowed(u, key) ? fn() : deny());
  let view; let active = '#/';
  const cases = visibleCases(u);
  switch (a) {
    case undefined: view = viewHome(); break;
    case 'nuevo': active = '#/nuevo'; view = need('nuevo', viewNew); break;
    case 'mis-requerimientos': active = '#/mis-requerimientos'; view = need('misReq', () => filtered('Mis requerimientos', 'Todos los requerimientos que iniciaste y la etapa en la que está cada uno.', cases, 'Aún no has creado requerimientos.', 'f-jefe')); break;
    case 'entrevistas': active = '#/entrevistas'; view = need('entrevistas', viewInterviews); break;
    case 'por-validar': active = '#/por-validar'; view = need('porValidar', () => listPage('Por validar', 'Requerimientos, perfiles y fichas que esperan la firma de la Jefatura de GTC.', pendingFor(u), 'No hay documentos esperando tu validación.')); break;
    case 'procesos': active = '#/procesos'; view = need('procesos', () => filtered('Todos los procesos', 'Vista general de los procesos de selección de la clínica.', cases, 'No hay procesos registrados.', 'f-gtc')); break;
    case 'mis-procesos': active = '#/mis-procesos'; view = need('misProcesos', () => filtered('Mis procesos', 'Procesos que la Jefatura de GTC te asignó.', cases.filter((x) => x.forms.RQ.data.analista_id === u.id), 'Aún no tienes procesos asignados.', 'f-an')); break;
    case 'por-aprobar': active = '#/por-aprobar'; view = need('porAprobar', () => listPage('Por aprobar', 'Ampliaciones y puestos nuevos que necesitan tu decisión. Puedes aprobar u observar con un comentario.', pendingFor(u), 'No tienes vacantes por aprobar.')); break;
    case 'decisiones': active = '#/decisiones'; view = need('decisiones', viewDecisions); break;
    case 'perfiles': active = '#/perfiles'; view = need('perfiles', () => listPage('Perfiles por validar', 'Puestos nuevos cuyo perfil ya validó GTC. Revisa las funciones y confirma la actualización del MOF y del organigrama.', pendingFor(u), 'No hay perfiles por validar.')); break;
    case 'caso': active = ''; view = viewCase(b, c, d2); break;
    case 'movimientos': active = '#/movimientos'; view = need('movs', viewMovs); break;
    case 'movimiento': active = '#/movimientos'; view = need('movs', () => viewMov(b)); break;
    case 'usuarios': active = '#/usuarios'; view = need('usuarios', viewUsers); break;
    case 'guia': active = '#/guia'; view = need('guia', viewGuide); break;
    default: view = notFound('La dirección no existe.');
  }
  app.replaceChildren(shell(view, active));
  document.title = `${document.querySelector('main h1')?.textContent || 'GTC'} · ${portalOf(u).title}`;
  if (u.mustChange && !document.querySelector('.modal-bg')) passwordModal(u, true);
}

export { STAGES, activeSignatures, conformidad };
