# 校园闲转 · 安全模型与架构重构方案

- 日期：2026-11-03
- 汇报日期：2026-11-06
- 状态：方案已与用户逐条确认，**尚未执行**
- 前置决策：定位=课程设计+未来可上线；本轮交付=方案；允许新增云函数、改数据库结构、抽组件

## 0. 一句话结论

当前最大风险不是代码冗余，而是**数据库所有集合"所有用户可读写"**：任何用户都能删改全站商品、消息、用户资料，且管理员权限是客户端硬编码、登录只校验学号格式。重构主线是把**写操作与鉴权全部收进云函数，客户端只保留公开读**。

## 1. 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 云函数形态 | 单个 `api` 云函数，按 `action` 路由分发 |
| 登录认证 | 学号白名单 + openid 绑定；名单外不可注册；已绑定学号他人无法登录 |
| 管理员 | `admins` 集合按 openid 判定，云函数二次校验；删除客户端 `ADMIN_SID` |
| 消息实时+隐私 | 消息存 `openidA`/`openidB`，客户端开两条 `watch` 合并；规则限当事人可读 |
| 历史数据 | 写一次性迁移脚本（云函数 action），保留现有聊天记录用于答辩 |
| 商品卡片复用 | 自定义组件 `goods-card`，`mode` 切换 grid/row，slot 放操作区 |
| 数据层拆分 | `cloud.js` → `services/{user,goods,chat,order,favorite,admin}.js` + `utils/api.js` |
| 图片存储 | 云存储 `fileID`，保留现有 canvas 压缩，补 `wx.compressImage` 与直传兜底 |
| 执行顺序 | 安全优先：云函数与权限 → 认证 → 消息模型 → 图片 → 查询/组件/拆分 |

## 2. 目标架构

```
小程序客户端                        云函数 api
─────────────────                   ─────────────
pages/*  ──► services/*.js  ──►  wx.cloud.callFunction({name:'api', data:{action, payload}})
                                     │
                          ┌──────────┴──────────┐
                          │  action 路由表       │
                          │  auth / goods / chat │
                          │  order / fav / admin │
                          └──────────┬──────────┘
                                     │
                          云数据库（权限全收紧，仅云函数可写）
                          云存储（图片）
```

客户端直接读数据库的**唯一场景**：公开商品的浏览与详情（`status: 'on'`）。

## 3. 数据模型

### 3.1 集合与权限

| 集合 | 读 | 写 | 说明 |
|---|---|---|---|
| `goods` | `doc.status == 'on'` | false | 公开浏览；下架/我的发布走云函数 |
| `messages` | `doc.openidA == auth.openid \|\| doc.openidB == auth.openid` | false | 保留 watch 实时 |
| `reads` | 同上 | false | 已读回执 |
| `users` | false | false | 全部走云函数 |
| `favorites` | false | false | 全部走云函数 |
| `orders` | false | false | 全部走云函数 |
| `bans` / `violations` | false | false | 仅管理员操作 |
| `whitelist` / `admins` | false | false | 仅云函数维护 |

> 权限配置在云开发控制台逐个集合设置，方案落地时必须**先改权限再发前端**，否则旧前端全线报错。

### 3.2 字段变更

- `users`：新增 `openid`（云函数写入时显式设置）、`sid` 唯一；`role` 由 `admins` 派生
- `goods`：新增 `sellerOpenid`；`sid` 保留用于展示
- `messages`：`senderName` → 保留展示用；新增 `senderSid`、`senderOpenid`、`openidA`、`openidB`
- `reads`：新增 `openid`、`openidA`、`openidB`
- `favorites`：`sid` → 新增 `openid` 作为主键
- `orders`：新增 `buyerOpenid`、`sellerOpenid`、`buyerSid`、`sellerSid`
- 新增集合 `whitelist`（`sid`、`boundOpenid`、`bindTime`）、`admins`（`openid`、`sid`）

### 3.3 会话 id

`chat_<goodId>_<openidA>_<openidB>`（双方 openid 字典序拼接，由云函数生成，客户端不可拼）

## 4. 云函数 action 清单

| 域 | action | 鉴权 | 作用 |
|---|---|---|---|
| auth | `login` | 无 | 白名单校验 + openid 绑定 + 返回用户档案 |
| auth | `me` | 登录 | 刷新当前用户（含 role、封禁态） |
| goods | `list` | 无 | 分类/关键词/成色/价格/排序 + 分页 |
| goods | `detail` | 无 | 单条商品（含卖家信息） |
| goods | `mine` | 登录 | 我的发布（含已下架） |
| goods | `create` | 登录 | 发布（服务端校验价格、标题、封禁态） |
| goods | `setStatus` / `remove` | 登录 | 上下架 / 删除（校验归属） |
| chat | `list` | 登录 | 我的会话（服务端按 openid 过滤，批量取商品与对方资料，杜绝 N+1） |
| chat | `messages` | 登录 | 会话内消息（校验是当事人） |
| chat | `send` | 登录 | 发送（服务端生成 chatId、写入双方 openid） |
| chat | `markRead` | 登录 | 已读回执 |
| favorite | `list` / `toggle` | 登录 | 收藏 |
| order | `create` / `list` / `update` / `evaluate` | 登录 | 订单（校验买卖双方） |
| admin | `stats` / `users` / `goods` / `messages` | 管理员 | 控制台数据 |
| admin | `ban` / `unban` / `hideGood` / `restoreGood` | 管理员 | 审核操作 |
| admin | `seedWhitelist` / `migrateV1` | 管理员 | 一次性初始化与数据迁移 |

统一返回：`{ ok: true, data }` / `{ ok: false, code, message }`。客户端 `utils/api.js` 负责拆包与错误提示。

## 5. 鉴权实现要点

1. 云函数每次调用取 `cloud.getWXContext().OPENID`，**永远不信任客户端传来的 sid / name / role**。
2. `assertLogin(openid)` → 查 `users`（`openid`）→ 无记录则 `NOT_LOGGED_IN`；有 `bans` 命中则 `BANNED`。
3. `assertAdmin(openid)` → 查 `admins` → 未命中则 `FORBIDDEN`。
4. `login` 流程：白名单命中 → 已绑定且 openid 不同 → `SID_TAKEN`；未绑定则绑定 → upsert `users` → 返回。
5. 封禁写 `bans` + 联动写 `violations`（原逻辑迁入云函数）。

## 6. 消息实时方案（已确认 A 形态）

- 消息写入时由云函数写入 `openidA`、`openidB`（字典序，与 chatId 一致）
- 客户端 `utils/watch.js` 提供 `watchMember(collection, chatId, cb)`：开两条订阅
  - `where({ chatId, openidA: '{openid}' })`
  - `where({ chatId, openidB: '{openid}' })`
  - 按 `_id` 合并去重后回调
- 已读回执同用该 helper
- **退路**：若实测安全规则对 watch 生效异常（预期错误码 `-502003`），立即切轮询方案：`chat.messages` 每 3 秒拉取，答辩口径改为"3 秒内可见"

## 7. 分页与查询下沉

- **硬约束**：小程序端单次查询最多返回 **20 条**（`limit(100)`/`limit(500)` 会被静默截断为 20；云函数端默认 100、显式可到 1000）。现有 `cloud.js` 中的 `limit(100/200/500)` 全部**实际只拿到 20 条**，必须改为分页或迁入云函数
- 列表统一 `skip(page*20) / limit(20)`，页面滚动触底加载
- 关键词：`db.RegExp` 转义后匹配 `title`，与 `desc` 用 `_.or` 组合
- 价格区间：`_.gte/_.lt`；成色：精确匹配；排序：`orderBy('createTime'|'price')`
- `getChats` 的 N+1：先按 openid 取会话 → 一次性批量取涉及的 `goods` 与 `users` 资料 → 内存拼装

## 8. 历史数据迁移脚本（`admin.migrateV1`）

幂等，逐条判断"是否已迁移"，可重复执行：

1. 遍历 `users`，把 `_openid` 回填到 `openid`；建立 `sid → openid` 与 `name → sid` 映射
2. 写入 `whitelist` 四条种子：000000001 / 000000002 / 000000000 / 000000003，`boundOpenid` 取自第 1 步
3. 写入 `admins`：000000000 对应 openid
4. `goods`：补 `sellerOpenid`
5. `messages`：旧 chatId 解析出两个 sid → openid → 新 chatId；补 `senderSid`（`senderName` 查映射，重名取最新档案）、`senderOpenid`、`openidA`、`openidB`
6. `reads`：同步重写 chatId 与 openid 字段
7. `favorites` / `orders`：补 openid 与 sid 字段
8. 输出统计：处理/跳过条数，便于对照

> 执行前：控制台导出 6 个集合的 JSON 备份。

## 9. 代码复用改造

| 冗余 | 处理 |
|---|---|
| 6 份商品卡片 WXML | `components/goods-card`（`mode: grid/row` + `slot="action"`） |
| 4 套登录拦截 | 全部改用 `guard.requireLogin`，删 `detail.ensureLogin`、`profile.ensureLogin`、`publish` 内联 |
| 2 份封禁弹窗 + 2 处客服电话 | `app.js` 改调 `guard.bannedModal`，电话只留 `guard.js` 一处 |
| 5 处封禁校验 | 收敛为 `guard.assertNotBanned`（云端二次校验为准） |
| 3 份头像解析 | `utils/user.js` 的 `readAvatar()` |
| 3 个时间格式化 + 数据层注入展示字段 | `utils/format.js`：`fmtChat/fmtList/fmtDT`，数据层不再产出 `time` 字段 |
| `cloud.js` 352 行 | `services/*` 六个域文件 + `utils/api.js` 统一调用 |

## 10. 顺带修复的缺陷

- `evaluate.js:18`：`order` 为 null 时崩溃
- `chat.js:171`：发送失败仍显示为已发 → 标记失败态 + 可重试
- `search.js:19`：逐键触发云查询 → 300ms 防抖
- `detail.js:16`：数字 id 转换死代码
- `favorite.toggleFavorite` 返回值语义反转（true=已取消）
- `app.js` 每次 `onShow` 都查一次封禁 → 加 60 秒节流
- `README.md` 与实现脱节（local 模式 / `MODE` / `cloudfunctions/getOpenid` / `chats` 集合均不存在）→ 重写

## 11. 执行顺序与时间表

| 时间 | 内容 | 完成判据 |
|---|---|---|
| 11-03 上午 | 云函数骨架 + `utils/api.js` + 控制台备份 + 权限规则定稿（先不改权限） | 一个 `ping` action 跑通 |
| 11-03 下午 | 认证：白名单 + openid 绑定；`migrateV1` 第 1–3 步 | 四个账号登录成功，第五个随意学号被拒 |
| 11-03 晚 | 迁移脚本第 4–8 步 + 消息模型改造 + 双 watch | 历史聊天记录完整可见且只对当事人可见 |
| 11-04 | 写操作全部迁到云函数；**此时才修改集合权限**；管理员改造；查询下沉与分页 | 旧路径全部失效为预期，新路径全绿 |
| 11-04 晚 | 3 个 bug 修复 + 全量回归 | 回归清单全过 |
| 11-05 | P1：图片转云存储 → 抽 `goods-card` → 拆 `services` | 发布/浏览/收藏/订单全链路可用 |
| 11-05 20:00 | **冻结**，只修阻塞答辩的问题 | — |
| 11-06 | 汇报 | — |

**熔断规则**：若 11-04 结束时 P0 仍有未通过项，11-05 放弃全部 P1，只做缺陷修复与回归。

## 12. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 安全规则对 watch 不生效 | 消息实时失效 | 切 3 秒轮询（已确认退路） |
| 权限收紧时机不对 | 全部功能报错 | 权限在"新前端 + 云函数全量就位"后一次性切换；切换前用控制台临时保持旧权限 |
| 迁移脚本写坏真实测试数据 | 答辩素材丢失 | 先导出 JSON 备份；脚本幂等；先在小集合（`favorites`）验证 |
| 3 天时间不足 | P1 未完成 | 已定义熔断规则，P1 全部可延后 |
| 云存储图片处理参数不可用 | 缩略图方案落空 | 退路：发布时额外上传 300px 缩略图 |

## 13. 验收清单（答辩前逐条打勾）

- [ ] 任意非白名单学号无法登录
- [ ] 已绑定学号换一个微信号登录被拒
- [ ] 普通用户调用 `admin.*` 返回 `FORBIDDEN`
- [ ] 普通用户改库请求被安全规则拒绝（控制台验证）
- [ ] 第三人无法读取他人会话消息
- [ ] 双端消息 3 秒内可见
- [ ] 第 101 件商品仍可见（分页生效）
- [ ] 任意机型大图可发布（云存储）
- [ ] 四个账号历史聊天记录完整
- [ ] `users`/`goods`/`orders`/`messages`/`favorites`/`bans` 六个集合权限均已收紧

## 14. 明确不做（写进"已知限制"）

搜索正则性能优化、管理端审计日志、评价体系增强、多图上传、消息撤回、图片 CDN 缩略图参数（若实测不支持）

## 15. 用户反馈的五个问题：定位与处置（P0 追加）

| # | 现象 | 定位 | 处置 |
|---|---|---|---|
| 1 | 管理端成员列表一个账号显示多条 | `users` 集合存在大量同学号重复档案；`adminGetUsers` 的显示层去重（`cloud.js:294-301`）只是补丁，根因是**写入端无唯一约束**（客户端可任意 `add`，并发或不一致即产生重复） | 迁移时按 sid 合并删除多余记录；云函数改为按 sid upsert |
| 2 | 封禁后商品仍在售、本人仍能发消息、他人仍能发给他 | **确定性 bug**：三处禁聊校验的都是"对方"（`chat.js:161` 查 `sellerName`、`message.js:19` 查 `chat.with`、`detail.js:63` 查卖家），**从未校验发送者本人**，所以被封的人自己发消息永远放行。商品侧另需核实 `goods.sid` 与 `bans.sid` 类型/取值是否一致 | 服务端在 `chat.send` 校验发送者封禁态；商品可见性由服务端过滤；发送失败必须报错而非静默 |
| 3 | 客服入口应统一为电话 YOUR_PHONE | `profile.js:28` 仍是"客服微信 campus-help"，与 11-02 批准稿冲突；电话散落 `app.js:63`、`guard.js:5` | 抽出 `utils/config.js` 单一定义，三处引用；删除微信客服话术 |
| 4 | 被封禁账号仍能登录（假封禁） | 无"发送者封禁"校验路径 + `catch` 兜底成"未封禁"（`cloud.js:56`、`92`）+ 客户端 20 条截断，三者叠加 | 登录与每次写操作均走云函数强制校验；写操作 fail-closed |
| 5 | 未登录可使用部分功能 | `mygoods`/`favorite`/`order`/`evaluate` 四页**无任何拦截**；`publish` 只在提交时拦 | 统一走 `guard.requireLogin`；详情页不拦（只拦收藏/聊天/下单三个动作） |

### 已在本轮确认的边界
- **封禁态**：只能浏览首页/分类/搜索，可联系客服（拨号），其余全部拒绝
- **未登录态**：可浏览首页/分类/搜索/商品详情，收藏·聊天·下单·发布·我的各页全部弹登录
- **解封**：删除 `bans` 记录 + 删除该学号 `banSid` 的 `violations`，商品自动恢复上架
- **失败语义**：写操作 fail-closed（鉴权/封禁查询失败即拒绝），读操作 fail-open（保持可浏览）

## 16. 实施记录（2026-11-03）

### 已完成（代码层面）

- `cloudfunctions/api/`：`index.js`（action 路由）+ `lib.js`（鉴权/查询/错误）+ `config.js` + `actions/{auth,goods,chat,favorite,order,admin}.js`，共 30 个 action
- `utils/`：`api.js`（唯一调用入口）、`guard.js`（登录/封禁/错误统一）、`watch.js`（双 openid 订阅）、`format.js`、`view.js`、`config.js`
- `services/`：user / goods / chat / favorite / order / admin 六个领域薄层
- 全部 14 个页面改为经 services 调用，删除页面内直接读写数据库
- 消息模型改为 openid 维度（`chats` 集合 + `messages.openidA/openidB`），发送方封禁校验在服务端
- 图片改为云存储 fileID（canvas 压缩保留，失败回退原图直传）
- 支持 `admin.migrateV1` 一次性迁移（幂等）与 `admin.seed` 白名单补种，含 admins 为空时的管理员自举
- 修复：`evaluate` 空指针、消息发送失败无反馈、搜索逐键请求、客服电话三处不一致、`limit(100)` 假分页

### 未完成（需在微信开发者工具 / 控制台操作）

- 部署云函数、创建新增集合（`chats`/`whitelist`/`admins`）、设置安全规则
- 执行 `admin.migrateV1`
- P1 未做：`goods-card` 组件抽取（会同时改动 6 个页面 UI，与"不改 UI、保证能跑"冲突，按熔断规则推迟）

### 静态校验结果

- 全部 JS `node --check` 通过
- WXML 事件绑定与页面方法逐一比对通过（`scripts/check-bindings.js`）
- 相对 require 与 app.json 页面四件套齐备（`scripts/check-refs.js`）
- 所有 JSON 可解析
