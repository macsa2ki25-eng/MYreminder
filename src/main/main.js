'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  powerMonitor,
  screen,
  nativeImage,
  shell,
  net,
  Notification,
} = require('electron');
const path = require('path');
const fs = require('fs');
const core = require('../core');
const { createStore } = require('./store');
const { shouldHide, inspectDisplays } = require('./displays');
const { sendPhone, newTopic } = require('./phone');

const RENDERER = path.join(__dirname, '..', 'renderer');
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const PRELOAD = path.join(__dirname, 'preload.js');
const TICK_MS = 15000;
const ACCENTS = 5;

let store;
let settings;
let settingsError = null;
let data;
let tray = null;
let inputWin = null;
let listWin = null;
let alertWin = null;
let fabWin = null;
let settingsWin = null;
let hotkeyInUse = null;
// 表示中の割り込み: { spec, payload, shownAt, interacted, phoneSent, hidden, accent }
let currentAlert = null;
// 「5分後にもう一度」: { spec, until }
let snooze = null;
let lastMinute = -1;

app.setAppUserModelId('com.myreminder.app');
// 割り込みの時に音を鳴らすため
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openList());
  app.whenReady().then(init);
  // ウィンドウを全部閉じても常駐し続ける
  app.on('window-all-closed', () => {});
  app.on('will-quit', () => globalShortcut.unregisterAll());
  // 画面の中から外部のページを開いたり、別のページへ移動したりしない
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (e) => e.preventDefault());
  });
}

// ---------------------------------------------------------------- 起動

function init() {
  store = createStore(app.getPath('userData'));
  data = store.loadData();
  loadSettings();
  if (!settings.phone.topic) {
    settings.phone.topic = newTopic();
    saveSettings();
  }
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

  registerIpc();
  createTray();
  registerHotkey();
  syncFab();
  watchSettingsFile();

  powerMonitor.on('resume', tick);
  powerMonitor.on('unlock-screen', tick);
  screen.on('display-metrics-changed', () => syncFab());
  setInterval(tick, TICK_MS);
  tick();
}

function loadSettings() {
  const r = store.loadSettings();
  if (r.settings) {
    settings = r.settings;
    settingsError = null;
  } else {
    settingsError = r.error;
    if (!settings) settings = core.mergeSettings({});
    store.log(`settings.json の書き方に誤りがあります: ${r.error}`);
    if (Notification.isSupported()) {
      new Notification({
        title: 'MYreminder',
        body: '設定ファイルの書き方に誤りがあります。前の設定のまま動きます。',
      }).show();
    }
  }
}

function watchSettingsFile() {
  let timer = null;
  try {
    // ファイルは置き換えで保存されるので、フォルダごと見張る
    fs.watch(store.dir, (_event, filename) => {
      if (filename !== path.basename(store.settingsPath)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        loadSettings();
        registerHotkey();
        syncFab();
        changed();
      }, 500);
    });
  } catch (err) {
    store.log(`settings.json を見張れませんでした: ${err.message}`);
  }
}

function saveSettings() {
  // 手で書き換えた設定ファイルに誤りがある間は、上書きして消してしまわないよう保存しない
  if (settingsError) {
    store.log('設定ファイルに誤りがあるため、設定の保存を見送りました');
    return;
  }
  store.saveSettings(settings);
}

// ---------------------------------------------------------------- データ

function save() {
  data.items = core.purge(data.items, new Date(), settings);
  store.saveData(data);
}

// データが変わった時: 保存して、開いている画面を更新する
function changed() {
  save();
  refreshAlert();
  for (const w of [listWin, inputWin, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('refresh');
  }
}

function findItem(id) {
  return data.items.find((it) => it.id === id);
}

function setDone(ids, done) {
  const now = new Date().toISOString();
  for (const id of ids) {
    const it = findItem(id);
    if (it) it.doneAt = done ? now : null;
  }
  changed();
}

function describeTarget(target, now) {
  return core.whereLabel(target, settings, now);
}

function addItem(text) {
  const now = new Date();
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const { target, query } = core.parse(trimmed, now, settings);
  const item = core.createItem(trimmed, target, now);
  data.items.push(item);
  changed();

  const alternatives = [];
  if (item.kind === 'slot' && query && !query.st) {
    const t = core.nextAfter(query, settings, core.itemTimes(item, settings).start);
    if (t) alternatives.push({ label: `その次（${describeTarget(t, now)}）`, target: t });
  }
  if (!(item.kind === 'slot' && item.slot === 'kaeri')) {
    const k = core.nextKaeri(settings, now);
    if (k) alternatives.push({ label: describeTarget(k, now), target: k });
  }
  if (item.kind !== 'memo') {
    alternatives.push({ label: '今日のメモ', target: { kind: 'memo', date: core.dateKey(now) } });
  }
  return { id: item.id, where: describeTarget(item, now), alternatives };
}

function reassign(id, target) {
  const it = findItem(id);
  if (!it) return null;
  delete it.slot;
  delete it.at;
  Object.assign(it, target);
  changed();
  return { id, where: describeTarget(it, new Date()) };
}

// ---------------------------------------------------------------- 時計

function tick() {
  const now = new Date();
  try {
    maybeMorning(now);
    checkTriggers(now);
    checkSnooze(now);
    checkPhone(now);
  } catch (err) {
    store.log(`tick: ${err.stack || err}`);
  }
  const minute = Math.floor(now.getTime() / 60000);
  if (minute !== lastMinute) {
    lastMinute = minute;
    for (const w of [listWin]) if (w && !w.isDestroyed()) w.webContents.send('refresh');
    refreshAlert();
  }
}

// 朝、その日はじめてPCを触った時に「今日のまとめ」
function maybeMorning(now) {
  const today = core.dateKey(now);
  if (data.morningAt && core.dateKey(new Date(data.morningAt)) === today) return;
  if (now.getHours() < 5) return;
  if (powerMonitor.getSystemIdleTime() > 60) return;
  data.morningAt = now.toISOString();
  save();
  showAlert({ type: 'morning', id: `morning:${today}` });
}

function checkTriggers(now) {
  const today = core.dateKey(now);
  if (data.fired.date !== today) data.fired = { date: today, ids: [] };
  const due = core.dueTriggers(data.items, now, settings, new Set(data.fired.ids));
  if (!due.length) return;
  data.fired.ids.push(...due.map((t) => t.id));
  save();
  // スリープ明けなどで複数たまっていたら、一番新しいものだけ出す（古いものは「やり残し」として一緒に出る）
  const t = due[due.length - 1];
  // 朝のまとめを出した直後なら、朝STの割り込みは省く
  if (t.slot === 'asa' && data.morningAt && now - new Date(data.morningAt) < 15 * 60000) return;
  showAlert(t);
}

function checkSnooze(now) {
  if (snooze && now.getTime() >= snooze.until) {
    const spec = snooze.spec;
    snooze = null;
    showAlert(spec);
  }
}

function checkPhone(now) {
  const a = currentAlert;
  if (!a || a.interacted || a.phoneSent || a.spec.type === 'morning') return;
  if (!settings.phone.enabled || !settings.phone.topic) return;
  if (now.getTime() - a.shownAt < settings.reminders.phoneAfterMin * 60000) return;
  a.phoneSent = true;
  sendPhone(net, settings.phone, core.phoneMessage(a.payload)).catch((err) => store.log(`スマホ通知に失敗: ${err.message}`));
}

// ---------------------------------------------------------------- 割り込み画面

async function showAlert(spec) {
  const payload = core.buildAlert(spec, data.items, new Date(), settings);
  if (!payload) return false;
  const hidden = await shouldHide(settings.privacy, screen);
  data.alertCount = (data.alertCount || 0) + 1;
  save();
  currentAlert = {
    spec,
    payload,
    shownAt: Date.now(),
    interacted: false,
    phoneSent: false,
    hidden,
    accent: data.alertCount % ACCENTS,
  };
  openAlertWindow();
  return true;
}

function refreshAlert() {
  if (!currentAlert) return;
  const payload = core.buildAlert(currentAlert.spec, data.items, new Date(), settings);
  if (!payload) {
    closeAlert();
    return;
  }
  currentAlert.payload = payload;
  if (alertWin && !alertWin.isDestroyed()) alertWin.webContents.send('alert:update');
}

function alertBounds(large) {
  const wa = screen.getPrimaryDisplay().workArea;
  if (large) {
    const w = Math.min(1280, Math.round(wa.width * 0.88));
    const h = Math.min(960, Math.round(wa.height * 0.88));
    return { x: wa.x + Math.round((wa.width - w) / 2), y: wa.y + Math.round((wa.height - h) / 2), width: w, height: h };
  }
  const w = Math.min(640, wa.width - 32);
  const h = 260;
  return { x: wa.x + Math.round((wa.width - w) / 2), y: wa.y + 32, width: w, height: h };
}

function openAlertWindow() {
  const bounds = alertBounds(!currentAlert.hidden);
  if (!alertWin || alertWin.isDestroyed()) {
    alertWin = new BrowserWindow({
      ...bounds,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      show: false,
      title: 'MYreminder',
      backgroundColor: '#FBF8F3',
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
    });
    alertWin.setAlwaysOnTop(true, 'screen-saver');
    alertWin.on('closed', () => {
      alertWin = null;
    });
    alertWin.loadFile(path.join(RENDERER, 'alert.html'));
    alertWin.once('ready-to-show', presentAlert);
  } else {
    alertWin.setBounds(bounds);
    alertWin.webContents.send('alert:update');
    presentAlert();
  }
}

function presentAlert() {
  if (!alertWin || alertWin.isDestroyed()) return;
  alertWin.setAlwaysOnTop(true, 'screen-saver');
  alertWin.show();
  alertWin.moveTop();
  alertWin.focus();
  alertWin.flashFrame(true);
}

function closeAlert() {
  currentAlert = null;
  if (alertWin && !alertWin.isDestroyed()) {
    alertWin.flashFrame(false);
    alertWin.hide();
  }
}

// ---------------------------------------------------------------- 入力・一覧・設定・＋ボタン

function webPrefs() {
  return { preload: PRELOAD, contextIsolation: true, sandbox: true };
}

function openInput() {
  if (!inputWin || inputWin.isDestroyed()) {
    inputWin = new BrowserWindow({
      width: 760,
      height: 340,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      title: 'MYreminder 入力',
      backgroundColor: '#FBF8F3',
      webPreferences: webPrefs(),
    });
    inputWin.setAlwaysOnTop(true, 'floating');
    inputWin.on('blur', () => {
      if (inputWin && !inputWin.isDestroyed()) inputWin.hide();
    });
    inputWin.on('closed', () => {
      inputWin = null;
    });
    inputWin.loadFile(path.join(RENDERER, 'input.html'));
    inputWin.once('ready-to-show', () => showInput());
    return;
  }
  showInput();
}

function showInput() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = display.workArea;
  const [w, h] = inputWin.getSize();
  inputWin.setPosition(wa.x + Math.round((wa.width - w) / 2), wa.y + Math.round(wa.height * 0.18));
  inputWin.show();
  inputWin.focus();
  inputWin.webContents.send('input:focus');
}

function openList() {
  if (listWin && !listWin.isDestroyed()) {
    if (listWin.isMinimized()) listWin.restore();
    listWin.show();
    listWin.focus();
    return;
  }
  listWin = new BrowserWindow({
    width: 980,
    height: 780,
    minWidth: 520,
    minHeight: 480,
    title: 'MYreminder',
    icon: path.join(ASSETS, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#FBF8F3',
    webPreferences: webPrefs(),
  });
  listWin.on('closed', () => {
    listWin = null;
  });
  listWin.loadFile(path.join(RENDERER, 'list.html'));
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 860,
    height: 860,
    title: 'MYreminder 設定',
    icon: path.join(ASSETS, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#FBF8F3',
    webPreferences: webPrefs(),
  });
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
  settingsWin.loadFile(path.join(RENDERER, 'settings.html'));
}

const FAB_SIZE = 64;

function fabPosition() {
  const { x, y } = settings.fab;
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return x >= a.x && y >= a.y && x + FAB_SIZE <= a.x + a.width && y + FAB_SIZE <= a.y + a.height;
    });
    if (onScreen) return { x, y };
  }
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - FAB_SIZE - 6, y: wa.y + Math.round(wa.height * 0.62) };
}

function syncFab() {
  if (!settings.fab.show) {
    if (fabWin && !fabWin.isDestroyed()) fabWin.close();
    fabWin = null;
    return;
  }
  const pos = fabPosition();
  if (fabWin && !fabWin.isDestroyed()) {
    fabWin.setPosition(pos.x, pos.y);
    return;
  }
  fabWin = new BrowserWindow({
    ...pos,
    width: FAB_SIZE,
    height: FAB_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    title: 'MYreminder ＋',
    webPreferences: webPrefs(),
  });
  fabWin.setAlwaysOnTop(true, 'floating');
  fabWin.on('closed', () => {
    fabWin = null;
  });
  fabWin.loadFile(path.join(RENDERER, 'fab.html'));
}

// ---------------------------------------------------------------- タスクトレイ・ショートカット

function trayImage() {
  const img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('MYreminder');
  tray.on('click', () => openList());
  updateTrayMenu();
}

function isClosedToday() {
  const key = core.dateKey(new Date());
  return (settings.closedDays || []).includes(key);
}

function toggleClosedToday() {
  const key = core.dateKey(new Date());
  const list = settings.closedDays || [];
  settings.closedDays = list.includes(key) ? list.filter((d) => d !== key) : [...list, key];
  saveSettings();
  changed();
  updateTrayMenu();
}

function setPrivacy(mode) {
  settings.privacy = mode;
  saveSettings();
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const hotkeyLabel = hotkeyInUse ? `（${hotkeyInUse.replace('Control', 'Ctrl')}）` : '';
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `＋ 一言入れる${hotkeyLabel}`, click: openInput },
      { label: '一覧を見る', click: openList },
      {
        label: '今日のまとめを出す',
        click: async () => {
          if (!(await showAlert({ type: 'morning', id: 'manual' }))) openList();
        },
      },
      { type: 'separator' },
      { label: '今日は時間割どおりではない（授業の割り込みを止める）', type: 'checkbox', checked: isClosedToday(), click: toggleClosedToday },
      {
        label: '目隠しモード',
        submenu: [
          { label: '自動（プロジェクタ接続中だけ）', type: 'radio', checked: settings.privacy === 'auto', click: () => setPrivacy('auto') },
          { label: 'いつも目隠し', type: 'radio', checked: settings.privacy === 'always', click: () => setPrivacy('always') },
          { label: '目隠ししない', type: 'radio', checked: settings.privacy === 'off', click: () => setPrivacy('off') },
        ],
      },
      { label: '設定…', click: openSettings },
      { type: 'separator' },
      { label: 'MYreminder を終了', click: () => app.quit() },
    ]),
  );
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  hotkeyInUse = null;
  for (const key of [settings.hotkey, 'Control+Alt+Space']) {
    try {
      if (key && globalShortcut.register(key, openInput)) {
        hotkeyInUse = key;
        break;
      }
    } catch (err) {
      store.log(`ショートカット ${key} を登録できません: ${err.message}`);
    }
  }
  updateTrayMenu();
}

// ---------------------------------------------------------------- 画面とのやりとり

function timetableRows() {
  const days = ['月', '火', '水', '木', '金'];
  const max = Math.max(...days.map((d) => (settings.bell.periodsPerDay[d] !== undefined ? settings.bell.periodsPerDay[d] : settings.bell.periodsPerDay.default)));
  const rows = [];
  for (let p = 1; p <= max; p++) {
    const [s, e] = settings.bell.periods[p - 1] || ['', ''];
    rows.push({ label: `${p}限`, time: `${s}〜${e}`, cells: days.map((d) => (settings.timetable[d] || {})[p] || '') });
  }
  const kaeri = days.map((d) => (settings.bell.kaeriST[d] !== undefined ? settings.bell.kaeriST[d] : settings.bell.kaeriST.default));
  return { days, rows, asa: settings.bell.asaST, kaeri };
}

function registerIpc() {
  ipcMain.handle('item:add', (_e, text) => addItem(text));
  ipcMain.handle('item:reassign', (_e, id, target) => reassign(id, target));
  ipcMain.handle('item:done', (_e, id) => setDone([id], true));
  ipcMain.handle('item:doneMany', (_e, ids) => setDone(ids, true));
  ipcMain.handle('item:undone', (_e, id) => setDone([id], false));
  ipcMain.handle('item:remove', (_e, id) => {
    data.items = data.items.filter((it) => it.id !== id);
    changed();
  });
  ipcMain.handle('list:get', () => core.buildList(data.items, new Date(), settings));

  ipcMain.handle('alert:get', () => {
    if (!currentAlert) return null;
    const { payload, hidden, accent, shownAt } = currentAlert;
    const hiddenReason = settings.privacy === 'always' ? 'always' : 'projector';
    return { payload, hidden, hiddenReason, accent, shownAt, sound: settings.sound && !hidden };
  });
  ipcMain.handle('alert:interact', () => {
    if (currentAlert) currentAlert.interacted = true;
  });
  ipcMain.handle('alert:reveal', () => {
    if (!currentAlert) return;
    currentAlert.interacted = true;
    currentAlert.hidden = false;
    if (alertWin && !alertWin.isDestroyed()) {
      alertWin.setBounds(alertBounds(true));
      alertWin.webContents.send('alert:update');
    }
  });
  ipcMain.handle('alert:close', () => closeAlert());
  ipcMain.handle('alert:snooze', () => {
    if (currentAlert) snooze = { spec: currentAlert.spec, until: Date.now() + settings.reminders.snoozeMin * 60000 };
    closeAlert();
  });

  ipcMain.handle('input:close', () => {
    if (inputWin && !inputWin.isDestroyed()) inputWin.hide();
  });
  ipcMain.handle('open:list', () => {
    if (inputWin && !inputWin.isDestroyed()) inputWin.hide();
    openList();
  });
  ipcMain.handle('open:settings', () => openSettings());
  ipcMain.handle('open:input', () => openInput());

  ipcMain.handle('settings:get', () => ({
    settings,
    error: settingsError,
    hotkey: hotkeyInUse,
    timetable: timetableRows(),
    dataDir: store.dir,
    version: app.getVersion(),
  }));
  ipcMain.handle('settings:set', (_e, patch) => {
    // 画面から変えてよい項目だけ
    if (patch.privacy && ['auto', 'always', 'off'].includes(patch.privacy)) settings.privacy = patch.privacy;
    if (typeof patch.sound === 'boolean') settings.sound = patch.sound;
    if (typeof patch.fabShow === 'boolean') settings.fab.show = patch.fabShow;
    if (typeof patch.phoneEnabled === 'boolean') settings.phone.enabled = patch.phoneEnabled;
    if (Number.isFinite(patch.phoneAfterMin)) settings.reminders.phoneAfterMin = Math.max(1, Math.min(30, patch.phoneAfterMin));
    saveSettings();
    syncFab();
    updateTrayMenu();
    return settings;
  });
  ipcMain.handle('settings:openFile', () => shell.openPath(store.settingsPath));
  ipcMain.handle('phone:newTopic', () => {
    settings.phone.topic = newTopic();
    saveSettings();
    return settings.phone.topic;
  });
  ipcMain.handle('phone:test', async () => {
    try {
      await sendPhone(net, settings.phone, '📌 MYreminder のテスト通知です');
      return { ok: true };
    } catch (err) {
      store.log(`テスト通知に失敗: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('displays:test', () => inspectDisplays(screen));

  ipcMain.handle('fab:move', (e, dx, dy) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.handle('fab:moved', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    const [x, y] = win.getPosition();
    settings.fab.x = x;
    settings.fab.y = y;
    saveSettings();
  });
}

// 動作確認用（scripts/smoke.js から使う）
module.exports = {
  _test: {
    addItem,
    showAlert,
    openInput,
    openList,
    openSettings,
    setPrivacy,
    get data() {
      return data;
    },
    changed,
  },
};
