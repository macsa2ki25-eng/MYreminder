'use strict';

const app = document.getElementById('app');

const input = h('input', { type: 'text', placeholder: '思いついたことを一言（Enter で入れる）', autocomplete: 'off', 'aria-label': '用事を一言' });
const flash = h('div', { class: 'flash', 'aria-live': 'polite' });
const content = h('div', {});

async function submit() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const r = await window.api.add(text);
  if (r) flash.textContent = `✓ ${r.where} に入れました「${text}」`;
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    submit();
  }
});

const handlers = {
  onDone: (item) => window.api.done(item.id),
  onDelete: (item) => {
    if (confirm(`「${item.text}」を消しますか？`)) window.api.remove(item.id);
  },
};

function card(label, items, { cls = '', showWhere = false } = {}) {
  return h(
    'div',
    { class: `card ${cls}` },
    label ? h('div', { class: 'label' }, label) : null,
    items.map((it) => itemRow(it, { ...handlers, showWhere })),
  );
}

async function render() {
  const v = await window.api.getList();
  const parts = [];
  const nothing = !v.overdue.length && !v.today.length && !v.later.length;

  if (v.overdue.length) {
    parts.push(
      h(
        'h2',
        {},
        '🔴 終わった？',
        h('span', { class: 'sub' }, 'やったら ✓'),
        h('button', { onclick: () => window.api.doneMany(v.overdue.map((i) => i.id)) }, 'ぜんぶやった'),
      ),
      card(null, v.overdue, { cls: 'overdue', showWhere: true }),
    );
  }

  parts.push(h('h2', {}, `今日 ${v.todayLabel}`));
  if (v.today.length) for (const s of v.today) parts.push(card(s.label, s.items));
  else parts.push(h('div', { class: 'empty' }, '今日の用事はありません'));

  if (v.later.length) {
    parts.push(h('h2', {}, 'これから'));
    for (const day of v.later) {
      for (const s of day.sections) parts.push(card(`${day.label}　${s.label}`, s.items));
    }
  }

  if (nothing) parts.push(h('p', { class: 'muted' }, '思いついたら、上の欄か、画面の端の「＋」ボタンから一言入れてください。'));

  if (v.recentDone.length) {
    parts.push(
      h(
        'details',
        {},
        h('summary', {}, `さっき終わったもの（${v.recentDone.length}）`),
        h(
          'div',
          { class: 'card' },
          v.recentDone.map((it) => itemRow(it, { onUndo: (item) => window.api.undone(item.id) })),
        ),
      ),
    );
  }

  const open = content.querySelector('details')?.open;
  content.replaceChildren(...parts);
  if (open) content.querySelector('details')?.setAttribute('open', '');
}

app.append(
  h(
    'main',
    { class: 'list' },
    h(
      'div',
      { class: 'top' },
      input,
      h('button', { class: 'primary', onclick: submit }, '入れる'),
      h('button', { class: 'ghost', onclick: () => window.api.openSettings() }, '設定'),
    ),
    flash,
    content,
  ),
);

window.api.onRefresh(render);
render();
input.focus();
