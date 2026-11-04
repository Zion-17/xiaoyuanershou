// pages/admin/admin.js
const adminSvc = require('../../services/admin');
const guard = require('../../utils/guard');
const { fmtDT } = require('../../utils/format');

Page({
  data: { tab: 'dash', stats: null, users: [], goods: [], msgs: [], forbidden: false },

  onLoad() {
    const u = guard.getUser();
    if (!u || u.role !== 'admin') {
      this.setData({ forbidden: true });
      wx.showToast({ title: '无管理员权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.loadTab();
  },

  setTab(e) {
    this.setData({ tab: e.currentTarget.dataset.t }, () => this.loadTab());
  },

  async loadTab() {
    if (this.data.forbidden) return;
    wx.showLoading({ title: '加载中…' });
    try {
      const tab = this.data.tab;
      if (tab === 'dash') {
        this.setData({ stats: await adminSvc.stats() });
      } else if (tab === 'users') {
        this.setData({ users: await adminSvc.users() });
      } else if (tab === 'goods') {
        const rows = await adminSvc.goods();
        this.setData({ goods: rows.map(g => ({ ...g, time: fmtDT(g.time) })) });
      } else if (tab === 'msgs') {
        const rows = await adminSvc.messages();
        this.setData({ msgs: rows.map(m => ({ ...m, time: fmtDT(m.time) })) });
      }
    } catch (e) {
      guard.showError(e);
    }
    wx.hideLoading();
  },

  toggleBan(e) {
    const { sid, name, banned } = e.currentTarget.dataset;
    wx.showModal({
      title: banned ? '解封成员' : '封禁成员',
      content: banned
        ? `确定解封 ${name}（${sid}）？解封后其商品自动恢复上架。`
        : `确定封禁 ${name}（${sid}）？封禁后该成员无法登录、无法发布与聊天，在售商品自动下架。`,
      success: async r => {
        if (!r.confirm) return;
        try {
          if (banned) await adminSvc.unban(sid);
          else await adminSvc.ban(sid, name);
          wx.showToast({ title: '操作成功', icon: 'success' });
          this.loadTab();
        } catch (err) {
          guard.showError(err);
        }
      }
    });
  },

  migrate() {
    wx.showModal({
      title: '会话合并迁移 V2',
      content: '①修复「学号被当成 openid」的历史脏数据 ②把同一对用户的多条会话合并成一条。不删除任何聊天记录，可重复执行。先跑预演？',
      success: async r => {
        if (!r.confirm) return;
        wx.showLoading({ title: '预演中…' });
        let plan;
        try {
          plan = await adminSvc.migrateV2({ execute: false });
        } catch (e) {
          wx.hideLoading();
          guard.showError(e);
          return;
        }
        wx.hideLoading();

        const goodsN = (plan.goodsFixed || []).length;
        const pairs = plan.pairs || [];
        const msgN = pairs.reduce((s, p) => s + (p.messages || 0), 0);
        const skipN = (plan.skipped || []).length;

        wx.showModal({
          title: '预演结果（未写库）',
          content: `修复商品 ${goodsN} 件\n合并为 ${pairs.length} 条会话\n涉及 ${msgN} 条消息\n跳过 ${skipN} 项\n\n确认执行？`,
          confirmText: '执行',
          success: async r2 => {
            if (!r2.confirm) return;
            wx.showLoading({ title: '迁移中…' });
            try {
              const rep = await adminSvc.migrateV2({ execute: true });
              wx.hideLoading();
              wx.showModal({
                title: '迁移完成',
                content: `修复商品 ${(rep.goodsFixed || []).length} 件\n会话 ${(rep.pairs || []).length} 条\n搬移消息 ${rep.messagesMoved} 条、已读 ${rep.readsMoved} 条\n跳过 ${(rep.skipped || []).length} 项`,
                showCancel: false
              });
              this.loadTab();
            } catch (e) {
              wx.hideLoading();
              guard.showError(e);
            }
          }
        });
      }
    });
  },

  // 按「已完成」订单重算成交数：买卖双方各计一次，绝对赋值所以可重复执行
  recount() {
    wx.showModal({
      title: '重算成交数',
      content: '按已完成订单重新统计每个账号的成交数，买卖双方各计一次。可重复执行。',
      success: async r => {
        if (!r.confirm) return;
        wx.showLoading({ title: '统计中…' });
        try {
          const rep = await adminSvc.recountDeals({ execute: true });
          wx.hideLoading();
          wx.showModal({
            title: '完成',
            content: `已完成订单 ${rep.orders} 条，更新账号 ${(rep.changes || []).length} 个`,
            showCancel: false
          });
          this.loadTab();
        } catch (e) {
          wx.hideLoading();
          guard.showError(e);
        }
      }
    });
  },

  toggleHide(e) {
    const { id, title, blocked } = e.currentTarget.dataset;
    wx.showModal({
      title: blocked ? '恢复商品' : '违规下架',
      content: blocked ? '恢复后商品重新对全员可见。' : '下架后商品对全员不可见，仅管理员可恢复。',
      success: async r => {
        if (!r.confirm) return;
        try {
          if (blocked) await adminSvc.restoreGood(id);
          else await adminSvc.hideGood(id, title);
          wx.showToast({ title: '操作成功', icon: 'success' });
          this.loadTab();
        } catch (err) {
          guard.showError(err);
        }
      }
    });
  }
});
