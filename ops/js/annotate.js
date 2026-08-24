// Photo annotation — draw circles + freehand marks and add a note on a photo.
// Marks are stored as vector geometry normalised to 0..1 of the image, so they
// render crisply at any size, print cleanly, and need no image re-upload (no CORS).
// This is the liability record: "here is the scratch, and it was here on arrival."
import { esc } from './util.js';

export const COLORS = { red: '#FF5A4D', gold: '#F0C860', white: '#FFFFFF' };
const colorHex = c => COLORS[c] || COLORS.red;
const n4 = v => Math.round(v * 10000) / 10000;

export function hasMarks(a) { return !!(a && ((a.marks && a.marks.length) || a.note)); }

// Inner SVG for a set of marks (no wrapper) — shared by editor + display.
export function marksInner(annotation) {
  const marks = (annotation && annotation.marks) || [];
  return marks.map(m => {
    const stroke = colorHex(m.c);
    const w = m.w || 3;
    if (m.t === 'c') {
      return `<ellipse cx="${m.cx}" cy="${m.cy}" rx="${Math.max(0.003, m.rx)}" ry="${Math.max(0.003, m.ry)}" fill="none" stroke="${stroke}" stroke-width="${w}" vector-effect="non-scaling-stroke"/>`;
    }
    if (m.t === 'p' && m.pts && m.pts.length) {
      const d = 'M' + m.pts.map(p => `${p[0]} ${p[1]}`).join(' L ');
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    }
    return '';
  }).join('');
}

// Full SVG overlay element for display on top of a photo.
export function marksToSVG(annotation) {
  const body = marksInner(annotation);
  return body ? `<svg class="anno-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">${body}</svg>` : '';
}

// Full-screen editor. opts: { src, w, h, annotation, title, onSave(annotation) }
export function openAnnotator(opts) {
  const root = document.getElementById('modal-root');
  let marks = (opts.annotation && opts.annotation.marks) ? opts.annotation.marks.map(m => ({ ...m })) : [];
  let tool = 'pen';
  let color = 'red';

  root.innerHTML = `
  <div class="annotator" id="annotator">
    <div class="anno-bar anno-top">
      <button class="btn btn-icon btn-ghost" id="an-cancel" aria-label="Cancel">${esc('✕')}</button>
      <span class="anno-title">${esc(opts.title || 'Mark the damage')}</span>
      <button class="btn btn-gold btn-sm" id="an-save">Save</button>
    </div>
    <div class="anno-stage">
      <div class="anno-frame" id="an-frame">
        <img src="${esc(opts.src)}" alt="" id="an-img" draggable="false">
        <svg class="anno-draw" id="an-draw" viewBox="0 0 1 1" preserveAspectRatio="none"></svg>
      </div>
    </div>
    <div class="anno-note-wrap">
      <input class="input" id="an-note" placeholder="Note — e.g. pre-existing scratch, ~4in, left winglet" value="${esc((opts.annotation && opts.annotation.note) || '')}">
    </div>
    <div class="anno-bar anno-tools">
      <button class="anno-tool on" data-tool="pen">${esc('✎')} Pen</button>
      <button class="anno-tool" data-tool="circle">${esc('◯')} Circle</button>
      <span class="anno-colors">
        <button class="anno-color on" data-color="red" style="background:${COLORS.red}" aria-label="Red"></button>
        <button class="anno-color" data-color="gold" style="background:${COLORS.gold}" aria-label="Gold"></button>
        <button class="anno-color" data-color="white" style="background:${COLORS.white}" aria-label="White"></button>
      </span>
      <button class="anno-tool" id="an-undo">${esc('↶')} Undo</button>
      <button class="anno-tool" id="an-clear">Clear</button>
    </div>
  </div>`;
  document.body.classList.add('modal-open');

  const svg = root.querySelector('#an-draw');
  const paint = extra => { svg.innerHTML = marksInner({ marks: extra ? marks.concat([extra]) : marks }); };
  paint();

  const clampPt = e => {
    const r = svg.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return [n4(x), n4(y)];
  };
  const commit = m => (m.t === 'p' ? { t: 'p', c: m.c, w: m.w, pts: m.pts } : { t: 'c', c: m.c, w: m.w, cx: m.cx, cy: m.cy, rx: m.rx, ry: m.ry });

  let cur = null;
  const down = e => {
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch (x) {}
    const [x, y] = clampPt(e);
    cur = tool === 'pen'
      ? { t: 'p', c: color, w: 3, pts: [[x, y]] }
      : { t: 'c', c: color, w: 3, _x0: x, _y0: y, cx: x, cy: y, rx: 0, ry: 0 };
    paint(commit(cur));
  };
  const move = e => {
    if (!cur) return;
    e.preventDefault();
    const [x, y] = clampPt(e);
    if (cur.t === 'p') {
      const last = cur.pts[cur.pts.length - 1];
      if (Math.abs(x - last[0]) + Math.abs(y - last[1]) > 0.004 && cur.pts.length < 500) cur.pts.push([x, y]);
    } else {
      cur.cx = n4((cur._x0 + x) / 2); cur.cy = n4((cur._y0 + y) / 2);
      cur.rx = n4(Math.abs(x - cur._x0) / 2); cur.ry = n4(Math.abs(y - cur._y0) / 2);
    }
    paint(commit(cur));
  };
  const up = () => {
    if (!cur) return;
    const m = commit(cur);
    const big = m.t === 'p' ? m.pts.length > 1 : (m.rx > 0.01 || m.ry > 0.01);
    if (big) marks.push(m);
    cur = null;
    paint();
  };
  svg.addEventListener('pointerdown', down);
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('pointerleave', up);

  root.querySelectorAll('.anno-tool[data-tool]').forEach(b => b.onclick = () => {
    tool = b.dataset.tool;
    root.querySelectorAll('.anno-tool[data-tool]').forEach(x => x.classList.toggle('on', x === b));
  });
  root.querySelectorAll('.anno-color').forEach(b => b.onclick = () => {
    color = b.dataset.color;
    root.querySelectorAll('.anno-color').forEach(x => x.classList.toggle('on', x === b));
  });
  root.querySelector('#an-undo').onclick = () => { marks.pop(); paint(); };
  root.querySelector('#an-clear').onclick = () => { marks = []; paint(); };

  const close = () => { root.innerHTML = ''; document.body.classList.remove('modal-open'); };
  root.querySelector('#an-cancel').onclick = close;
  root.querySelector('#an-save').onclick = () => {
    const note = root.querySelector('#an-note').value.trim();
    close();
    opts.onSave({ marks, note });
  };
}
