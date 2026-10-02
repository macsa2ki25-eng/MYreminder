'use strict';

const { WEEKDAYS, dateKey, atTime, addMinutes, addDays, startOfDay } = require('./dates');
const { holidayName } = require('./holidays');
const { normalize, splitNumeral } = require('./normalize');

const CLASS_RE = /(?<![\d/:.])([1-6])\s*(?:-|の|年)\s*([1-9]\d?)(?:組)?(?![\d/:])/;

function perWeekday(map, wd) {
  const name = WEEKDAYS[wd];
  return map[name] !== undefined ? map[name] : map.default;
}

function inClosedDays(key, closedDays) {
  for (const entry of closedDays || []) {
    const [from, to] = String(entry).split('~').map((s) => s.trim());
    if (to ? key >= from && key <= to : key === from) return true;
  }
  return false;
}

function isSchoolDay(day, settings) {
  const wd = day.getDay();
  if (wd === 0 || wd === 6) return false;
  if (holidayName(day)) return false;
  if (inClosedDays(dateKey(day), settings.closedDays)) return false;
  return true;
}

// その日のコマ（朝ST・1限〜・帰りST）。授業がない日は空。
function dayPlan(day, settings) {
  day = startOfDay(day);
  if (!isSchoolDay(day, settings)) return { schoolDay: false, slots: [] };
  const bell = settings.bell;
  const wd = day.getDay();
  const slots = [];
  const asaStart = atTime(day, bell.asaST);
  slots.push({ key: 'asa', label: '朝ST', title: '', start: asaStart, end: addMinutes(asaStart, bell.stMinutes) });
  const count = perWeekday(bell.periodsPerDay, wd);
  const table = settings.timetable[WEEKDAYS[wd]] || {};
  for (let i = 1; i <= count && i <= bell.periods.length; i++) {
    const [s, e] = bell.periods[i - 1];
    slots.push({
      key: `p${i}`,
      label: `${i}限`,
      title: table[i] || table[String(i)] || '',
      start: atTime(day, s),
      end: atTime(day, e),
    });
  }
  const kaeriStart = atTime(day, perWeekday(bell.kaeriST, wd));
  slots.push({ key: 'kaeri', label: '帰りST', title: '', start: kaeriStart, end: addMinutes(kaeriStart, bell.stMinutes) });
  return { schoolDay: true, slots };
}

function findSlot(day, slotKey, settings) {
  return dayPlan(day, settings).slots.find((s) => s.key === slotKey) || null;
}

function slotLabel(slot) {
  return slot.title ? `${slot.label} ${slot.title}` : slot.label;
}

// 時間割の「論表Ⅲ 3-1」から、入力と照らし合わせるための言葉を作る
function entryKeys(title, aliases) {
  const norm = normalize(title);
  const keys = [];
  let cls = null;
  const cm = norm.match(CLASS_RE);
  if (cm) cls = `${cm[1]}-${cm[2]}`;
  const rest = cm ? norm.replace(cm[0], ' ') : norm;
  for (const tok of rest.split(' ').filter(Boolean)) {
    const { base, num } = splitNumeral(tok);
    keys.push({ key: tok, weight: 2 });
    if (num !== null) {
      keys.push({ key: `${base}${num}`, weight: 2 });
      keys.push({ key: base, weight: 1 });
    }
  }
  for (const [word, list] of Object.entries(aliases || {})) {
    if (normalize(title).split(' ').includes(normalize(word))) {
      for (const a of list) keys.push({ key: normalize(a), weight: 2 });
    }
  }
  return { cls, keys };
}

// 時間割に出てくる全部の「科目 クラス」
function allEntries(settings) {
  const titles = new Set();
  for (const day of Object.values(settings.timetable || {})) {
    for (const t of Object.values(day)) if (t) titles.add(t);
  }
  return [...titles].map((title) => ({ title, ...entryKeys(title, settings.aliases) }));
}

// 条件に合う最初のコマを探す（今日から最大120日先まで）
function findNextSlot(from, settings, predicate, { includeStarted = false, sameDayOnly = false } = {}) {
  const base = startOfDay(from);
  const limit = sameDayOnly ? 1 : 120;
  for (let i = 0; i < limit; i++) {
    const day = addDays(base, i);
    for (const slot of dayPlan(day, settings).slots) {
      if (!includeStarted && slot.start <= from) continue;
      if (predicate(slot, day)) return { day, slot };
    }
  }
  return null;
}

module.exports = {
  CLASS_RE,
  isSchoolDay,
  dayPlan,
  findSlot,
  slotLabel,
  entryKeys,
  allEntries,
  findNextSlot,
};
