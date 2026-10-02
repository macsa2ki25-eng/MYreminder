'use strict';

const { WEEKDAYS, dateKey, addDays, startOfDay, pad } = require('./dates');
const { normalize } = require('./normalize');
const { CLASS_RE, allEntries, findNextSlot, isSchoolDay } = require('./timetable');

const PERIOD_RE = /([1-7])\s*(?:限|時間目|時限)目?/;
const KAERI_RE = /帰り\s*の?\s*(?:st|shr|hr|会|学活)|終礼|終学活|終わりの会/;
const ASA_RE = /朝\s*の?\s*(?:st|shr|hr|会|学活)|朝礼|朝学活/;
const BARE_ST_RE = /(?<![a-z])(?:st|shr|hr)(?![a-z])/;
const TIME_RE = /(午前|午後|am|pm)?\s*(\d{1,2})\s*(?::|時(?!間))\s*(?:(\d{1,2})\s*分?|(半))?/;

const BEFORE_OK = /[\s、。,.()（）「」・:：/]/;
const AFTER_OK = /[\s、。,.()（）「」・:：のでにへはも]/;

function blank(work, m) {
  return work.slice(0, m.index) + ' '.repeat(m[0].length) + work.slice(m.index + m[0].length);
}

// 入力に、時間割の言葉が「単語として」入っているか
function hasWord(work, key) {
  let from = 0;
  for (;;) {
    const i = work.indexOf(key, from);
    if (i < 0) return false;
    const before = i === 0 ? ' ' : work[i - 1];
    const after = i + key.length >= work.length ? ' ' : work[i + key.length];
    // 英字の科目名（EC など）は前後が英数字でなければよい。
    // 漢字の科目名（情報 など）は「情報を伝える」のような普通の言葉と区別するため、前後を厳しく見る。
    const asciiKey = /^[a-z0-9]/.test(key);
    const beforeOk = asciiKey ? !/[a-z0-9]/.test(before) : BEFORE_OK.test(before);
    const afterOk = asciiKey ? !/[a-z0-9]/.test(after) : AFTER_OK.test(after);
    if (beforeOk && afterOk) return true;
    from = i + 1;
  }
}

function parseDate(work, now) {
  const today = startOfDay(now);
  const tries = [
    [/明後日|あさって/, () => ({ date: addDays(today, 2) })],
    [/明日|あした/, () => ({ date: addDays(today, 1) })],
    [/今日|きょう|本日/, () => ({ date: today })],
    [
      /(再来週|来週)?\s*の?\s*([月火水木金土日])曜日?/,
      (m) => {
        const wd = WEEKDAYS.indexOf(m[2]);
        if (m[1]) {
          const monday = addDays(today, -((today.getDay() + 6) % 7));
          const weeks = m[1] === '再来週' ? 2 : 1;
          return { date: addDays(monday, weeks * 7 + ((wd + 6) % 7)) };
        }
        return { date: addDays(today, (wd - today.getDay() + 7) % 7), soft: true };
      },
    ],
    [/再来週/, () => ({ date: addDays(today, 14 - ((today.getDay() + 6) % 7)) })],
    [/来週/, () => ({ date: addDays(today, 7 - ((today.getDay() + 6) % 7)) })],
    [/(?<!\d)(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/, (m) => monthDay(today, Number(m[1]), Number(m[2]))],
    [/(\d{1,2})\s*月\s*(\d{1,2})\s*日/, (m) => monthDay(today, Number(m[1]), Number(m[2]))],
    [
      /(?<![\d月/])(\d{1,2})\s*日(?![間中])/,
      (m) => {
        const d = Number(m[1]);
        let date = new Date(today.getFullYear(), today.getMonth(), d);
        if (date < today) date = new Date(today.getFullYear(), today.getMonth() + 1, d);
        return d >= 1 && d <= 31 ? { date } : null;
      },
    ],
  ];
  for (const [re, fn] of tries) {
    const m = work.match(re);
    if (!m) continue;
    const r = fn(m);
    if (r) return { ...r, work: blank(work, m) };
  }
  return { date: null, work };
}

function monthDay(today, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let date = new Date(today.getFullYear(), month - 1, day);
  // 1か月以上前の日付は来年のこと
  if (date < addDays(today, -31)) date = new Date(today.getFullYear() + 1, month - 1, day);
  return { date };
}

function parseTime(work) {
  const m = work.match(TIME_RE);
  if (!m) return { time: null, work };
  let h = Number(m[2]);
  const min = m[4] ? 30 : m[3] ? Number(m[3]) : 0;
  const ampm = m[1];
  if ((ampm === '午後' || ampm === 'pm') && h < 12) h += 12;
  else if (!ampm && h >= 1 && h <= 6) h += 12; // 「3時」は15時のこと
  if (h > 23 || min > 59) return { time: null, work };
  return { time: `${pad(h)}:${pad(min)}`, work: blank(work, m) };
}

// 時間割のどの「科目 クラス」を指しているか
function matchEntries(work, settings) {
  const cm = work.match(CLASS_RE);
  const cls = cm ? `${cm[1]}-${cm[2]}` : null;
  const scored = allEntries(settings).map((e) => {
    if (cls && e.cls !== cls) return { title: e.title, score: 0 };
    let score = cls ? 3 : 0;
    let best = 0;
    for (const { key, weight } of e.keys) if (weight > best && hasWord(work, key)) best = weight;
    score += best;
    return { title: e.title, score };
  });
  const top = Math.max(0, ...scored.map((s) => s.score));
  return top > 0 ? scored.filter((s) => s.score === top).map((s) => s.title) : [];
}

function slotPredicate(query) {
  return (slot) => {
    if (query.st) return query.st === 'any' ? slot.key === 'asa' || slot.key === 'kaeri' : slot.key === query.st;
    if (query.period && slot.key !== `p${query.period}`) return false;
    if (query.titles) return query.titles.includes(slot.title);
    return Boolean(query.period);
  };
}

// query に合うコマを探す。date があればその日から、なければ今から。
function resolveSlot(query, settings, from, date) {
  const pred = slotPredicate(query);
  if (date) {
    const dayStart = startOfDay(date);
    const start = dayStart > from ? dayStart : from;
    const sameDay = findNextSlot(start, settings, pred, { includeStarted: start === dayStart, sameDayOnly: true });
    if (sameDay) return sameDay;
    return findNextSlot(addDays(dayStart, 1), settings, pred, { includeStarted: true });
  }
  return findNextSlot(from, settings, pred);
}

/**
 * 一言の入力を、どこに入れるか判断する。
 * 戻り値の target: { kind: 'slot', date, slot } | { kind: 'event', date, at } | { kind: 'memo', date }
 */
function parse(text, now, settings) {
  let work = ` ${normalize(text)} `;
  let period = null;
  const pm = work.match(PERIOD_RE);
  if (pm) {
    period = Number(pm[1]);
    work = blank(work, pm);
  }
  const d = parseDate(work, now);
  work = d.work;
  let st = null;
  for (const [re, kind] of [
    [KAERI_RE, 'kaeri'],
    [ASA_RE, 'asa'],
    [BARE_ST_RE, 'any'],
  ]) {
    const m = work.match(re);
    if (m) {
      st = kind;
      work = blank(work, m);
      break;
    }
  }
  const titles = st ? [] : matchEntries(work, settings);
  // クラス名は時刻の数字とまぎれないよう、時刻を探す前に消す
  const cm = work.match(CLASS_RE);
  if (cm) work = blank(work, cm);
  const t = parseTime(work);

  // 時刻が書いてあれば予定として扱う（「金曜 15時 学年会」）。
  // ただしクラス名・限・STが書いてあればそちらを優先（「3-4 15時までに提出」）。
  let query = null;
  if (st) query = { st };
  else if (titles.length && (cm || period || !t.time)) query = { titles, period };
  else if (period) query = { period };

  if (query) {
    let found = resolveSlot(query, settings, now, d.date);
    if (!found && query.titles && query.period) {
      query = { titles: query.titles };
      found = resolveSlot(query, settings, now, d.date);
    }
    if (found) {
      return { target: { kind: 'slot', date: dateKey(found.day), slot: found.slot.key }, query };
    }
  }

  if (t.time) {
    let date = d.date || startOfDay(now);
    const [h, m] = t.time.split(':').map(Number);
    const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
    if (at <= now) {
      if (!d.date) date = addDays(date, 1);
      else if (d.soft) date = addDays(date, 7);
    }
    return { target: { kind: 'event', date: dateKey(date), at: t.time }, query: null };
  }

  let memoDate = d.date || startOfDay(now);
  return { target: { kind: 'memo', date: dateKey(memoDate) }, query: null };
}

// 「もう1つ先」のコマ
function nextAfter(query, settings, after) {
  if (!query) return null;
  const found = findNextSlot(new Date(after.getTime() + 60000), settings, slotPredicate(query));
  return found ? { kind: 'slot', date: dateKey(found.day), slot: found.slot.key } : null;
}

// 次の帰りST（今日の帰りSTが終わっていたら次の授業日）
function nextKaeri(settings, now) {
  const found = findNextSlot(now, settings, (s) => s.key === 'kaeri');
  return found ? { kind: 'slot', date: dateKey(found.day), slot: 'kaeri' } : null;
}

module.exports = { parse, nextAfter, nextKaeri, resolveSlot, hasWord, isSchoolDay };
