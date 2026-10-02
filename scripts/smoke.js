'use strict';

// 実際のアプリを動かして、各画面のスクリーンショットを撮る動作確認。
//   xvfb-run -s "-screen 0 1366x900x24" npx electron --no-sandbox scripts/smoke.js <出力フォルダ>
process.env.TZ = process.env.TZ || 'Asia/Tokyo';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const outDir = path.resolve(process.argv.find((a) => a.startsWith('--out='))?.slice(6) || 'smoke-out');
fs.mkdirSync(outDir, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'myrem-')));

const { _test: t } = require('../src/main/main.js');
const core = require('../src/core');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function win(page) {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith(`${page}.html`));
}

async function shot(page, name) {
  await wait(900);
  const w = win(page);
  if (!w) throw new Error(`${page} のウィンドウがありません`);
  const img = await w.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
  console.log(`📸 ${name}.png  (${w.getBounds().width}x${w.getBounds().height}, visible=${w.isVisible()})`);
}

async function text(page) {
  return win(page).webContents.executeJavaScript('document.body.innerText');
}

app.whenReady().then(async () => {
  try {
    await wait(1500);
    const now = new Date();
    for (const s of ['3-4 プリント配る', '3-4 小テストの範囲を伝える', '帰りST 保護者会の手紙', '鍵を返す', '金曜 16時 学年会', '進路部で模試の日程']) {
      const r = t.addItem(s);
      console.log(`入力「${s}」→ ${r.where}`);
    }
    // やり残し（赤）を1件つくる
    t.data.items.push(core.createItem('課題回収', { kind: 'slot', date: core.dateKey(now), slot: 'p1' }, new Date(now.getTime() - 86400000)));
    t.changed();

    await t.showAlert({ type: 'morning', id: 'smoke-morning' });
    await shot('alert', '1-morning');
    console.log((await text('alert')).replace(/\n+/g, ' / '));

    const target = t.data.items.find((i) => i.text === '3-4 プリント配る');
    await t.showAlert({ type: 'slot', id: 'smoke-slot', date: target.date, slot: target.slot });
    await shot('alert', '2-slot');

    t.setPrivacy('always');
    await t.showAlert({ type: 'slot', id: 'smoke-slot2', date: target.date, slot: target.slot });
    await shot('alert', '3-hidden');
    t.setPrivacy('auto');

    t.openInput();
    await wait(800);
    await win('input').webContents.executeJavaScript(`
      document.querySelector('#text').value = '3-1 小テスト返す';
      document.querySelector('#text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    `);
    await shot('input', '4-input');
    console.log((await text('input')).replace(/\n+/g, ' / '));

    t.openList();
    await shot('list', '5-list');
    t.openSettings();
    await shot('settings', '6-settings');
    console.log('OK');
  } catch (err) {
    console.error('NG', err);
    process.exitCode = 1;
  }
  app.exit(process.exitCode || 0);
});
