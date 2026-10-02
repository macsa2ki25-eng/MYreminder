'use strict';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function pad(n) {
  return String(n).padStart(2, '0');
}

// 'YYYY-MM-DD' in local time
function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return r;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 'HH:MM' on the given day
function atTime(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
}

function hhmm(d) {
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

// '10/5(月)'
function dateLabel(d) {
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

function addMinutes(d, n) {
  return new Date(d.getTime() + n * 60000);
}

module.exports = {
  WEEKDAYS,
  pad,
  dateKey,
  fromDateKey,
  addDays,
  addMinutes,
  startOfDay,
  atTime,
  hhmm,
  dateLabel,
};
