'use strict';

// 画面の端の「＋」ボタン。タップで入力、ドラッグで移動。
const app = document.getElementById('app');
const btn = h('button', { class: 'fab', title: '一言入れる（ドラッグで移動）', 'aria-label': '一言入れる' }, '＋');
app.append(btn);

let start = null;
let last = null;
let moved = false;

btn.addEventListener('pointerdown', (e) => {
  btn.setPointerCapture(e.pointerId);
  start = last = { x: e.screenX, y: e.screenY };
  moved = false;
});

btn.addEventListener('pointermove', (e) => {
  if (!start) return;
  if (!moved && Math.hypot(e.screenX - start.x, e.screenY - start.y) < 6) return;
  moved = true;
  window.api.fabMove(e.screenX - last.x, e.screenY - last.y);
  last = { x: e.screenX, y: e.screenY };
});

btn.addEventListener('pointerup', () => {
  if (!start) return;
  start = null;
  if (moved) window.api.fabMoved();
  else window.api.openInput();
});
