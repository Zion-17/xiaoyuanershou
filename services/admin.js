const { call } = require('../utils/api');

module.exports = {
  stats: () => call('admin.stats'),
  users: () => call('admin.users'),
  goods: () => call('admin.goods'),
  messages: () => call('admin.messages'),
  ban: (sid, name) => call('admin.ban', { sid, name }),
  unban: sid => call('admin.unban', { sid }),
  hideGood: (id, title) => call('admin.hideGood', { id, title }),
  restoreGood: id => call('admin.restoreGood', { id }),
  seed: () => call('admin.seed'),
  migrateV1: () => call('admin.migrateV1'),
  migrateV2: payload => call('admin.migrateV2', payload || {})
};
