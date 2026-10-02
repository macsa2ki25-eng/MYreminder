'use strict';

// 全角/半角・記号のゆれをそろえる。Ⅲ→iii、①→1、３－４→3-4 など。
function normalize(s) {
  return String(s)
    .normalize('NFKC')
    .replace(/(\d)\s*[ー‐‑‒–—―−]\s*(?=\d)/g, '$1-')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

// '論表iii' → { base: '論表', num: 3 }
function splitNumeral(token) {
  const m = token.match(/^(.*?[^ivx\d])((?:i{1,3}|iv|vi?)|\d)$/);
  if (!m) return { base: token, num: null };
  const tail = m[2];
  const num = /\d/.test(tail) ? Number(tail) : ROMAN[tail];
  return { base: m[1], num };
}

module.exports = { normalize, splitNumeral };
