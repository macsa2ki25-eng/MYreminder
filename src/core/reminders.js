'use strict';

const { dateKey, startOfDay, addMinutes, atTime, hhmm, dateLabel, fromDateKey } = require('./dates');
const { dayPlan, slotLabel, findSlot } = require('./timetable');
const { itemStatus, itemTimes, describe, daySections, overdueItems } = require('./items');

function createdBefore(item, time) {
  return new Date(item.createdAt) < time;
}

/**
 * その日の割り込みのタイミング一覧。
 * 用事がない時は割り込まない（出しすぎると慣れて見えなくなるので）。
 * 割り込みの時刻より後に入力した用事では割り込まない（入力した直後に割り込まれないように）。
 */
function dayTriggers(items, day, settings) {
  const key = dateKey(day);
  const r = settings.reminders;
  const plan = dayPlan(day, settings);
  const triggers = [];
  const pendingOn = (time, pred) =>
    items.filter((it) => !it.doneAt && pred(it) && createdBefore(it, time) && itemStatus(it, time, settings) !== 'done');

  const hasOverdueAt = (time) => items.some((it) => !it.doneAt && createdBefore(it, time) && itemStatus(it, time, settings) === 'overdue');
  const todaysMemosAt = (time) => pendingOn(time, (it) => it.kind === 'memo' && it.date === key);

  for (const slot of plan.slots) {
    const time = addMinutes(slot.start, -r.beforeSlotMin);
    const own = pendingOn(time, (it) => it.kind === 'slot' && it.date === key && it.slot === slot.key);
    const isKaeri = slot.key === 'kaeri';
    if (own.length || (isKaeri && (hasOverdueAt(time) || todaysMemosAt(time).length))) {
      triggers.push({ id: `${key}:${slot.key}`, type: isKaeri ? 'kaeri' : 'slot', date: key, slot: slot.key, time, expires: slot.end });
    }
  }

  if (r.lunch && plan.schoolDay) {
    const [ls, le] = settings.bell.lunch;
    const time = atTime(day, ls);
    const afternoonEvents = pendingOn(time, (it) => it.kind === 'event' && it.date === key);
    if (todaysMemosAt(time).length || hasOverdueAt(time) || afternoonEvents.length) {
      triggers.push({ id: `${key}:lunch`, type: 'lunch', date: key, time, expires: atTime(day, le) });
    }
  }

  for (const it of items) {
    if (it.kind !== 'event' || it.doneAt || it.date !== key) continue;
    const at = itemTimes(it, settings).start;
    const time = addMinutes(at, -r.beforeEventMin);
    if (!createdBefore(it, time)) continue;
    triggers.push({ id: `ev:${it.id}`, type: 'event', date: key, itemId: it.id, time, expires: at });
  }

  return triggers.sort((a, b) => a.time - b.time);
}

// いま出すべき割り込み（時刻を過ぎていて、まだ有効で、まだ出していないもの）
function dueTriggers(items, now, settings, firedIds) {
  return dayTriggers(items, startOfDay(now), settings).filter(
    (t) => now >= t.time && now < t.expires && !firedIds.has(t.id),
  );
}

function pendingDescribed(list, now, settings) {
  return list.filter((it) => itemStatus(it, now, settings) === 'pending').map((it) => describe(it, now, settings));
}

/**
 * 割り込み画面に出す内容。出すものがなければ null。
 * kind: 'morning' | 'slot' | 'kaeri' | 'lunch' | 'event'
 */
function buildAlert(spec, items, now, settings) {
  const today = startOfDay(now);
  const key = dateKey(today);
  const overdue = overdueItems(items, now, settings);
  const base = { type: spec.type, id: spec.id || `${spec.type}:${key}`, now: now.toISOString(), dateLabel: dateLabel(today), overdue };

  if (spec.type === 'morning') {
    const sections = daySections(items, today, now, settings);
    const count = sections.reduce((n, s) => n + s.items.length, 0);
    if (!count && !overdue.length) return null;
    return {
      ...base,
      title: 'おはようございます',
      subtitle: count ? `今日の用事 ${count}件` : '今日の用事はありません',
      sections,
      primary: [],
      count: count + overdue.length,
      privacyText: `今日の用事が ${count + overdue.length}件 あります`,
    };
  }

  if (spec.type === 'slot' || spec.type === 'kaeri') {
    const day = fromDateKey(spec.date);
    const slot = findSlot(day, spec.slot, settings);
    if (!slot) return null;
    const own = pendingDescribed(
      items.filter((it) => !it.doneAt && it.kind === 'slot' && it.date === spec.date && it.slot === spec.slot),
      now,
      settings,
    );
    const memos =
      spec.type === 'kaeri'
        ? pendingDescribed(items.filter((it) => !it.doneAt && it.kind === 'memo' && it.date === key), now, settings)
        : [];
    if (!own.length && !memos.length && !overdue.length) return null;
    const label = slotLabel(slot);
    return {
      ...base,
      title: spec.type === 'kaeri' ? '帰りST' : `次は ${label}`,
      subtitle: spec.date === key ? `${hhmm(slot.start)} から` : `${dateLabel(day)} ${hhmm(slot.start)} から`,
      primary: own,
      memos,
      count: own.length + memos.length + overdue.length,
      privacyText: `${slot.label}の用事が ${own.length + memos.length}件 あります`,
    };
  }

  if (spec.type === 'lunch') {
    const memos = pendingDescribed(items.filter((it) => !it.doneAt && it.kind === 'memo' && it.date === key), now, settings);
    const events = pendingDescribed(items.filter((it) => !it.doneAt && it.kind === 'event' && it.date === key), now, settings);
    if (!memos.length && !events.length && !overdue.length) return null;
    return {
      ...base,
      title: '昼休み',
      subtitle: '今日のメモ・午後の予定',
      primary: memos,
      events,
      count: memos.length + events.length + overdue.length,
      privacyText: `メモが ${memos.length + events.length}件 あります`,
    };
  }

  if (spec.type === 'event') {
    const it = items.find((x) => x.id === spec.itemId);
    if (!it || it.doneAt || itemStatus(it, now, settings) !== 'pending') return null;
    const at = itemTimes(it, settings).start;
    const mins = Math.max(0, Math.round((at - now) / 60000));
    return {
      ...base,
      title: mins > 0 ? `${mins}分後に予定` : 'いまから予定',
      subtitle: `${hhmm(at)} から`,
      primary: [describe(it, now, settings)],
      count: 1 + overdue.length,
      privacyText: `${hhmm(at)} の予定があります`,
    };
  }

  return null;
}

// スマホ通知の文面（中身は伏せる）
function phoneMessage(alert) {
  const what = {
    morning: '今日のまとめ',
    slot: alert.privacyText.split('の用事')[0] + 'の前',
    kaeri: '帰りSTの前',
    lunch: '昼休み',
    event: '予定の前',
  }[alert.type];
  return `📌 PCにリマインドがあります（${what}）`;
}

module.exports = { dayTriggers, dueTriggers, buildAlert, phoneMessage };
