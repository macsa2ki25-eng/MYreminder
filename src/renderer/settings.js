'use strict';

const app = document.getElementById('app');

function radio(name, value, label, checked, onchange) {
  return h('label', {}, h('input', { type: 'radio', name, value, checked, onchange }), label);
}

function checkbox(label, checked, onchange) {
  return h('label', {}, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) }), label);
}

async function render() {
  const info = await window.api.getSettings();
  const s = info.settings;
  const parts = [h('h1', {}, '設定')];

  if (info.error) {
    parts.push(
      h(
        'div',
        { class: 'error' },
        '設定ファイルの書き方に誤りがあります。前の設定のまま動いています。',
        h('br'),
        h('small', {}, info.error),
      ),
    );
  }

  // スマホ通知
  const phoneStatus = h('span', { class: 'status muted' });
  const topicEl = h('span', { class: 'topic' }, s.phone.topic);
  parts.push(
    h(
      'section',
      {},
      h('h2', {}, '📱 スマホ通知'),
      h('p', {}, `割り込みに ${s.reminders.phoneAfterMin}分 さわらなかったら、iPhone に「PCにリマインドがあります」と通知します（中身は送りません）。`),
      h('div', {}, checkbox('スマホ通知を使う', s.phone.enabled, (v) => window.api.setSettings({ phoneEnabled: v }))),
      h(
        'div',
        {},
        '何分後に送るか：',
        ...[1, 3, 5, 10].map((m) =>
          radio('after', String(m), `${m}分`, s.reminders.phoneAfterMin === m, () => window.api.setSettings({ phoneAfterMin: m }).then(render)),
        ),
      ),
      h('p', {}, 'はじめの準備（1回だけ）'),
      h(
        'ol',
        {},
        h('li', {}, 'iPhone の App Store で「ntfy」というアプリを入れる'),
        h('li', {}, 'ntfy を開いて、右上の「＋」をタップ'),
        h('li', {}, 'Topic に次の文字を入れて「Subscribe」：', h('br'), topicEl),
        h('li', {}, '通知を「許可」する'),
        h('li', {}, '下の「テスト通知を送る」を押して、iPhone に届けば完了'),
      ),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            class: 'primary',
            onclick: async () => {
              phoneStatus.textContent = '送信中…';
              const r = await window.api.testPhone();
              phoneStatus.textContent = r.ok ? '送りました。iPhone に届きましたか？' : `送れませんでした（${r.error}）。学校のネットワークで止められている可能性があります。`;
            },
          },
          'テスト通知を送る',
        ),
        h(
          'button',
          {
            class: 'ghost',
            onclick: async () => {
              if (!confirm('トピック名を新しくしますか？ iPhone の ntfy でも登録し直しが必要です。')) return;
              topicEl.textContent = await window.api.newPhoneTopic();
            },
          },
          'トピック名を作り直す',
        ),
        phoneStatus,
      ),
    ),
  );

  // 目隠しモード
  const dispStatus = h('span', { class: 'status muted' });
  parts.push(
    h(
      'section',
      {},
      h('h2', {}, '🙈 目隠しモード'),
      h('p', {}, 'プロジェクタやテレビにつながっている時は、割り込みの中身をかくして「用事があります」だけ出します。'),
      h(
        'div',
        {},
        radio('privacy', 'auto', '自動（つながっている時だけ）', s.privacy === 'auto', () => window.api.setSettings({ privacy: 'auto' })),
        radio('privacy', 'always', 'いつも目隠し', s.privacy === 'always', () => window.api.setSettings({ privacy: 'always' })),
        radio('privacy', 'off', '目隠ししない', s.privacy === 'off', () => window.api.setSettings({ privacy: 'off' })),
      ),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            onclick: async () => {
              dispStatus.textContent = '調べています…';
              const r = await window.api.testDisplays();
              const wmi = r.wmiCount === null ? '不明' : `${r.wmiCount}台`;
              dispStatus.textContent = `画面 ${r.electronCount}枚・モニター ${wmi} → ${r.projecting ? 'プロジェクタあり（目隠しします）' : 'プロジェクタなし'}`;
            },
          },
          'いまの画面を調べる',
        ),
        dispStatus,
      ),
      h('p', { class: 'muted' }, 'プロジェクタをつないだ状態で一度「いまの画面を調べる」を押して、「プロジェクタあり」と出るか確かめてください。'),
    ),
  );

  // 入力・音
  parts.push(
    h(
      'section',
      {},
      h('h2', {}, '✏️ 入力と音'),
      h('p', {}, 'キーボードからは ', h('b', {}, (info.hotkey || '（使えません）').replace('Control', 'Ctrl')), ' で入力欄が出ます。'),
      h('div', {}, checkbox('画面の端に「＋」ボタンを出す', s.fab.show, (v) => window.api.setSettings({ fabShow: v }))),
      h('div', {}, checkbox('割り込みの時に音を鳴らす（目隠しモードの時は鳴らしません）', s.sound, (v) => window.api.setSettings({ sound: v }))),
    ),
  );

  // 時間割
  const t = info.timetable;
  parts.push(
    h(
      'section',
      {},
      h('h2', {}, '🗓️ 時間割'),
      h(
        'table',
        {},
        h('tr', {}, h('th', {}, ''), ...t.days.map((d) => h('th', {}, d))),
        h('tr', {}, h('th', {}, `朝ST ${t.asa}`), ...t.days.map(() => h('td', {}, ''))),
        ...t.rows.map((r) => h('tr', {}, h('th', {}, r.label, h('br'), h('small', { class: 'muted' }, r.time)), ...r.cells.map((c) => h('td', {}, c)))),
        h('tr', {}, h('th', {}, '帰りST'), ...t.kaeri.map((k) => h('td', {}, k))),
      ),
      h('p', { class: 'muted' }, '時間割が変わった時は、下のボタンで設定ファイルを開いて書きかえ、保存してください（すぐに反映されます）。'),
      h('div', { class: 'actions' }, h('button', { onclick: () => window.api.openSettingsFile() }, '設定ファイルを開く')),
    ),
  );

  parts.push(h('p', { class: 'muted' }, `データの保存場所：${info.dataDir}（このPCの中だけ）　バージョン ${info.version}`));

  app.replaceChildren(h('main', { class: 'settings' }, parts));
}

window.api.onRefresh(render);
render();
