// 时间展示：入参统一为毫秒时间戳
const pad = n => String(n).padStart(2, '0');
const hm = t => `${pad(t.getHours())}:${pad(t.getMinutes())}`;
const dayStart = t => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();

const toDate = v => {
  // null / '' / 0 都会被 new Date() 当成 1970，必须先挡掉
  if (v === null || v === undefined || v === '' || v === 0) return null;
  const t = v instanceof Date ? v : new Date(v);
  return isNaN(t.getTime()) ? null : t;
};

// 聊天分隔条：今天 HH:mm / 昨天 HH:mm / 今年 M月D日 HH:mm / 跨年 完整日期
function fmtChat(v) {
  const t = toDate(v);
  if (!t) return '';
  const now = new Date();
  const diff = Math.round((dayStart(now) - dayStart(t)) / 86400000);
  if (diff === 0) return hm(t);
  if (diff === 1) return '昨天 ' + hm(t);
  if (t.getFullYear() === now.getFullYear()) return `${t.getMonth() + 1}月${t.getDate()}日 ${hm(t)}`;
  return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日 ${hm(t)}`;
}

// 会话列表：今天 HH:mm / 今年 M月D日 / 跨年 完整日期
function fmtList(v) {
  const t = toDate(v);
  if (!t) return '';
  const now = new Date();
  if (dayStart(now) === dayStart(t)) return hm(t);
  if (t.getFullYear() === now.getFullYear()) return `${t.getMonth() + 1}月${t.getDate()}日`;
  return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日`;
}

// 商品/订单：M-D HH:mm
function fmtDT(v) {
  const t = toDate(v);
  return t ? `${t.getMonth() + 1}-${t.getDate()} ${hm(t)}` : '';
}

module.exports = { fmtChat, fmtList, fmtDT };
