const { call } = require('../utils/api');

module.exports = {
  list: () => call('favorite.list'),
  ids: () => call('favorite.ids'),
  toggle: goodId => call('favorite.toggle', { goodId })
};
