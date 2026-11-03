// 头像既可能是 emoji（如 🧑‍🎓），也可能是云存储 fileID 或 https 链接
const IMAGE_PREFIX = ['cloud://', 'http://', 'https://', 'wxfile://', 'data:image/'];

const isImageAvatar = v => {
  const s = String(v || '');
  return IMAGE_PREFIX.some(p => s.startsWith(p));
};

// 统一出 { image, emoji }：二者只有一个有值，模板据此二选一
function avatarOf(v, fallback = '🧑‍🎓') {
  const s = String(v || '');
  if (!s) return { image: '', emoji: fallback };
  // 云存储 fileID 在免费版是"仅创建者可读"，别的用户拿到的是加载不出来的空图，
  // 与其显示空白，不如回退成默认 emoji
  if (s.startsWith('cloud://')) return { image: '', emoji: fallback };
  return isImageAvatar(s) ? { image: s, emoji: '' } : { image: '', emoji: s };
}

module.exports = { avatarOf, isImageAvatar };
