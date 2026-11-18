// Detecto: el asistente de la plataforma. Guía al usuario y celebra cuando se cumple el procedimiento.
import { h } from './util.js';

const SRC = 'assets/detecto.png';

export function detecto(mood = 'idle', cls = '') {
  return h('span', { class: `detecto-wrap mood-${mood} ${cls}`, 'aria-hidden': 'true' },
    h('img', { src: SRC, alt: '', class: 'detecto-img', draggable: 'false' }),
    mood === 'happy' ? h('span', { class: 'sparks' }, h('i'), h('i'), h('i')) : null);
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
