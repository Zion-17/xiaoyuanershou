# 会话合并 + 管理员功能对齐 实施方案（2026-11-03）

> 决策已全部确认。本文档记录**为什么这么定**，实现时按此执行。

## 一、目标

1. **管理员账号 = 普通用户功能 + 额外管理面板**。管理员收发消息、看头像必须与普通用户完全一致。
2. **会话按对手方唯一**。同一卖家不同商品点「聊一聊」进入同一个窗口，历史连续。

## 二、竞品结论（汇报可引用）

| 产品 | 会话主键 | 来源 |
|---|---|---|
| 淘宝旺旺 | 店铺（同店铺不同商品共用一个会话） | 用户社区 |
| Telegram | peer（用户本身） | 官方库文档 |
| Discord | `POST /users/@me/channels {recipient_id}` 幂等返回同一 DM | 官方文档 |
| Slack | `conversations.open` 按成员组幂等 | 官方文档 |
| Matrix | `m.direct`：user id → room ids | 官方规范 |
| Etsy | 官方公告把同一买家的消息合并为一个 thread | 官方公告 |
| **闲鱼** | **（商品 + 对手方）**，`xy.openChat` 必传 `memberName` + `itemId` | 官方开放平台 |

**关键判断：闲鱼不是"按对手方合并"的案例，恰恰是会话碎片化的反面教材。** 参考对象应为淘宝旺旺 + Telegram/Discord/Slack 的 DM 模型。

**反模式证据**：Airbnb 房东公开要求 "chat per guest, not per booking"；Fiverr 全量合并后被卖家抱怨分不清消息属于哪个订单 —— **合并不等于取消上下文**，商品上下文必须留在会话内。

## 三、根因（静态证据）

用户假设"管理员被特殊对待"。代码不支持：`cloudfunctions/api/actions/chat.js` 全文无 `admin`/`isAdmin` 分支，`lib.js:100` `memberChat` 也无旁路。

真实可疑点：

1. `chat.js:61` 查对方资料只写 `{ openid }`，而 `lib.js:42` 的 `me()` 有 `_openid` 兜底 → 老用户文档查不到 → `chat.js:76` 回退成字面量 `'卖家'`、`chat.js:78` 头像空。
2. `chat.js:25` 会话查询键含 `goodId` → 同一对用户每商品一条会话。
3. handoff §1.5：`admin.migrateV1` 从未执行，`users` 存在重复文档。

**结论**：「有个叫『卖家』的框 + 一个真名的框」= 同一个人的两条会话，其中一条命中不了用户文档。不需要任何管理员特权即可解释。

## 四、已确认决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | 会话主键改为 `unique(openidA, openidB)` | 唯一能让"同卖家同窗口"成立的数据模型 |
| D2 | 商品降级为会话内上下文 | 避免 Fiverr 式"分不清是哪个商品" |
| D3 | 存量数据迁移，**不删任何聊天记录** | messages 一条不改内容，只改 `chatId` 指针；旧 chats 加 `mergedInto` 软合并，可回滚 |
| D4 | 商品上下文 = 顶部横条 + 时间线分隔条（A+） | `messages.goodId` 已存在（`chat.js:114`），只是没返回；零 schema 变更 |
| D5 | `currentGoodId` 谁点谁改 | 只有买家能从商品页发起（`chat.js:23` 挡住自聊），语义干净 |
| D6 | 新会话用确定性 `_id = openidA + '_' + openidB` | 结构上不可能重复；回调风险：若 `_id` 长度受限则退化为 `md5(a+b).slice(0,32)` |
| D7 | 保留 `admin.messages` 全站审计能力 | 汇报加分项；但必须与管理员个人会话列表完全隔离 |
| D8 | 头像验收标准 = 修好数据 + `onShow` 刷新 | 不做 users 实时 watch（成本高、汇报前风险大） |
| D9 | 本次不做未读红点 | 属于新功能，不是 bug 修复 |
| D10 | `chat.info` 跟随 `mergedInto` 跳正本 | 3 行代码换掉"迁移瞬间界面空白"的事故 |
| D11 | 兜底名 `'卖家'` 改为 `'对方用户'` | 会话双方都可能是买家，"卖家"语义本身错 |

## 五、执行顺序（硬约束）

```
阶段0 诊断 ──► [拿到结果] ──► 修管理员根因 ──► 阶段2 chat.js ──► 部署
   │                                              │
   └──► 阶段1 migrateV2 编码（不执行）─────────────┴──► 诊断后执行迁移
```

**阶段 2 的 chat.js 改动在阶段 0 结果到手前不得部署**，否则故障现象被改掉，无法归因。

## 六、改动清单

### 阶段 0（已完成编码）

- `cloudfunctions/api/actions/auth.js` 新增 `diag`（自作用域只读自检，不需要管理员权限）+ `ts`、`ADMIN_SID` 导入
- `cloudfunctions/api/index.js` 注册 `'auth.diag'`
- `services/user.js` 新增 `diag()`
- `pages/account/account.{js,wxml}` 新增「系统自检（临时诊断）」入口，结果复制到剪贴板

> 全部带 `TODO(临时诊断)` 标记，定位完成后整段删除。

### 阶段 1（待编码，不执行）

- `cloudfunctions/api/actions/admin.js` 新增 `migrateV2`：按 `(openidA,openidB)` 分组 → 正本 `_id = a + '_' + b` → 其余会话 messages 批量重指 → 旧文档写 `mergedInto` → 回填 `currentGoodId`
- `cloudfunctions/api/index.js` 注册 `'admin.migrateV2'`

### 阶段 2（诊断后编码）

| 位置 | 改动 |
|---|---|
| `chat.js:19-32` `ensureChat` | 确定性 `_id` 查/建；已存在则更新 `currentGoodId` |
| `chat.js:41-47` `info` | 跟随 `mergedInto`；返回 `currentGood`（标题/价格/封面） |
| `chat.js:49-83` `list` | `_openid` 兜底、过滤 `mergedInto`、`with` 兜底改 `'对方用户'`、返回 `currentGoodId` |
| `chat.js:85-97` `messages` | 返回 `goodId` + 一次 `in` 查询返回 `goods:{id→title}` 映射 |
| `chat.js:111-124` `send` | `goodId: chat.currentGoodId` |
| `pages/chat/chat.{js,wxml}` | 顶部"当前咨询"横条；时间线 `goodId` 变化处插入分隔条 |
| `pages/message/message.wxml:16` | `关于：{currentGood 标题}` |

## 七、风险

| 风险 | 缓解 |
|---|---|
| 确定性 `_id` 长度（约 57 字符）可能受限 | 编码时先做真实写入验证；不行退化 md5 |
| `migrateV2` 中途失败 → 半合并 | 幂等、每步可重跑；旧文档全程保留可回滚 |
| 会话列表响应体积（base64 头像） | 列表只返回 96px 缩略，不加新字段 |
| chat.js 5 个函数一次改 | 跑 `check-bindings` / `check-refs` / `smoke` |

## 八、验收清单

1. 小帅在商品甲「聊一聊」→ 发消息 → 同一卖家商品乙「聊一聊」→ 同一窗口，历史在，横条甲变乙
2. 消息页对该卖家只有一条会话，行显示 `关于：乙`
3. 卖家侧一条会话，横条显示乙，时间线有商品切换分隔条
4. 对方换头像 → 重进消息页头像已更新
5. 管理员：收发正常、看到对方头像、消息页只有自己的会话
6. 管理员控制台：入口在、全站审计在、与个人会话不混
7. 迁移后消息总数 = 迁移前总数（`auth.diag` 对比）
