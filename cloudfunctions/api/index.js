// 统一服务端入口：{ action, payload } → { ok, data } / { ok:false, code, message }
const cloud = require('wx-server-sdk');
const auth = require('./actions/auth');
const goods = require('./actions/goods');
const chat = require('./actions/chat');
const favorite = require('./actions/favorite');
const order = require('./actions/order');
const admin = require('./actions/admin');

const routes = {
  'auth.login': auth.login,
  'auth.profile': auth.profile,
  'auth.autoLogin': auth.autoLogin,
  'auth.updateProfile': auth.updateProfile,
  'auth.deactivate': auth.deactivate,

  'goods.list': goods.list,
  'goods.detail': goods.detail,
  'goods.mine': goods.mine,
  'goods.create': goods.create,
  'goods.setStatus': goods.setStatus,
  'goods.updatePrice': goods.updatePrice,
  'goods.remove': goods.remove,

  'chat.open': chat.open,
  'chat.info': chat.info,
  'chat.list': chat.list,
  'chat.messages': chat.messages,
  'chat.send': chat.send,
  'chat.markRead': chat.markRead,
  'chat.otherReadTime': chat.otherReadTime,

  'favorite.toggle': favorite.toggle,
  'favorite.list': favorite.list,
  'favorite.ids': favorite.ids,

  'order.create': order.create,
  'order.list': order.list,
  'order.get': order.get,
  'order.update': order.update,
  'order.evaluate': order.evaluate,

  'admin.stats': admin.stats,
  'admin.users': admin.users,
  'admin.goods': admin.goods,
  'admin.messages': admin.messages,
  'admin.ban': admin.ban,
  'admin.unban': admin.unban,
  'admin.hideGood': admin.hideGood,
  'admin.restoreGood': admin.restoreGood,
  'admin.seed': admin.seed,
  'admin.migrateV1': admin.migrateV1,
  'admin.migrateV2': admin.migrateV2
};

exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  const action = event && event.action;
  const handler = routes[action];
  if (!handler) {
    return { ok: false, code: 'BAD_ACTION', message: '不支持的操作：' + action };
  }
  try {
    const data = await handler((event && event.payload) || {}, { openid: OPENID });
    return { ok: true, data };
  } catch (e) {
    console.error('[api]', action, e && (e.stack || e.message || e));
    return {
      ok: false,
      code: (e && e.code) || 'INTERNAL',
      message: (e && e.code) ? e.message : '服务异常，请稍后重试'
    };
  }
};
