// Detecto: el asistente robot de la plataforma. Guía al usuario y celebra cuando se cumple el procedimiento.
import { h } from './util.js';

const EYES = {
  idle: '<circle cx="47" cy="55" r="5.5" fill="#E9FBFF"/><circle cx="73" cy="55" r="5.5" fill="#E9FBFF"/><circle cx="49" cy="53" r="1.8" fill="#0F4C6B"/><circle cx="75" cy="53" r="1.8" fill="#0F4C6B"/>',
  happy: '<path d="M40 57 q7 -10 14 0" stroke="#E1E04A" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M66 57 q7 -10 14 0" stroke="#E1E04A" stroke-width="4.5" fill="none" stroke-linecap="round"/>',
  think: '<circle cx="50" cy="53" r="5.5" fill="#E9FBFF"/><circle cx="76" cy="53" r="5.5" fill="#E9FBFF"/><circle cx="52" cy="51" r="2" fill="#0F4C6B"/><circle cx="78" cy="51" r="2" fill="#0F4C6B"/>',
  worried: '<path d="M40 46 l12 4" stroke="#E9FBFF" stroke-width="3" stroke-linecap="round"/><path d="M80 46 l-12 4" stroke="#E9FBFF" stroke-width="3" stroke-linecap="round"/><circle cx="47" cy="57" r="4.5" fill="#E9FBFF"/><circle cx="73" cy="57" r="4.5" fill="#E9FBFF"/>',
};
const MOUTH = {
  idle: '<path d="M54 66 q6 4 12 0" stroke="#53C0E2" stroke-width="3" fill="none" stroke-linecap="round"/>',
  happy: '<path d="M49 64 q11 11 22 0 z" fill="#E1E04A"/>',
  think: '<path d="M56 67 h9" stroke="#53C0E2" stroke-width="3" stroke-linecap="round"/>',
  worried: '<path d="M52 69 q8 -6 16 0" stroke="#53C0E2" stroke-width="3" fill="none" stroke-linecap="round"/>',
};

export function detectoSVG(mood = 'idle') {
  const m = EYES[mood] ? mood : 'idle';
  const happy = m === 'happy';
  return `<svg class="detecto detecto-${m}" viewBox="0 0 120 150" role="img" aria-label="Detecto, el asistente" xmlns="http://www.w3.org/2000/svg">
  <g class="d-ant"><line x1="60" y1="23" x2="60" y2="10" stroke="#0F4C6B" stroke-width="3.5" stroke-linecap="round"/><circle cx="60" cy="8" r="6.5" fill="#E1E04A" stroke="#0F4C6B" stroke-width="2"/></g>
  <g class="d-arm-l"><path d="M34 104 q-14 8 -12 24" stroke="#3B8FD8" stroke-width="9" fill="none" stroke-linecap="round"/></g>
  <g class="d-arm-r"><path d="M86 104 q14 8 12 24" stroke="#3B8FD8" stroke-width="9" fill="none" stroke-linecap="round"/></g>
  <rect x="34" y="94" width="52" height="40" rx="15" fill="#3B8FD8"/>
  <path d="M42 94 C52 104 68 104 78 94" stroke="#E1E04A" stroke-width="6" fill="none" stroke-linecap="round"/>
  <circle cx="60" cy="116" r="9" fill="${happy ? '#E1E04A' : '#E3F4FA'}"/>
  ${happy ? '<path d="M55 116 l4 4 l7 -8" stroke="#0F4C6B" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' : '<circle cx="60" cy="116" r="3" fill="#53C0E2"/>'}
  <rect x="44" y="134" width="10" height="12" rx="5" fill="#0F4C6B"/><rect x="66" y="134" width="10" height="12" rx="5" fill="#0F4C6B"/>
  <rect x="16" y="22" width="88" height="70" rx="26" fill="#53C0E2"/>
  <rect x="22" y="27" width="36" height="10" rx="5" fill="#fff" opacity=".35"/>
  <rect x="27" y="37" width="66" height="44" rx="17" fill="#0F4C6B"/>
  ${EYES[m]}${MOUTH[m]}
  ${happy ? '<circle cx="35" cy="70" r="4" fill="#E1E04A" opacity=".55"/><circle cx="85" cy="70" r="4" fill="#E1E04A" opacity=".55"/>' : ''}
  <rect x="10" y="48" width="8" height="20" rx="4" fill="#3B8FD8"/><rect x="102" y="48" width="8" height="20" rx="4" fill="#3B8FD8"/>
</svg>`;
}

export function detecto(mood = 'idle', cls = '') {
  const wrap = h('span', { class: `detecto-wrap ${cls}`, 'aria-hidden': 'true' });
  wrap.innerHTML = detectoSVG(mood);
  return wrap;
}

// Tarjeta de Detecto con mensaje y acciones
export function detectoSays({ mood = 'idle', title, text, actions = [] }) {
  return h('div', { class: `say say-${mood}`, role: 'status' },
    detecto(mood),
    h('div', { class: 'say-bubble' },
      title ? h('strong', {}, title) : null,
      text ? h('p', {}, text) : null,
      actions.length ? h('div', { class: 'say-actions' }, actions) : null));
}

// Celebración: Detecto salta y cae confeti con los colores de la marca
export function celebrate({ title = '¡Listo!', text = '', big = false } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['#53C0E2', '#E1E04A', '#3B8FD8', '#0F4C6B', '#fff'];
  const confetti = reduce ? [] : Array.from({ length: big ? 90 : 46 }, (_, i) => h('i', {
    class: 'cf', style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.6}s;animation-duration:${1.8 + Math.random() * 1.6}s;transform:rotate(${Math.random() * 360}deg);${i % 3 === 0 ? 'border-radius:50%;' : ''}`,
  }));
  const close = () => { bg.classList.add('out'); setTimeout(() => bg.remove(), 300); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
  const btn = h('button', { class: 'btn btn-lime', onclick: close }, big ? '¡Genial!' : 'Seguir');
  const bg = h('div', { class: `party ${big ? 'party-big' : ''}`, onclick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'confetti' }, confetti),
    h('div', { class: 'party-card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'party-t' },
      detecto('happy', 'jump'),
      h('h2', { id: 'party-t' }, title),
      text ? h('p', {}, text) : null,
      btn));
  document.body.append(bg);
  document.addEventListener('keydown', onKey);
  btn.focus();
  if (!big) setTimeout(() => bg.isConnected && close(), 4200);
}
