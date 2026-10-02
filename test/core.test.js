'use strict';

process.env.TZ = 'Asia/Tokyo';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');

const settings = core.mergeSettings({});

function at(s) {
  // '2026-10-02 10:00'
  const [d, t = '00:00'] = s.split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  return new Date(y, m - 1, day, h, min);
}

function target(text, now) {
  return core.parse(text, at(now), settings).target;
}

test('祝日', () => {
  assert.equal(core.holidayName(at('2026-10-12')), 'スポーツの日');
  assert.equal(core.holidayName(at('2026-09-21')), '敬老の日');
  assert.equal(core.holidayName(at('2026-09-22')), '国民の休日');
  assert.equal(core.holidayName(at('2026-09-23')), '秋分の日');
  assert.equal(core.holidayName(at('2026-05-06')), '振替休日');
  assert.equal(core.holidayName(at('2026-03-20')), '春分の日');
  assert.equal(core.holidayName(at('2026-10-02')), null);
});

test('時間割：月曜は7限、帰りSTは16:30', () => {
  const plan = core.dayPlan(at('2026-10-05'), settings);
  assert.deepEqual(
    plan.slots.map((s) => s.key),
    ['asa', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'kaeri'],
  );
  assert.equal(plan.slots.find((s) => s.key === 'p7').title, 'LT 3-3');
  assert.equal(core.hhmm(plan.slots.at(-1).start), '16:30');
  const fri = core.dayPlan(at('2026-10-02'), settings);
  assert.equal(fri.slots.length, 8);
  assert.equal(core.hhmm(fri.slots.at(-1).start), '15:30');
  assert.equal(core.dayPlan(at('2026-10-12'), settings).schoolDay, false);
});

test('クラス名 → 次のそのクラスの授業', () => {
  assert.deepEqual(target('3-4 プリント配る', '2026-10-02 08:00'), { kind: 'slot', date: '2026-10-02', slot: 'p1' });
  assert.deepEqual(target('3-4 プリント配る', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-05', slot: 'p4' });
  assert.deepEqual(target('３－４　プリント', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-05', slot: 'p4' });
  assert.deepEqual(target('3年4組 プリント', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-05', slot: 'p4' });
  // 授業中に書いたら次の回
  assert.deepEqual(target('3-4 宿題確認', '2026-10-02 09:20'), { kind: 'slot', date: '2026-10-05', slot: 'p4' });
});

test('祝日はとばす', () => {
  // 10/12(月)はスポーツの日 → 次の3-1は10/14(水)3限
  assert.deepEqual(target('3-1 小テスト', '2026-10-09 10:00'), { kind: 'slot', date: '2026-10-14', slot: 'p3' });
});

test('科目名', () => {
  assert.deepEqual(target('論表 プリント', '2026-10-02 08:00'), { kind: 'slot', date: '2026-10-02', slot: 'p3' });
  assert.deepEqual(target('論表Ⅲ プリント', '2026-10-02 08:00'), { kind: 'slot', date: '2026-10-05', slot: 'p3' });
  assert.deepEqual(target('論表3 プリント', '2026-10-02 08:00'), { kind: 'slot', date: '2026-10-05', slot: 'p3' });
  assert.deepEqual(target('EC 単語テスト', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-05', slot: 'p4' });
  assert.deepEqual(target('ECⅢで単語テスト', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-05', slot: 'p4' });
  assert.deepEqual(target('情報 課題回収', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-06', slot: 'p5' });
  assert.deepEqual(target('けやき アンケート', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-08', slot: 'p6' });
  assert.deepEqual(target('LT 席替え', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-05', slot: 'p7' });
});

test('普通の言葉を科目とまちがえない', () => {
  assert.equal(target('保護者に情報を伝える', '2026-10-02 10:00').kind, 'memo');
  assert.equal(target('情報を保護者に送る', '2026-10-02 10:00').kind, 'memo');
  assert.equal(target('進路希望調査を集める', '2026-10-02 10:00').kind, 'memo');
  assert.equal(target('テストの採点', '2026-10-02 10:00').kind, 'memo');
});

test('会議', () => {
  assert.deepEqual(target('進路部で話す', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-07', slot: 'p5' });
  assert.deepEqual(target('学年会で報告', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-07', slot: 'p2' });
  assert.deepEqual(target('英語科 教材の相談', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-08', slot: 'p4' });
});

test('ST', () => {
  assert.deepEqual(target('帰りST 保護者会の手紙', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-02', slot: 'kaeri' });
  assert.deepEqual(target('帰りのSTで話す', '2026-10-02 16:00'), { kind: 'slot', date: '2026-10-05', slot: 'kaeri' });
  assert.deepEqual(target('朝ST 提出物', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-05', slot: 'asa' });
  assert.deepEqual(target('ST 連絡', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-02', slot: 'kaeri' });
  assert.deepEqual(target('明日の朝のSTで集金', '2026-10-04 20:00'), { kind: 'slot', date: '2026-10-05', slot: 'asa' });
});

test('限', () => {
  assert.deepEqual(target('3限 小テスト返す', '2026-10-02 08:00'), { kind: 'slot', date: '2026-10-02', slot: 'p3' });
  assert.deepEqual(target('3時間目 プリント', '2026-10-02 08:00'), { kind: 'slot', date: '2026-10-02', slot: 'p3' });
  assert.deepEqual(target('3限 小テスト返す', '2026-10-02 12:00'), { kind: 'slot', date: '2026-10-05', slot: 'p3' });
  assert.deepEqual(target('7限 アンケート', '2026-10-02 12:00'), { kind: 'slot', date: '2026-10-05', slot: 'p7' });
});

test('日付', () => {
  assert.deepEqual(target('10/7 3-1 プリント', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-07', slot: 'p3' });
  assert.deepEqual(target('来週月曜 3-4 返却', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-05', slot: 'p4' });
  assert.deepEqual(target('明日 鍵返す', '2026-10-02 10:00'), { kind: 'memo', date: '2026-10-03' });
  assert.deepEqual(target('鍵返す', '2026-10-02 10:00'), { kind: 'memo', date: '2026-10-02' });
  assert.deepEqual(target('20日 書類提出', '2026-10-02 10:00'), { kind: 'memo', date: '2026-10-20' });
  assert.deepEqual(target('10月20日 書類提出', '2026-10-02 10:00'), { kind: 'memo', date: '2026-10-20' });
});

test('予定', () => {
  assert.deepEqual(target('15時 電話する', '2026-10-02 10:00'), { kind: 'event', date: '2026-10-02', at: '15:00' });
  assert.deepEqual(target('15時 電話する', '2026-10-02 16:00'), { kind: 'event', date: '2026-10-03', at: '15:00' });
  assert.deepEqual(target('3時半 面談', '2026-10-02 10:00'), { kind: 'event', date: '2026-10-02', at: '15:30' });
  assert.deepEqual(target('金曜 15:30 学年会', '2026-10-02 10:00'), { kind: 'event', date: '2026-10-02', at: '15:30' });
  assert.deepEqual(target('金曜 15時 学年会', '2026-10-02 16:00'), { kind: 'event', date: '2026-10-09', at: '15:00' });
  assert.deepEqual(target('10/5 午前8時 打合せ', '2026-10-02 10:00'), { kind: 'event', date: '2026-10-05', at: '08:00' });
  // クラス名があれば授業を優先
  assert.deepEqual(target('3-4 15時までに提出', '2026-10-02 10:00'), { kind: 'slot', date: '2026-10-05', slot: 'p4' });
});

test('状態：やり残しは赤', () => {
  const now = at('2026-10-02 10:00');
  const item = core.createItem('プリント', { kind: 'slot', date: '2026-10-02', slot: 'p1' }, at('2026-10-01 18:00'));
  assert.equal(core.itemStatus(item, at('2026-10-02 09:30'), settings), 'pending');
  assert.equal(core.itemStatus(item, now, settings), 'overdue');
  assert.equal(core.itemStatus({ ...item, doneAt: now.toISOString() }, now, settings), 'done');
  const memo = core.createItem('鍵', { kind: 'memo', date: '2026-10-02' }, now);
  assert.equal(core.itemStatus(memo, at('2026-10-02 23:00'), settings), 'pending');
  assert.equal(core.itemStatus(memo, at('2026-10-03 07:00'), settings), 'overdue');
  const ev = core.createItem('学年会', { kind: 'event', date: '2026-10-02', at: '15:00' }, now);
  assert.equal(core.itemStatus(ev, at('2026-10-02 15:01'), settings), 'past');
});

test('割り込みのタイミング', () => {
  const made = at('2026-10-01 18:00');
  const items = [
    core.createItem('進路希望調査を配る', { kind: 'slot', date: '2026-10-02', slot: 'p3' }, made),
    core.createItem('学年会', { kind: 'event', date: '2026-10-02', at: '16:00' }, made),
    core.createItem('鍵返す', { kind: 'memo', date: '2026-10-02' }, made),
    // 割り込みの直前に書いたものでは割り込まない
    core.createItem('小テスト', { kind: 'slot', date: '2026-10-02', slot: 'p1' }, at('2026-10-02 08:58')),
  ];
  const triggers = core.dayTriggers(items, at('2026-10-02'), settings);
  const list = triggers.map((t) => `${t.id.replace(/^ev:.*/, 'event')} ${core.hhmm(t.time)}`);
  assert.deepEqual(list, ['2026-10-02:p3 10:55', '2026-10-02:lunch 12:50', '2026-10-02:kaeri 15:25', 'event 15:50']);

  const due = core.dueTriggers(items, at('2026-10-02 10:56'), settings, new Set());
  assert.deepEqual(due.map((t) => t.id), ['2026-10-02:p3']);
  assert.equal(core.dueTriggers(items, at('2026-10-02 10:56'), settings, new Set(['2026-10-02:p3'])).length, 0);
  // 授業が終わったら、もう出さない
  assert.equal(core.dueTriggers(items, at('2026-10-02 11:51'), settings, new Set()).length, 0);
});

test('割り込みの中身', () => {
  const made = at('2026-10-01 18:00');
  const items = [
    core.createItem('進路希望調査を配る', { kind: 'slot', date: '2026-10-02', slot: 'p3' }, made),
    core.createItem('課題回収', { kind: 'slot', date: '2026-10-02', slot: 'p1' }, made),
  ];
  const alert = core.buildAlert({ type: 'slot', date: '2026-10-02', slot: 'p3' }, items, at('2026-10-02 10:55'), settings);
  assert.equal(alert.title, '次は 3限 論表① 3-3');
  assert.deepEqual(alert.primary.map((i) => i.text), ['進路希望調査を配る']);
  assert.deepEqual(alert.overdue.map((i) => i.text), ['課題回収']);
  assert.equal(alert.privacyText, '3限の用事が 1件 あります');
  assert.equal(core.phoneMessage(alert), '📌 PCにリマインドがあります（3限の前）');

  const morning = core.buildAlert({ type: 'morning' }, items, at('2026-10-02 08:00'), settings);
  assert.deepEqual(morning.sections.map((s) => s.label), ['1限 ECⅢ 3-4', '3限 論表① 3-3']);
  assert.equal(core.buildAlert({ type: 'morning' }, [], at('2026-10-02 08:00'), settings), null);
});

test('一覧', () => {
  const made = at('2026-10-01 18:00');
  const items = [
    core.createItem('進路希望調査を配る', { kind: 'slot', date: '2026-10-02', slot: 'p3' }, made),
    core.createItem('返却', { kind: 'slot', date: '2026-10-05', slot: 'p4' }, made),
  ];
  const list = core.buildList(items, at('2026-10-02 08:00'), settings);
  assert.equal(list.today[0].label, '3限 論表① 3-3');
  assert.equal(list.later[0].label, '10/5(月)');
  assert.equal(core.whereLabel(items[1], settings, at('2026-10-02 08:00')), '10/5(月) 4限 ECⅢ 3-4');
});

test('設定のマージ', () => {
  const merged = core.mergeSettings({ timetable: { 月: { 1: 'X 1-1' } }, reminders: { beforeSlotMin: 3 } });
  assert.deepEqual(merged.timetable, { 月: { 1: 'X 1-1' } });
  assert.equal(merged.reminders.beforeSlotMin, 3);
  assert.equal(merged.reminders.snoozeMin, 5);
});
