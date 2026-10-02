'use strict';

const crypto = require('crypto');

// スマホへの通知（ntfy）。中身は送らず「リマインドがあります」だけを送る。
async function sendPhone(net, phone, message) {
  const server = String(phone.server || 'https://ntfy.sh').replace(/\/+$/, '');
  const res = await net.fetch(`${server}/${encodeURIComponent(phone.topic)}`, {
    method: 'POST',
    body: message,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Title: 'MYreminder',
      Priority: 'high',
      Tags: 'pushpin',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// 他の人と重ならない、iPhoneで打ちやすいトピック名
function newTopic() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (const b of bytes) s += chars[b % chars.length];
  return `myrem-${s}`;
}

module.exports = { sendPhone, newTopic };
