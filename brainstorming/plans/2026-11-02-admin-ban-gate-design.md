# 校园闲转 · 封禁闸门与登录拦截设计

- 日期：2026-11-02
- 状态：用户已批准（"批准，开始实现"）
- 背景：第二轮需求五项——成员管理重复账号、封禁联动下架/禁言、客服电话、真封禁（全局闸门）、未登录功能拦截。

## 已确认的决策

| 决策点 | 用户选择 |
|---|---|
| 封禁后界面 | 强制登出 + 弹窗（含客服电话 00000000000，可拨打） |
| 未登录拦截 | 弹窗 + 一键跳登录；未登录可看首页/分类缩览 |
| 重复账号 | 仅显示层去重（同学号留最新档案），云端历史数据不动 |
| 解封后商品 | 自动恢复上架 |
| 客服电话 | 管理员客服 00000000000，弹窗可一键拨打 |

## "假封禁"根因

1. 封禁只拦了登录入口，**本地已缓存的登录态没有任何闸门**：被封前登录过的设备打开小程序直接进首页，所有功能照常。
2. 封禁没有联动：商品仍在售、仍可发布、仍可聊天。

## 设计

### A. 全局封禁闸门
- `app.js` 的 `onLaunch` + `onShow`（每次回前台）执行 `_banGate()`：本地有登录态时实时查 `bans` 集合；命中则清除本地登录态、弹窗告知封禁与客服电话（确认键直接拨号）、并退回首页 tab。
- 并发保护：`_gatePending` 标志防止重复弹窗。
- 查询失败（网络抖动/集合缺失）时不清登录态，避免误伤。

### B. 封禁联动（cloud.js）
- `banUser(sid, name)`：写入 bans 后，把该学号所有 `status:'on'` 的商品逐条写入 `violations`（带 `banSid` 标记）→ 全员不可见。
- `unbanUser(sid)`：删除 bans 记录 + 删除该 `banSid` 的全部 violations → 商品自动恢复。
- 新增 `isBannedByName(name)`：按昵称查 users 得 sid 再查 bans，供私聊拦截使用。
- 禁言三处拦截：`detail.js goChat`、`message.js openChat`、`chat.js send`（发送前实时校验，对方被封弹窗"该用户已被封禁，无法发送消息"）。
- 禁发布：`publish.js submit` 已有 isBanned 校验（保留），另加页面级登录拦截兜底。

### C. 成员管理去重（cloud.js adminGetUsers）
- 按 sid 用 Map 合并，保留 `updateTime` 最新的一条档案；`banned` 标志按 bans 名单统一判定。仅显示层去重，不删云端数据。

### D. 客服联系方式（profile.js）
- `onContact` 弹窗内容改为"客服电话：00000000000"，确认键 `wx.makePhoneCall` 直接拨打。
- 封禁弹窗同样携带该电话。

### E. 未登录拦截
- 拦截范围：商品详情（onLoad）、发布（onShow）、消息（onShow）、聊天（onLoad）、订单/我的发布/收藏/评价（onShow）。
- 未拦截（可浏览）：首页、分类、搜索。
- 交互：`wx.showModal`"请先登录后使用该功能"，确认→登录页；取消→二级页 navigateBack、tab 页 switchTab 回首页。
- tabBar 页微信不允许阻止切换，只能进入后弹拦截，属平台限制。

## 影响文件

utils/cloud.js、app.js、pages/profile/profile.js、pages/admin/admin.js、pages/detail/detail.js、pages/chat/chat.js、pages/message/message.js、pages/publish/publish.js、pages/order/order.js、pages/mygoods/mygoods.js、pages/favorite/favorite.js、pages/evaluate/evaluate.js

## 验证

- node 语法校验全部 JS
- 纯函数冒烟：去重合并逻辑、isBannedByName 参数形态
- 真机双账号回归：封禁→登出弹窗→商品消失→解封恢复；未登录逐页拦截

---

内容由 AI 生成
