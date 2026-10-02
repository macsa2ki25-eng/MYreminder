'use strict';

// 初期設定。アプリ初回起動時に settings.json として書き出され、あとから編集できる。
const DEFAULT_SETTINGS = {
  version: 1,
  bell: {
    asaST: '08:50',
    stMinutes: 10,
    periods: [
      ['09:00', '09:50'],
      ['10:00', '10:50'],
      ['11:00', '11:50'],
      ['12:00', '12:50'],
      ['13:30', '14:20'],
      ['14:30', '15:20'],
      ['15:30', '16:20'],
    ],
    lunch: ['12:50', '13:30'],
    // 曜日ごとの帰りSTの開始時刻（書いていない曜日は default）
    kaeriST: { 月: '16:30', default: '15:30' },
    // 曜日ごとの授業のコマ数（書いていない曜日は default）
    periodsPerDay: { 月: 7, default: 6 },
  },
  // 曜日 → 何限 → 「科目 クラス」
  timetable: {
    月: { 3: '論表Ⅲ 3-1', 4: 'ECⅢ 3-4', 7: 'LT 3-3' },
    火: { 1: 'ECⅢ 3-4', 4: '論表① 3-3', 5: '情報Ⅰ 1-4' },
    水: { 2: '3年担', 3: '論表Ⅲ 3-1', 5: '進路部' },
    木: { 1: '情報Ⅰ 1-4', 4: '英語科', 5: 'ECⅢ 3-4', 6: 'けやき 3-3' },
    金: { 1: 'ECⅢ 3-4', 3: '論表① 3-3' },
  },
  // 時間割の言葉の別名（入力でこの言葉を使っても同じコマに入る）
  aliases: {
    '3年担': ['学年会', '担任会'],
    LT: ['LHR'],
    進路部: ['進路部会'],
    英語科: ['教科会', '英語科会'],
  },
  // 授業がない日（祝日・土日は自動）。'2026-12-24' または '2026-12-24~2027-01-07'
  closedDays: [],
  reminders: {
    beforeSlotMin: 5,
    beforeEventMin: 10,
    lunch: true,
    phoneAfterMin: 3,
    snoozeMin: 5,
  },
  // 目隠しモード: 'auto'（プロジェクタ接続を検知）, 'always', 'off'
  privacy: 'auto',
  phone: { enabled: false, server: 'https://ntfy.sh', topic: '' },
  fab: { show: true, x: null, y: null },
  sound: true,
  hotkey: 'Control+Shift+Space',
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// 保存済みの設定にデフォルトを補う（ユーザーが書いた値を優先）
function mergeSettings(saved) {
  function merge(def, val) {
    if (val === undefined) return structuredClone(def);
    if (isPlainObject(def) && isPlainObject(val)) {
      const out = {};
      for (const k of Object.keys(def)) out[k] = merge(def[k], val[k]);
      for (const k of Object.keys(val)) if (!(k in def)) out[k] = val[k];
      return out;
    }
    return val;
  }
  const merged = merge(DEFAULT_SETTINGS, saved || {});
  // 時間割・別名はユーザーの値をそのまま使う（曜日を消した場合に復活させない）
  if (saved && isPlainObject(saved.timetable)) merged.timetable = saved.timetable;
  if (saved && isPlainObject(saved.aliases)) merged.aliases = saved.aliases;
  return merged;
}

module.exports = { DEFAULT_SETTINGS, mergeSettings };
