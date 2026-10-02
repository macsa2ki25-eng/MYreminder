'use strict';

const { fromDateKey, atTime, dateKey, dateLabel, addDays, startOfDay } = require('./dates');
const { findSlot, slotLabel, dayPlan } = require('./timetable');

let counter = 0;
function newId(now) {
  counter = (counter + 1) % 1000;
  return `${now.getTime().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function createItem(text, target, now, source = 'pc') {
  return { id: newId(now), text: text.trim(), ...target, createdAt: now.toISOString(), doneAt: null, source };
}

// その用事の「いつ」（開始・終了）
function itemTimes(item, settings) {
  const day = fromDateKey(item.date);
  if (item.kind === 'slot') {
    const slot = findSlot(day, item.slot, settings);
    if (slot) return { start: slot.start, end: slot.end, slot };
    // 時間割が変わってそのコマがなくなった場合は、その日いっぱい
    return { start: day, end: addDays(day, 1), slot: null };
  }
  if (item.kind === 'event') {
    const at = atTime(day, item.at);
    return { start: at, end: at };
  }
  return { start: day, end: addDays(day, 1) };
}

/** 'done' | 'past'（予定が過ぎた） | 'overdue'（やり残し・赤） | 'pending' */
function itemStatus(item, now, settings) {
  if (item.doneAt) return 'done';
  const { end } = itemTimes(item, settings);
  if (item.kind === 'event') return now >= end ? 'past' : 'pending';
  return now >= end ? 'overdue' : 'pending';
}

function slotKeyLabel(item, settings) {
  const day = fromDateKey(item.date);
  const slot = findSlot(day, item.slot, settings);
  if (slot) return slotLabel(slot);
  return { asa: '朝ST', kaeri: '帰りST' }[item.slot] || `${item.slot.replace('p', '')}限`;
}

// 「10/5(月) 4限 ECⅢ 3-4」のような説明
function whereLabel(item, settings, now) {
  const day = fromDateKey(item.date);
  const today = startOfDay(now);
  const dayText =
    dateKey(day) === dateKey(today) ? '今日' : dateKey(day) === dateKey(addDays(today, 1)) ? '明日' : dateLabel(day);
  if (item.kind === 'slot') return `${dayText} ${slotKeyLabel(item, settings)}`;
  if (item.kind === 'event') return `${dayText} ${item.at.replace(/^0/, '')}`;
  return `${dayText}のメモ`;
}

function describe(item, now, settings) {
  return {
    id: item.id,
    text: item.text,
    kind: item.kind,
    where: whereLabel(item, settings, now),
    status: itemStatus(item, now, settings),
    source: item.source,
  };
}

function sortByTime(items, settings) {
  return [...items].sort((a, b) => itemTimes(a, settings).start - itemTimes(b, settings).start);
}

// 完了から7日、過ぎた予定は1日で消す
function purge(items, now, settings) {
  return items.filter((it) => {
    if (it.doneAt) return now - new Date(it.doneAt) < 7 * 86400000;
    if (it.kind === 'event') return now - itemTimes(it, settings).end < 86400000;
    return true;
  });
}

// その日のコマごとのまとまり（一覧・朝のまとめで使う）
function daySections(items, day, now, settings) {
  const key = dateKey(day);
  const mine = items.filter((it) => it.date === key && !it.doneAt);
  const sections = [];
  const plan = dayPlan(day, settings);
  const usedSlots = new Set();
  for (const slot of plan.slots) {
    const list = mine.filter((it) => it.kind === 'slot' && it.slot === slot.key && itemStatus(it, now, settings) === 'pending');
    if (list.length) {
      usedSlots.add(slot.key);
      sections.push({ type: 'slot', label: slotLabel(slot), time: slot.start, items: list.map((it) => describe(it, now, settings)) });
    }
  }
  // 時間割にないコマに入っている用事（設定変更などで）
  const orphan = mine.filter((it) => it.kind === 'slot' && !plan.slots.some((s) => s.key === it.slot) && itemStatus(it, now, settings) === 'pending');
  for (const it of orphan) sections.push({ type: 'slot', label: slotKeyLabel(it, settings), time: day, items: [describe(it, now, settings)] });
  for (const it of mine.filter((it) => it.kind === 'event' && itemStatus(it, now, settings) === 'pending')) {
    sections.push({ type: 'event', label: it.at.replace(/^0/, ''), time: itemTimes(it, settings).start, items: [describe(it, now, settings)] });
  }
  sections.sort((a, b) => a.time - b.time);
  const memos = mine.filter((it) => it.kind === 'memo' && itemStatus(it, now, settings) === 'pending');
  if (memos.length) sections.push({ type: 'memo', label: 'メモ', time: null, items: memos.map((it) => describe(it, now, settings)) });
  return sections.map((s) => ({ ...s, time: s.time ? s.time.toISOString() : null }));
}

function overdueItems(items, now, settings) {
  return sortByTime(
    items.filter((it) => itemStatus(it, now, settings) === 'overdue'),
    settings,
  ).map((it) => describe(it, now, settings));
}

// 一覧画面のデータ
function buildList(items, now, settings) {
  const today = startOfDay(now);
  const later = [];
  const futureKeys = [...new Set(items.filter((it) => !it.doneAt && it.date > dateKey(today)).map((it) => it.date))].sort();
  for (const key of futureKeys) {
    const day = fromDateKey(key);
    const sections = daySections(items, day, now, settings);
    if (sections.length) later.push({ date: key, label: dateLabel(day), sections });
  }
  const recentDone = items
    .filter((it) => it.doneAt && now - new Date(it.doneAt) < 86400000)
    .sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt))
    .slice(0, 10)
    .map((it) => describe(it, now, settings));
  return {
    now: now.toISOString(),
    todayLabel: dateLabel(today),
    overdue: overdueItems(items, now, settings),
    today: daySections(items, today, now, settings),
    later,
    recentDone,
  };
}

module.exports = {
  createItem,
  itemTimes,
  itemStatus,
  whereLabel,
  describe,
  purge,
  daySections,
  overdueItems,
  buildList,
  sortByTime,
};
