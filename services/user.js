const { call } = require('../utils/api');

module.exports = {
  login: payload => call('auth.login', payload),
  profile: () => call('auth.profile'),
  autoLogin: () => call('auth.autoLogin'),
  updateProfile: patch => call('auth.updateProfile', patch),
  deactivate: () => call('auth.deactivate')
};
