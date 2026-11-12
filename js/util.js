// Utilidades generales
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const nowISO = () => new Date().toISOString();

export function fmtDate(iso, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (isNaN(d)) return iso;
  const opts = { day: '2-digit', month: 'short', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('es-PE', opts);
}

export function addMonths(iso, m) {
  if (!iso || !m) return '';
  const d = new Date(iso + 'T12:00:00');
  d.setMonth(d.getMonth() + Number(m));
  return d.toISOString().slice(0, 10);
}

// Días útiles (lunes a viernes) entre dos fechas
export function businessDaysBetween(fromISO, toISO = nowISO()) {
  const a = new Date(fromISO), b = new Date(toISO);
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let n = 0; const d = new Date(a); d.setHours(12, 0, 0, 0);
  const end = new Date(b); end.setHours(12, 0, 0, 0);
  while (d < end) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export function hoursSince(iso) { return iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : 0; }

// Hash de integridad (SHA-256 si está disponible; FNV-1a como respaldo)
export async function hashOf(obj) {
  const str = stableStringify(obj);
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let hsh = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { hsh ^= str.charCodeAt(i); hsh = Math.imul(hsh, 0x01000193); }
  return ('fnv' + (hsh >>> 0).toString(16)).padEnd(16, '0');
}

export function stableStringify(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

export const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function toast(msg, kind = 'ok') {
  let host = document.getElementById('toasts');
  if (!host) { host = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  host.append(t);
  setTimeout(() => t.classList.add('out'), 3600);
  setTimeout(() => t.remove(), 4200);
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
