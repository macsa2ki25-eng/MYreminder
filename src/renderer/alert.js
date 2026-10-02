'use strict';

const app = document.getElementById('app');
let state = null;
let lastShownAt = null;
let interacted = false;

async function load() {
  state = await window.api.getAlert();
  if (state && state.shownAt !== lastShownAt) {
    lastShownAt = state.shownAt;
    interacted = false;
    if (state.sound) chime();
  }
  render();
}

function interact() {
  if (interacted) return;
  interacted = true;
  window.api.alertInteract();
}

function done(item) {
  window.api.done(item.id);
}

function render() {
  app.replaceChildren();
  if (!state) return;
  document.documentElement.dataset.accent = String(state.accent);
  app.append(state.hidden ? renderHidden(state.payload) : renderFull(state.payload));
}

function buttons(p) {
  return [
    h('button', { class: 'primary', onclick: () => window.api.alertClose() }, 'わかった'),
    p.type === 'morning' ? null : h('button', { onclick: () => window.api.alertSnooze() }, '5分後にもう一度'),
  ];
}

function renderHidden(p) {
  return h(
    'main',
    { class: 'hidden-card' },
    h('div', { class: 'msg' }, `📌 ${p.privacyText}`),
    h('div', { class: 'note' }, state.hiddenReason === 'always' ? '目隠しモードなので、中身をかくしています' : 'プロジェクタにつながっているので、中身をかくしています'),
    h(
      'div',
      { class: 'btns' },
      h('button', { class: 'primary', onclick: () => window.api.alertReveal() }, 'タップして表示'),
      h('button', { onclick: () => window.api.alertSnooze() }, '5分後'),
      h('button', { onclick: () => window.api.alertClose() }, 'わかった'),
    ),
  );
}

function group(title, items, cls = 'group', showWhere = false) {
  if (!items || !items.length) return null;
  return h(
    'section',
    { class: cls },
    h('h2', {}, title),
    items.map((it) => itemRow(it, { onDone: done, showWhere })),
  );
}

function renderFull(p) {
  const body = h('div', { class: 'body' });

  if (p.type === 'morning') {
    if (!p.sections.length) add(body, h('p', { class: 'muted' }, '今日の用事はありません'));
    for (const s of p.sections) add(body, group(s.label, s.items, 'group sec'));
  } else {
    add(body, h('div', { class: 'primary-list' }, p.primary.map((it) => itemRow(it, { onDone: done }))));
    add(body, group('今日のメモ', p.memos));
    add(body, group('今日の予定', p.events, 'group', true));
  }

  if (p.overdue.length) {
    add(body,
      h(
        'section',
        { class: 'overdue' },
        h(
          'h2',
          {},
          '🔴 終わった？（やったら ✓）',
          h('button', { onclick: () => window.api.doneMany(p.overdue.map((i) => i.id)) }, 'ぜんぶやった'),
        ),
        p.overdue.map((it) => itemRow(it, { onDone: done, showWhere: true })),
      ),
    );
  }

  return h(
    'main',
    { class: 'alert' },
    h('header', {}, h('span', {}, p.dateLabel), h('span', {}, p.subtitle)),
    h('h1', {}, p.title),
    body,
    h('footer', {}, buttons(p)),
  );
}

document.addEventListener('pointerdown', interact, true);
document.addEventListener('keydown', (e) => {
  interact();
  if (e.key === 'Escape') window.api.alertClose();
});
window.api.onAlertUpdate(load);
load();
