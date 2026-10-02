'use strict';

// 日本の祝日（2020年以降のルール）。振替休日・国民の休日も含む。

function nthMonday(year, month, n) {
  const first = new Date(year, month - 1, 1).getDay();
  const offset = (8 - first) % 7; // days until first Monday
  return 1 + offset + (n - 1) * 7;
}

function vernalEquinox(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnalEquinox(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function baseHolidayName(d) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m === 1 && day === 1) return '元日';
  if (m === 1 && day === nthMonday(y, 1, 2)) return '成人の日';
  if (m === 2 && day === 11) return '建国記念の日';
  if (m === 2 && day === 23) return '天皇誕生日';
  if (m === 3 && day === vernalEquinox(y)) return '春分の日';
  if (m === 4 && day === 29) return '昭和の日';
  if (m === 5 && day === 3) return '憲法記念日';
  if (m === 5 && day === 4) return 'みどりの日';
  if (m === 5 && day === 5) return 'こどもの日';
  if (m === 7 && day === nthMonday(y, 7, 3)) return '海の日';
  if (m === 8 && day === 11) return '山の日';
  if (m === 9 && day === nthMonday(y, 9, 3)) return '敬老の日';
  if (m === 9 && day === autumnalEquinox(y)) return '秋分の日';
  if (m === 10 && day === nthMonday(y, 10, 2)) return 'スポーツの日';
  if (m === 11 && day === 3) return '文化の日';
  if (m === 11 && day === 23) return '勤労感謝の日';
  return null;
}

function shift(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function holidayName(d) {
  const base = baseHolidayName(d);
  if (base) return base;
  // 振替休日: 日曜の祝日のあと、最初の祝日でない日
  let p = shift(d, -1);
  while (baseHolidayName(p)) {
    if (p.getDay() === 0) return '振替休日';
    p = shift(p, -1);
  }
  // 国民の休日: 祝日にはさまれた平日
  if (d.getDay() !== 0 && baseHolidayName(shift(d, -1)) && baseHolidayName(shift(d, 1))) {
    return '国民の休日';
  }
  return null;
}

module.exports = { holidayName };
