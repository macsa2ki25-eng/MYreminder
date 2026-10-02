'use strict';

// 小さなDOMヘルパー（文字は textContent で入れるので、入力した文字がHTMLとして解釈されることはない）
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// null をとばして子要素を追加する
function add(parent, ...children) {
  for (const c of children.flat()) if (c) parent.append(c);
  return parent;
}

// ✓ボタンつきの用事の行
function itemRow(item, { onDone, showWhere = false, onDelete, onUndo } = {}) {
  const row = h('div', { class: 'row', dataset: { id: item.id } });
  if (onUndo) {
    row.classList.add('done');
    row.append(
      h('span', { class: 'text' }, item.text),
      h('span', { class: 'where' }, item.where),
      h('button', { class: 'ghost del', onclick: () => onUndo(item) }, 'もどす'),
    );
    return row;
  }
  const check = h(
    'button',
    {
      class: 'check',
      title: 'やった',
      'aria-label': `やった：${item.text}`,
      onclick: () => {
        row.classList.add('leaving');
        setTimeout(() => onDone(item), 220);
      },
    },
    '✓',
  );
  row.append(check, h('span', { class: 'text' }, item.text, item.source === 'phone' ? h('span', { class: 'tag-phone' }, 'スマホ') : null));
  if (showWhere) row.append(h('span', { class: 'where' }, item.where));
  if (onDelete) row.append(h('button', { class: 'ghost del', title: '消す', onclick: () => onDelete(item) }, '×'));
  return row;
}

// 割り込みの時の音（短い2音）
function chime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [
      [880, 0],
      [1175, 0.18],
    ].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.25, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.55);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // 音が出せなくても続ける
  }
}
