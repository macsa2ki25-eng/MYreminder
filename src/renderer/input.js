'use strict';

const app = document.getElementById('app');

const input = h('input', {
  type: 'text',
  id: 'text',
  placeholder: '思いついたことを一言',
  autocomplete: 'off',
  'aria-label': '用事を一言',
});
const result = h('div', { class: 'result', 'aria-live': 'polite' });

async function submit() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const r = await window.api.add(text);
  if (r) showResult(text, r);
  input.focus();
}

function showResult(text, r) {
  const whereEl = h('span', { class: 'where' }, r.where);
  const alts = h('div', { class: 'alts' });
  const undo = h(
    'button',
    {
      class: 'ghost',
      onclick: async () => {
        await window.api.remove(r.id);
        result.replaceChildren(h('span', { class: 'muted' }, `「${text}」をとりけしました`));
        input.focus();
      },
    },
    'とりけし',
  );
  for (const alt of r.alternatives) {
    alts.append(
      h(
        'button',
        {
          onclick: async () => {
            const moved = await window.api.reassign(r.id, alt.target);
            if (moved) whereEl.textContent = moved.where;
            alts.replaceChildren(undo);
            input.focus();
          },
        },
        `→ ${alt.label}`,
      ),
    );
  }
  alts.append(undo);
  result.replaceChildren(h('div', {}, '✓ ', whereEl, ' に入れました', h('span', { class: 'muted' }, `　「${text}」`)), alts);
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.api.closeInput();
    return;
  }
  // 日本語の変換中のEnterでは送らない
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    submit();
  }
});

app.append(
  h(
    'div',
    { class: 'input-wrap' },
    h('div', { class: 'input-line' }, input, h('button', { class: 'primary', onclick: submit }, '入れる')),
    h(
      'div',
      { class: 'hint' },
      '例：「3-4 プリント配る」「帰りST 保護者会の手紙」「金曜 15時 学年会」「鍵を返す」',
      h('br'),
      '🎤 声で入れるなら Windowsキー + H',
    ),
    result,
    h(
      'div',
      { class: 'input-foot' },
      h('button', { class: 'ghost', onclick: () => window.api.openList() }, '一覧を見る'),
      h('span', { class: 'muted' }, 'Esc でとじる'),
    ),
  ),
);

window.api.onInputFocus(() => {
  result.replaceChildren();
  input.focus();
});
input.focus();
