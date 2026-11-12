// Motor de formularios: dibuja un esquema, valida campos obligatorios y reglas, y refleja los cambios en vivo.
import { h, esc, todayISO } from './util.js';
import * as store from './store.js';
import { ROLES } from './rules.js';

const EMPTY = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export function resolveOpts(opts, ctx) {
  if (Array.isArray(opts)) return opts;
  if (typeof opts === 'string' && opts.startsWith('users:')) {
    const role = opts.slice(6);
    return store.users().filter((u) => u.role === role).map((u) => ({ v: u.id, l: u.name }));
  }
  if (opts === 'ctx:aptos') return ctx?.aptos || [];
  return [];
}
const resolveRows = (rows, ctx) => (rows === 'ctx:expediente' ? ctx?.expedienteRows || [] : rows);

const isReq = (f, d, ctx) => (typeof f.req === 'function' ? !!f.req(d, ctx) : !!f.req);
const isShown = (f, d, ctx) => (f.show ? !!f.show(d, ctx) : true);

export function sectionFieldKeys(schema, sectionId) {
  const sec = schema.sections.find((s) => s.id === sectionId);
  if (!sec) return [];
  return sec.fields.filter((f) => !['info', 'calc'].includes(f.t)).flatMap((f) => (f.t === 'score' ? [f.k, `${f.k}_ev`] : [f.k]));
}

/* ───────── Validación ───────── */
function fieldProblems(f, d, ctx) {
  // Devuelve lista de {k, m} para un campo visible
  const v = d[f.k];
  const out = [];
  const req = isReq(f, d, ctx);
  switch (f.t) {
    case 'info': case 'calc': return out;
    case 'checks':
      if (req && EMPTY(v)) out.push({ k: f.k, m: 'Seleccione al menos una opción.', missing: true });
      if (f.max && (v || []).length > f.max) out.push({ k: f.k, m: `Máximo ${f.max} opciones.` });
      if (f.all && (v || []).length < f.opts.length) out.push({ k: f.k, m: 'Debe confirmar todas las acciones de ejecución.', missing: true });
      return out;
    case 'matrix': {
      const rows = resolveRows(f.rows, ctx);
      const miss = rows.filter((r) => EMPTY((v || {})[r]));
      if (req && miss.length) out.push({ k: f.k, m: `Falta responder ${miss.length} fila(s).`, missing: true, count: miss.length });
      return out;
    }
    case 'compare': {
      let n = 0;
      f.rows.forEach((r) => f.cols.forEach((c, i) => { if (EMPTY((v || {})[r]?.[i])) n++; }));
      if (req && n) out.push({ k: f.k, m: `Faltan ${n} casilla(s) del comparativo.`, missing: true, count: n });
      return out;
    }
    case 'table': {
      const rows = v || [];
      const nRows = f.fixedRows ? f.fixedRows.length : rows.length;
      if (req && !f.fixedRows && rows.length < (f.minRows || 1)) out.push({ k: f.k, m: `Registre al menos ${f.minRows || 1} fila(s).`, missing: true, count: (f.minRows || 1) - rows.length });
      for (let i = 0; i < nRows; i++) {
        const r = rows[i] || {};
        f.cols.forEach((c) => {
          const creq = typeof c.req === 'function' ? c.req(r) : c.req;
          if (creq && EMPTY(r[c.k])) out.push({ k: `${f.k}.${i}.${c.k}`, m: `${c.label}: obligatorio.`, missing: true });
          else if (c.pattern && !EMPTY(r[c.k]) && !new RegExp(c.pattern).test(r[c.k])) out.push({ k: `${f.k}.${i}.${c.k}`, m: c.patternMsg || 'Formato no válido.' });
        });
      }
      return out;
    }
    case 'score': {
      if (req && !(Number(v) >= 1)) out.push({ k: f.k, m: 'Asigne una nota de 1 a 5.', missing: true });
      if ([1, 2, 5].includes(Number(v)) && EMPTY(d[`${f.k}_ev`])) out.push({ k: `${f.k}_ev`, m: 'Registre la evidencia (obligatoria en notas 1, 2 y 5).', missing: true });
      return out;
    }
    default:
      if (req && EMPTY(v)) { out.push({ k: f.k, m: 'Campo obligatorio.', missing: true }); return out; }
      if (!EMPTY(v) && f.minLen && String(v).trim().length < f.minLen) out.push({ k: f.k, m: `Describa con más detalle (mínimo ${f.minLen} caracteres).`, missing: true });
      if (!EMPTY(v) && f.pattern && !new RegExp(f.pattern).test(String(v).trim())) out.push({ k: f.k, m: f.patternMsg || 'Formato no válido.' });
      if (!EMPTY(v) && (f.t === 'number' || f.t === 'money')) {
        const n = Number(v);
        if (isNaN(n)) out.push({ k: f.k, m: 'Ingrese un número.' });
        else if (f.min !== undefined && typeof f.min === 'number' && n < f.min) out.push({ k: f.k, m: `Mínimo ${f.min}.` });
        else if (f.max !== undefined && n > f.max) out.push({ k: f.k, m: `Máximo ${f.max}.` });
        else if (f.t === 'money' && n < 0) out.push({ k: f.k, m: 'El monto no puede ser negativo.' });
      }
      return out;
  }
}

export function validateForm(schema, data, ctx, onlySections = null) {
  const d = data || {};
  const res = { missing: 0, total: 0, hard: [], soft: [], bySection: {}, problems: new Map() };
  for (const sec of schema.sections) {
    if (onlySections && !onlySections.includes(sec.id)) continue;
    if (sec.show && !sec.show(d, ctx)) continue;
    const bs = (res.bySection[sec.id] = { missing: 0, total: 0, problems: [] });
    for (const f of sec.fields) {
      if (!isShown(f, d, ctx) || ['info', 'calc'].includes(f.t)) continue;
      if (isReq(f, d, ctx) || f.t === 'table' || f.t === 'score') bs.total++;
      for (const p of fieldProblems(f, d, ctx)) {
        bs.problems.push(p);
        res.problems.set(p.k, p.m);
        if (p.missing) bs.missing++; else res.hard.push(p);
      }
    }
    res.missing += bs.missing; res.total += bs.total;
  }
  // Reglas cruzadas propias del formato
  const keysInScope = onlySections ? new Set(onlySections.flatMap((id) => sectionFieldKeys(schema, id))) : null;
  for (const e of schema.validate?.(d, ctx) || []) {
    const root = e.k.split('.')[0];
    if (keysInScope && !keysInScope.has(root)) continue;
    const sec = schema.sections.find((s) => s.fields.some((f) => f.k === root));
    if (sec && sec.show && !sec.show(d, ctx)) continue;
    if (!res.problems.has(e.k)) res.problems.set(e.k, e.m);
    (e.soft ? res.soft : res.hard).push(e);
    if (sec && res.bySection[sec.id]) res.bySection[sec.id].problems.push(e);
  }
  res.complete = res.missing === 0 && res.hard.length === 0;
  return res;
}

/* ───────── Render ───────── */
export function renderForm(opts) {
  const { schema, form, ctx, user, states, onDiscrete, onText, generators = {}, showErrors = false, prefill } = opts;
  const d = (form.data = form.data || {});
  const v = validateForm(schema, d, ctx);
  const root = h('div', { class: 'sheet', dataset: { form: schema.key } });

  schema.sections.forEach((sec, si) => {
    if (sec.show && !sec.show(d, ctx)) return;
    const st = states(sec);
    if (st.editable && prefill) {
      sec.fields.forEach((f) => {
        if (f.prefill && EMPTY(d[f.k])) { const pv = prefill(f.prefill, ctx); if (!EMPTY(pv)) d[f.k] = pv; }
      });
    }
    const bs = v.bySection[sec.id] || { missing: 0, total: 0 };
    const status = !st.editable && st.waiting ? 'wait' : bs.missing === 0 && !bs.problems?.some((p) => !p.missing && !p.soft) ? 'ok' : 'todo';
    const secEl = h('section', { class: `sec sec-${status} ${st.editable ? 'is-edit' : 'is-ro'}`, id: `sec-${sec.id}` },
      h('header', { class: 'sec-head' },
        h('span', { class: 'sec-num', 'aria-hidden': 'true' }, String(si + 1).padStart(2, '0')),
        h('div', { class: 'sec-titles' },
          h('h3', {}, sec.title),
          h('p', { class: 'sec-meta' },
            st.editable ? `Completa: ${sec.by.map((r) => ROLES[r]).join(' / ')}` : st.reason,
            sec.nuevo ? h('span', { class: 'tag tag-new', title: 'Campo añadido para cumplir el procedimiento' }, `Nuevo · ${sec.nuevo}`) : null)),
        h('span', { class: `sec-state st-${status}` }, status === 'ok' ? 'Completo' : status === 'wait' ? 'En espera' : `${bs.missing} pendiente${bs.missing === 1 ? '' : 's'}`)),
      sec.note ? h('p', { class: 'sec-note' }, sec.note) : null,
    );
    const grid = h('div', { class: 'grid' });
    sec.fields.forEach((f) => {
      if (!isShown(f, d, ctx)) return;
      grid.append(renderField(f, d, ctx, { ro: !st.editable, problems: v.problems, showErrors: showErrors && st.editable, onDiscrete, onText, generators, user }));
    });
    secEl.append(grid);
    root.append(secEl);
  });
  return root;
}

function fieldWrap(f, inner, { problems, showErrors, extraClass = '' }) {
  const prob = problems.get(f.k);
  const req = f._req;
  return h('div', { class: `fld w-${f.w || 'full'} t-${f.t} ${extraClass} ${prob && showErrors ? 'has-err' : ''}`, dataset: { k: f.k } },
    f.label ? h('label', { class: 'lbl', for: `f_${f.k}` }, f.label, req ? h('span', { class: 'req', title: 'Obligatorio', 'aria-label': 'obligatorio' }) : null,
      f.nuevo ? h('span', { class: 'tag tag-new', title: 'Campo añadido para cumplir el procedimiento' }, 'Nuevo') : null) : null,
    inner,
    f.hint ? h('p', { class: 'hint' }, f.hint) : null,
    h('p', { class: 'err', role: 'alert' }, prob && showErrors ? prob : ''));
}

function renderField(f, d, ctx, o) {
  f._req = isReq(f, d, ctx);
  const { ro, onDiscrete, onText } = o;
  const set = (k, val, discrete) => { d[k] = val; (discrete ? onDiscrete : onText)(k); };
  const id = `f_${f.k}`;

  switch (f.t) {
    case 'info':
      return h('div', { class: 'fld w-full t-info' }, h('p', { class: 'info' }, f.text));
    case 'calc': {
      const val = f.calc(d, ctx);
      return fieldWrap(f, h('div', { class: 'calc', dataset: { calc: f.k } }, renderCalc(f, val)), { ...o, extraClass: f.wide ? 'w-full' : '' });
    }
    case 'text': case 'date': case 'number': case 'money': {
      if (ro) return fieldWrap(f, h('div', { class: 'ink' }, display(f, d[f.k])), o);
      const attrs = { id, class: 'inp', value: d[f.k] ?? '', placeholder: f.placeholder || '', autocomplete: 'off' };
      if (f.t === 'date') { attrs.type = 'date'; if (f.min === 'today') attrs.min = todayISO(); }
      else if (f.t === 'number' || f.t === 'money') { attrs.type = 'number'; attrs.inputmode = 'decimal'; attrs.step = f.t === 'money' ? '0.01' : '1'; if (typeof f.min === 'number') attrs.min = f.min; if (f.max) attrs.max = f.max; }
      else attrs.type = 'text';
      const inp = h('input', { ...attrs, oninput: (e) => set(f.k, e.target.value, false) });
      const inner = f.t === 'money' ? h('div', { class: 'money' }, h('span', {}, 'S/'), inp) : inp;
      return fieldWrap(f, inner, o);
    }
    case 'textarea': {
      if (ro) return fieldWrap(f, h('div', { class: 'ink ink-block' }, display(f, d[f.k])), o);
      const ta = h('textarea', { id, class: 'inp', rows: f.rows || 3, placeholder: f.placeholder || '', oninput: (e) => set(f.k, e.target.value, false) });
      ta.value = d[f.k] ?? '';
      const tools = f.generator && o.generators[f.generator]
        ? h('div', { class: 'gen' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { d[f.k] = o.generators[f.generator](d, ctx); onDiscrete(f.k); } }, 'Generar borrador'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { navigator.clipboard?.writeText(d[f.k] || ''); } }, 'Copiar'))
        : null;
      return fieldWrap(f, h('div', {}, ta, tools), o);
    }
    case 'select': {
      const opts = resolveOpts(f.opts, ctx);
      if (ro) return fieldWrap(f, h('div', { class: 'ink' }, opts.find((x) => x.v === d[f.k])?.l || display(f, d[f.k])), o);
      const sel = h('select', { id, class: 'inp', onchange: (e) => set(f.k, e.target.value, true) },
        h('option', { value: '' }, opts.length ? 'Seleccione…' : 'Sin opciones disponibles'),
        opts.map((x) => h('option', { value: x.v, selected: d[f.k] === x.v }, x.l)));
      return fieldWrap(f, sel, o);
    }
    case 'radio': {
      const opts = resolveOpts(f.opts, ctx);
      const grp = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': f.label },
        opts.map((x) => h('label', { class: `chip ${d[f.k] === x.v ? 'on' : ''} ${ro ? 'ro' : ''}` },
          h('input', { type: 'radio', name: id, value: x.v, checked: d[f.k] === x.v, disabled: ro, onchange: () => set(f.k, x.v, true) }),
          h('span', {}, x.l))));
      return fieldWrap(f, grp, o);
    }
    case 'checks': {
      const cur = d[f.k] || [];
      const grp = h('div', { class: 'chips' },
        f.opts.map((x) => h('label', { class: `chip chip-check ${cur.includes(x.v) ? 'on' : ''} ${ro ? 'ro' : ''}` },
          h('input', { type: 'checkbox', checked: cur.includes(x.v), disabled: ro || (!cur.includes(x.v) && f.max && cur.length >= f.max),
            onchange: (e) => { const s = new Set(d[f.k] || []); e.target.checked ? s.add(x.v) : s.delete(x.v); set(f.k, f.opts.map((z) => z.v).filter((z) => s.has(z)), true); } }),
          h('span', {}, x.l))));
      const counter = f.max ? h('span', { class: 'counter' }, `${cur.length}/${f.max}`) : null;
      return fieldWrap(f, h('div', {}, grp, counter), o);
    }
    case 'toggle':
      return fieldWrap(f, h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!d[f.k], disabled: ro, onchange: (e) => set(f.k, e.target.checked, true) }), h('span', { class: 'knob' })), o);
    case 'matrix': {
      const rows = resolveRows(f.rows, ctx);
      const cur = d[f.k] || {};
      const tbl = h('table', { class: 'mx' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), f.opts.map((x) => h('th', {}, x.l)))),
        h('tbody', {}, rows.map((r) => h('tr', { class: cur[r] ? '' : 'mx-empty' }, h('th', { scope: 'row' }, r),
          f.opts.map((x) => h('td', {}, h('label', { class: 'dot' }, h('input', { type: 'radio', name: `${id}_${r}`, checked: cur[r] === x.v, disabled: ro, 'aria-label': `${r}: ${x.l}`,
            onchange: () => { d[f.k] = { ...(d[f.k] || {}), [r]: x.v }; onDiscrete(f.k); } }), h('span', {}))))))));
      return fieldWrap(f, h('div', { class: 'mx-wrap' }, tbl), o);
    }
    case 'compare': {
      const cur = d[f.k] || {};
      const tbl = h('table', { class: 'cmp' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Concepto'), f.cols.map((c) => h('th', {}, c)))),
        h('tbody', {}, f.rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, r), f.cols.map((c, i) => h('td', {},
          ro ? h('div', { class: 'ink' }, display({ t: r.startsWith('Remun') ? 'money' : 'text' }, cur[r]?.[i]))
            : h('input', { class: 'inp', type: r.startsWith('Remun') ? 'number' : 'text', value: cur[r]?.[i] ?? '', 'aria-label': `${r} · ${c}`,
              oninput: (e) => { const nv = { ...(d[f.k] || {}) }; nv[r] = [...(nv[r] || ['', ''])]; nv[r][i] = e.target.value; d[f.k] = nv; onText(f.k); } })))))));
      return fieldWrap(f, h('div', { class: 'mx-wrap' }, tbl), o);
    }
    case 'score': {
      const cur = Number(d[f.k]) || 0;
      const evk = `${f.k}_ev`;
      const needEv = [1, 2, 5].includes(cur);
      const evProb = o.problems.get(evk);
      const scale = h('div', { class: 'score', role: 'radiogroup', 'aria-label': f.label },
        [1, 2, 3, 4, 5].map((n) => h('label', { class: `pip ${cur === n ? 'on' : ''} ${cur >= n ? 'fill' : ''}` },
          h('input', { type: 'radio', name: id, value: n, checked: cur === n, disabled: ro, onchange: () => set(f.k, n, true) }), h('span', {}, n))));
      const ev = ro ? h('div', { class: 'ink ev' }, d[evk] || '—')
        : h('input', { class: `inp ev ${needEv ? 'ev-need' : ''}`, type: 'text', value: d[evk] ?? '', placeholder: needEv ? 'Evidencia obligatoria para esta nota' : 'Evidencia / comentario',
          'aria-label': `Evidencia de ${f.label}`, oninput: (e) => { d[evk] = e.target.value; onText(evk); } });
      const w = fieldWrap(f, h('div', { class: 'score-row' }, scale, ev), o);
      if (evProb && o.showErrors && !o.problems.get(f.k)) { w.classList.add('has-err'); w.querySelector('.err').textContent = evProb; }
      return w;
    }
    case 'table': return renderTable(f, d, ctx, o);
    default: return h('div', {}, `Tipo no soportado: ${f.t}`);
  }
}

function renderTable(f, d, ctx, o) {
  const { ro, onDiscrete, onText, problems, showErrors } = o;
  const fixed = !!f.fixedRows;
  if (fixed && (!d[f.k] || d[f.k].length !== f.fixedRows.length)) d[f.k] = f.fixedRows.map((_, i) => (d[f.k] || [])[i] || {});
  const rows = d[f.k] || [];
  const cell = (r, i, c) => {
    const key = `${f.k}.${i}.${c.k}`;
    const err = showErrors && problems.get(key);
    const upd = (val, discrete) => { r[c.k] = val; d[f.k] = [...rows]; (discrete ? onDiscrete : onText)(f.k); };
    let input;
    if (ro) input = h('div', { class: 'ink' }, c.t === 'toggle' ? (r[c.k] ? 'Sí' : 'No') : display(c, r[c.k]));
    else if (c.t === 'select') input = h('select', { class: 'inp', 'aria-label': c.label, onchange: (e) => upd(e.target.value, true) }, h('option', { value: '' }, '—'), resolveOpts(c.opts, ctx).map((x) => h('option', { value: x.v, selected: r[c.k] === x.v }, x.l)));
    else if (c.t === 'textarea') { input = h('textarea', { class: 'inp', rows: 2, 'aria-label': c.label, oninput: (e) => upd(e.target.value, false) }); input.value = r[c.k] ?? ''; }
    else if (c.t === 'toggle') input = h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!r[c.k], onchange: (e) => upd(e.target.checked, true) }), h('span', { class: 'knob' }));
    else input = h('input', { class: 'inp', type: c.t === 'money' ? 'number' : 'text', value: r[c.k] ?? '', 'aria-label': c.label, oninput: (e) => upd(e.target.value, false) });
    return { input, err, key };
  };
  const removeBtn = (i) => (!ro && !fixed ? h('button', { type: 'button', class: 'btn-x', title: 'Quitar fila', 'aria-label': 'Quitar fila', onclick: () => { rows.splice(i, 1); d[f.k] = [...rows]; onDiscrete(f.k); } }, '×') : null);

  let body;
  if (f.layout === 'cards') {
    body = h('div', { class: 'cards' }, rows.map((r, i) => {
      const flags = (r.terna ? ['terna'] : []);
      return h('article', { class: `rowcard ${flags.join(' ')}`, dataset: { row: i } },
        h('header', {}, h('strong', {}, f.rowTitle ? f.rowTitle(r, i) : `Fila ${i + 1}`), r.terna ? h('span', { class: 'tag tag-terna' }, 'En terna') : null, removeBtn(i)),
        h('div', { class: 'rowgrid' }, f.cols.map((c) => {
          const { input, err, key } = cell(r, i, c);
          return h('div', { class: `cfld ${err ? 'has-err' : ''} ${c.t === 'toggle' ? 'cfld-toggle' : ''}`, dataset: { k: key } }, h('span', { class: 'clbl' }, c.label, c.req ? h('span', { class: 'req' }) : null), input, err ? h('span', { class: 'err' }, err) : null);
        })));
    }));
  } else {
    body = h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', { class: 'n' }, fixed ? 'Requisito' : 'N.º'), f.cols.map((c) => h('th', {}, c.label)), !ro && !fixed ? h('th', {}) : null)),
      h('tbody', {}, rows.map((r, i) => h('tr', {},
        h('th', { class: 'n', scope: 'row' }, fixed ? f.fixedRows[i] : i + 1),
        f.cols.map((c) => { const { input, err, key } = cell(r, i, c); return h('td', { class: err ? 'has-err' : '', dataset: { k: key }, title: err || '' }, input); }),
        !ro && !fixed ? h('td', {}, removeBtn(i)) : null)))));
  }
  const add = !ro && !fixed && rows.length < (f.maxRows || 99)
    ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm add-row', onclick: () => { d[f.k] = [...rows, {}]; onDiscrete(f.k); } }, f.layout === 'cards' ? '+ Agregar candidato' : '+ Agregar fila')
    : null;
  const meta = !fixed ? h('span', { class: 'counter' }, `${rows.length}${f.maxRows ? ` / ${f.maxRows}` : ''}${f.minRows ? ` · mínimo ${f.minRows}` : ''}`) : null;
  return fieldWrap(f, h('div', {}, body, h('div', { class: 'tbl-foot' }, add, meta)), o);
}

export function display(f, v) {
  if (EMPTY(v)) return '—';
  if (f.t === 'money') return `S/ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (f.t === 'date') return new Date(v + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

export function renderCalc(f, val) {
  if (f.render === 'resultado') {
    const cls = { 'APTO': 'r-apto', 'APTO CON OBSERVACIONES': 'r-obs', 'NO APTO': 'r-no', 'CONTINÚA EN EVALUACIÓN': 'r-cont' }[val] || '';
    return h('span', { class: `verdict ${cls}` }, val);
  }
  if (f.render === 'consolidado') {
    const r = val;
    const row = (et, p, m, extra = '') => h('tr', {}, h('th', { scope: 'row' }, et), h('td', {}, p), h('td', {}, m), h('td', {}, extra));
    return h('div', { class: 'consol' },
      h('table', { class: 'tbl tbl-tight' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Etapa'), h('th', {}, 'Puntaje'), h('th', {}, 'Máximo'), h('th', {}, 'Resultado'))),
        h('tbody', {},
          row('Entrevista RRHH', r.rrhh, 30),
          row('Evaluación técnica ponderada', r.ponderado, 50, `${r.tecPct} % técnico ${r.tecPct >= 72 ? '≥' : '<'} 72 %`),
          row('Entrevista final', r.aplicaFinal ? r.final : 'N/A', 20),
          h('tr', { class: 'tot' }, h('th', { scope: 'row' }, 'Total'), h('td', {}, r.total), h('td', {}, r.base), h('td', {}, h('strong', {}, `${r.pct} %`))))),
      r.criticos ? h('p', { class: 'warn' }, `${r.criticos} requisito(s) crítico(s) incumplido(s): el candidato no puede ser APTO.`) : null,
      h('p', { class: 'hint' }, 'APTO: ≥80 % + técnico ≥72 % + sin incumplimiento crítico · APTO CON OBSERVACIONES: 70–79 % + técnico ≥72 % · NO APTO: <70 %, técnico <72 % o incumplimiento crítico.'));
  }
  return h('span', {}, val ?? '—');
}

export function refreshCalcs(root, schema, d, ctx) {
  schema.sections.forEach((sec) => sec.fields.filter((f) => f.t === 'calc').forEach((f) => {
    const el = root.querySelector(`[data-calc="${f.k}"]`);
    if (el) el.replaceChildren(renderCalc(f, f.calc(d, ctx)));
  }));
}

export { EMPTY, esc };
