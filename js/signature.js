// Firma manuscrita en lienzo + doble confirmación del firmante.
import { h, normalize } from './util.js';

export function openSignModal({ title, signerLabel, user, decisionOpts, declaration, tablet = false }) {
  return new Promise((resolve) => {
    let drawn = false;
    let decision = decisionOpts?.[0] || null;
    const canvas = h('canvas', { class: 'pad', width: 640, height: 220, 'aria-label': 'Área de firma. Dibuje su firma con el mouse, el dedo o un lápiz.' });
    const g = canvas.getContext('2d');
    const ratio = () => canvas.width / canvas.getBoundingClientRect().width;
    g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#123f5c';
    let last = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * ratio(), y: (e.clientY - r.top) * ratio() }; };
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); last = pos(e); g.beginPath(); g.arc(last.x, last.y, 1.2, 0, Math.PI * 2); g.fillStyle = '#123f5c'; g.fill(); drawn = true; check(); });
    canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = pos(e);
      const w = Math.max(1.4, 3.4 - Math.hypot(p.x - last.x, p.y - last.y) / 10);
      g.lineWidth = w; g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p;
    });
    const end = () => { last = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

    const nameIn = h('input', { class: 'inp', type: 'text', autocomplete: 'off', placeholder: tablet ? 'Nombre completo de quien firma' : user.name, oninput: check });
    const declIn = h('input', { type: 'checkbox', onchange: check });
    const comment = h('textarea', { class: 'inp', rows: 2, placeholder: 'Comentario (obligatorio si observa o desaprueba)', oninput: check });
    const btnOk = h('button', { class: 'btn btn-primary', disabled: true, onclick: done }, 'Firmar');
    const msg = h('p', { class: 'hint sign-msg' });

    const decisionEl = decisionOpts ? h('div', { class: 'chips decision' }, decisionOpts.map((x) => h('label', { class: `chip ${x === decision ? 'on' : ''} dec-${normalize(x)}` },
      h('input', { type: 'radio', name: 'decision', checked: x === decision, onchange: () => { decision = x; decisionEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.textContent === x)); check(); } }), h('span', {}, x)))) : null;

    function nameOk() { return tablet ? nameIn.value.trim().length >= 6 : normalize(nameIn.value) === normalize(user.name); }
    function check() {
      const needComment = decision && decision !== 'Aprobado' && comment.value.trim().length < 10;
      const ok = drawn && nameOk() && declIn.checked && !needComment;
      btnOk.disabled = !ok;
      btnOk.textContent = decision && decision !== 'Aprobado' ? `Firmar: ${decision}` : 'Firmar';
      msg.textContent = !drawn ? 'Paso 1 de 3: dibuje su firma.' : !nameOk() ? (tablet ? 'Paso 2 de 3: escriba el nombre completo del firmante.' : 'Paso 2 de 3: escriba su nombre exactamente como figura en el sistema.') : !declIn.checked ? 'Paso 3 de 3: confirme la declaración de conformidad.' : needComment ? 'Explique la observación (mínimo 10 caracteres).' : 'Listo para firmar.';
    }
    function close(v) { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(v); }
    function done() {
      if (btnOk.disabled) return;
      close({ img: canvas.toDataURL('image/png'), decision, comment: comment.value.trim(), signerName: tablet ? nameIn.value.trim() : user.name });
    }
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);

    const overlay = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === overlay) close(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sign-title' },
        h('header', {}, h('h2', { id: 'sign-title' }, title), h('p', { class: 'muted' }, signerLabel)),
        decisionEl ? h('div', { class: 'blk' }, h('p', { class: 'lbl' }, 'Decisión'), decisionEl) : null,
        h('div', { class: 'blk' }, h('div', { class: 'pad-head' }, h('p', { class: 'lbl' }, 'Firma'), h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { g.clearRect(0, 0, canvas.width, canvas.height); drawn = false; check(); } }, 'Borrar')),
          h('div', { class: 'pad-wrap' }, canvas, h('span', { class: 'pad-line' }))),
        h('div', { class: 'blk' }, h('label', { class: 'lbl' }, tablet ? 'Nombre del firmante' : 'Confirme su nombre completo'), nameIn),
        decisionOpts ? h('div', { class: 'blk' }, comment) : null,
        h('label', { class: 'decl' }, declIn, h('span', {}, declaration)),
        msg,
        h('footer', {}, h('button', { class: 'btn btn-ghost', onclick: () => close(null) }, 'Cancelar'), btnOk)));
    document.body.append(overlay);
    check();
    setTimeout(() => (decisionEl ? decisionEl.querySelector('input') : nameIn).focus(), 30);
  });
}

export function confirmModal({ title, body, ok = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const close = (v) => { bg.remove(); resolve(v); };
    const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(false); } },
      h('div', { class: 'modal modal-sm', role: 'dialog', 'aria-modal': 'true' },
        h('header', {}, h('h2', {}, title)), h('p', {}, body),
        h('footer', {}, h('button', { class: 'btn btn-ghost', onclick: () => close(false) }, 'Cancelar'), h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => close(true) }, ok))));
    document.body.append(bg);
    bg.querySelector('.btn-primary, .btn-danger').focus();
  });
}
