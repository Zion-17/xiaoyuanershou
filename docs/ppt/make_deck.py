# -*- coding: utf-8 -*-
"""生成课程设计答辩 PPT（16 页，统一深色主题）。

用法：python docs/ppt/make_deck.py
截图放到 docs/ppt/img/ 下，文件名见 SHOTS；缺失时自动画占位框。
"""
import os
import re
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.oxml.ns import qn

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, 'img')
OUT = os.path.join(HERE, '答辩PPT.pptx')

# ---- 统一深色主题 ----
PAGE = RGBColor(0x0F, 0x13, 0x19)      # 页面底色
SURF = RGBColor(0x17, 0x1D, 0x25)      # 卡片 / 面板
SURF2 = RGBColor(0x20, 0x27, 0x31)     # 更亮一层的块
RULE = RGBColor(0x2A, 0x32, 0x3D)      # 分割线
INK = RGBColor(0xE8, 0xEC, 0xF1)       # 主文字
BODY = RGBColor(0xB9, 0xC2, 0xCE)      # 正文
MUTED = RGBColor(0x8B, 0x95, 0xA3)     # 次要
FAINT = RGBColor(0x5A, 0x64, 0x72)     # 更弱
GREEN = RGBColor(0x35, 0xD6, 0x9C)     # 强调绿
ORANGE = RGBColor(0xFF, 0x8A, 0x5B)    # 强调橙
GHOST = RGBColor(0x1B, 0x22, 0x2C)     # 幽灵数字

CODE_BG = RGBColor(0x0A, 0x0D, 0x12)
CODE_BAR = RGBColor(0x15, 0x1B, 0x23)
CODE_TXT = RGBColor(0xD5, 0xDD, 0xE7)
CODE_STR = RGBColor(0xFF, 0xB2, 0x7A)
CODE_CMT = RGBColor(0x63, 0x70, 0x80)
CODE_NUM = RGBColor(0x43, 0x4C, 0x59)

FONT = '微软雅黑'
MONO = 'Consolas'

SHOTS = {
    '01-message.png': '消息列表（合并后）',
    '02-chat.png': '聊天页（商品条 + 购买）',
    '03-timeline.png': '时间线分隔条',
    '04-detail.png': '商品详情页',
    '05-admin.png': '管理员控制台',
    '06-index.png': '首页商品列表',
}


def _ea(run, name):
    rPr = run._r.get_or_add_rPr()
    node = rPr.find(qn('a:ea'))
    if node is None:
        node = rPr.makeelement(qn('a:ea'), {'typeface': name})
        rPr.append(node)
    else:
        node.set('typeface', name)


def tb(slide, x, y, w, h, text, size=16, color=INK, bold=False, font=FONT,
       align=PP_ALIGN.LEFT, line=1.45, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    for i, ln in enumerate(str(text).split('\n')):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line
        r = p.add_run()
        r.text = ln
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = font
        _ea(r, font)
    return box


def rect(slide, x, y, w, h, fill=None, line=None, lw=1.2,
         shape=MSO_SHAPE.RECTANGLE, dash=None):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    s.shadow.inherit = False
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(lw)
        if dash:
            s.line.dash_style = dash
    return s


def dots(slide, x, y, cols, rows, gap, color, d=0.035):
    for i in range(cols):
        for j in range(rows):
            rect(slide, x + i * gap, y + j * gap, d, d, fill=color, shape=MSO_SHAPE.OVAL)


def new_slide(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    rect(s, 0, 0, 13.334, 7.5, fill=PAGE)
    return s


def base(prs, kicker, title, page):
    s = new_slide(prs)
    dots(s, 11.6, 0.5, 9, 3, 0.165, GHOST, d=0.03)
    rect(s, 0.9, 0.62, 0.26, 0.035, fill=GREEN)
    tb(s, 1.3, 0.54, 8, 0.3, kicker, size=10.5, color=MUTED)
    tb(s, 0.9, 0.92, 10.6, 0.72, title, size=27, bold=True, color=INK)
    rect(s, 0.9, 1.8, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 7.04, 6, 0.24, '校园闲转 · 课程设计', size=9, color=FAINT)
    tb(s, 11.83, 7.04, 0.6, 0.24, str(page), size=9, color=FAINT, align=PP_ALIGN.RIGHT)
    return s


def section(prs, num, title, sub, keywords, page):
    s = new_slide(prs)
    dots(s, 0.55, 0.55, 14, 4, 0.2, GHOST, d=0.03)
    # 巨号数字放右上，避开所有文字
    tb(s, 7.9, 3.55, 5.2, 3.2, num, size=200, bold=True, color=GHOST, font=MONO)
    rect(s, 1.0, 2.55, 0.5, 0.04, fill=GREEN)
    tb(s, 1.0, 2.78, 6.6, 0.9, title, size=38, bold=True, color=INK)
    tb(s, 1.0, 3.74, 6.4, 0.5, sub, size=14.5, color=MUTED)
    x = 1.0
    for k in keywords:
        w = 0.36 + len(k) * 0.155
        rect(s, x, 4.5, w, 0.42, fill=None, line=RULE, lw=1)
        tb(s, x, 4.59, w, 0.26, k, size=11, color=MUTED, align=PP_ALIGN.CENTER)
        x += w + 0.15
    tb(s, 11.83, 7.04, 0.6, 0.24, str(page), size=9, color=FAINT, align=PP_ALIGN.RIGHT)
    return s


def token_runs(line):
    out = []
    code, comment = line, ''
    idx = line.find('//')
    if idx >= 0:
        head = line[:idx]
        if head.count("'") % 2 == 0 and head.count('"') % 2 == 0:
            code, comment = head, line[idx:]
    for part in re.split(r"(\"[^\"]*\"|'[^']*')", code):
        if not part:
            continue
        out.append((part, CODE_STR if part[:1] in '"\'' else CODE_TXT))
    if comment:
        out.append((comment, CODE_CMT))
    return out


def code_window(slide, x, y, w, lines, name, size=11.5, lh=0.30):
    h = 0.42 + lh * len(lines) + 0.24
    rect(slide, x, y, w, h, fill=CODE_BG, line=RULE, lw=1)
    rect(slide, x, y, w, 0.42, fill=CODE_BAR)
    for i, c in enumerate([RGBColor(0xFF, 0x5F, 0x57), RGBColor(0xFE, 0xBC, 0x2E),
                           RGBColor(0x28, 0xC8, 0x40)]):
        rect(slide, x + 0.22 + i * 0.22, y + 0.17, 0.085, 0.085, fill=c, shape=MSO_SHAPE.OVAL)
    tb(slide, x + 0.95, y + 0.11, w - 1.2, 0.24, name, size=9.5, color=MUTED, font=MONO)
    for i, ln in enumerate(lines):
        yy = y + 0.60 + i * lh
        tb(slide, x + 0.22, yy, 0.34, lh, str(i + 1), size=size, color=CODE_NUM,
           font=MONO, align=PP_ALIGN.RIGHT)
        box = slide.shapes.add_textbox(Inches(x + 0.72), Inches(yy - 0.02),
                                       Inches(w - 1.0), Inches(lh + 0.1))
        tf = box.text_frame
        tf.word_wrap = False
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.line_spacing = 1.2
        for text, color in token_runs(ln):
            r = p.add_run()
            r.text = text
            r.font.size = Pt(size)
            r.font.name = MONO
            r.font.color.rgb = color
    return h


def shot(slide, name, x, y, w, h, caption=None):
    path = os.path.join(IMG, name)
    if os.path.exists(path):
        rect(slide, x - 0.03, y - 0.03, w + 0.06, h + 0.06, fill=None, line=RULE, lw=1)
        slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    else:
        rect(slide, x, y, w, h, fill=SURF, line=RULE, lw=1, dash=MSO_LINE_DASH_STYLE.DASH)
        tb(slide, x, y + h / 2 - 0.30, w, 0.28, SHOTS.get(name, name), size=10.5,
           color=MUTED, align=PP_ALIGN.CENTER)
        tb(slide, x, y + h / 2 + 0.02, w, 0.28, '待插入截图', size=9.5, color=FAINT,
           align=PP_ALIGN.CENTER)
    if caption:
        tb(slide, x, y + h + 0.10, w, 0.24, caption, size=9.5, color=MUTED)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def build():
    prs = Presentation()
    prs.slide_width = Inches(13.334)
    prs.slide_height = Inches(7.5)

    # 1 封面
    s = new_slide(prs)
    rect(s, 0, 0, 0.14, 7.5, fill=GREEN)
    dots(s, 9.2, 4.7, 17, 7, 0.23, GHOST, d=0.035)
    tb(s, 1.15, 1.55, 9, 0.3, '课程设计 · 2026 年 11 月 6 日', size=12, color=MUTED)
    tb(s, 1.15, 2.0, 10, 1.1, '校园闲转', size=54, bold=True, color=INK)
    tb(s, 1.15, 3.18, 10, 0.5, '基于微信云开发的校园闲置二手交易平台', size=19, color=BODY)
    rect(s, 1.15, 3.98, 1.0, 0.035, fill=ORANGE)
    tb(s, 1.15, 4.36, 9, 0.9, '微信小程序　·　云函数 + 云数据库\n15 个页面　·　38 个接口　·　42 条测试用例',
       size=13.5, color=MUTED, line=1.7)
    tb(s, 1.15, 6.34, 9, 0.35, '课程设计小组', size=13, color=INK)
    notes(s, '开场 20 秒：我们做的是校内二手交易小程序，所有写操作和鉴权都在云函数里。'
             '今天讲两件事：整体做了什么，以及我们解决的一个真实故障。')

    # 2 章节 01
    s = section(prs, '01', '为什么要做这个', '校园闲置物的流转，卡在三个地方',
                ['信息散', '没有信用', '没有留痕'], 2)
    notes(s, '转场 10 秒：先讲背景。')

    # 3 三个堵点
    s = base(prs, '01 / 背景', '校园里闲置物流转的三个堵点', 3)
    cols = [('信息散', '二手信息散落在班级群、宿舍楼群、\n楼下贴纸，想找一件东西得翻几十条\n聊天记录。'),
            ('没有信用', '匿名交易看不出对方是谁、靠不靠谱，\n被放鸽子、被低价鸽都只能自认倒霉。'),
            ('没有留痕', '价格、时间、地点全在聊天里，\n事后没有任何可以追溯的凭据。')]
    for i, (t, d) in enumerate(cols):
        x = 0.9 + i * 3.88
        tb(s, x, 2.32, 3.3, 0.34, '0' + str(i + 1), size=11, color=GREEN, font=MONO)
        tb(s, x, 2.70, 3.3, 0.42, t, size=19, bold=True, color=INK)
        rect(s, x, 3.26, 0.62, 0.026, fill=RULE)
        tb(s, x, 3.52, 3.4, 1.4, d, size=13, color=BODY, line=1.8)
    rect(s, 0.9, 5.62, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 5.92, 11.5, 0.5, '目标：把「校内实名 + 站内沟通 + 订单留痕」收进同一个小程序。',
       size=17, bold=True, color=INK)
    notes(s, '30 秒：三个痛点各自对应一个设计决策。')

    # 4 功能全景
    s = base(prs, '01 / 功能', '15 个页面，5 个模块', 4)
    groups = [('商品', '首页·分类·搜索\n详情·发布·我的发布', '6'), ('交易', '下单·订单·评价', '3'),
              ('沟通', '消息·聊天', '2'), ('收藏', '收藏夹', '1'),
              ('账号与管理', '登录·我的·账号管理\n管理员控制台', '3')]
    x = 0.9
    for name, pages, n in groups:
        w = 2.18
        rect(s, x, 2.22, w, 2.0, fill=SURF)
        tb(s, x + 0.28, 2.42, w - 0.4, 0.5, n, size=26, bold=True, color=GREEN, font=MONO)
        tb(s, x + 0.28, 2.98, w - 0.4, 0.32, name, size=13.5, bold=True, color=INK)
        tb(s, x + 0.28, 3.38, w - 0.4, 0.8, pages, size=10.5, color=MUTED, line=1.6)
        x += w + 0.19
    rect(s, 0.9, 4.58, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 4.86, 5.4, 0.3, '管理端做的事', size=11, color=MUTED)
    tb(s, 0.9, 5.22, 5.4, 1.4,
       '数据看板 · 成员封禁（联动下架商品、禁言）\n违规商品下架 / 恢复 · 全站会话只读审计\n数据迁移 · 成交数重算',
       size=12, color=BODY, line=1.8)
    shot(s, '06-index.png', 7.05, 4.85, 2.55, 1.70)
    shot(s, '05-admin.png', 9.95, 4.85, 2.55, 1.70)
    notes(s, '40 秒：快速过功能，不逐页念。')

    # 5 章节 02
    s = section(prs, '02', '一条数据是怎么走到库里的', '四层结构，客户端不碰数据库',
                ['页面层', '服务层', '云函数', '数据层'], 5)
    notes(s, '转场 10 秒。')

    # 6 四层结构
    s = base(prs, '02 / 架构', '四层结构，客户端不碰数据库', 6)
    rows = [('页面层', '15 个页面 · pages/*', '只做渲染与交互，无业务逻辑', GREEN),
            ('服务层', 'services/* + utils/api.js', '唯一网络出口，统一拆包 {ok, data}', GREEN),
            ('云函数', 'cloudfunctions/api · 38 个 action', '身份校验 / 业务校验 / 写库', GREEN),
            ('数据层', '云数据库 + 云存储', '安全规则：客户端读写全部关闭', ORANGE)]
    for i, (t, sub, d, c) in enumerate(rows):
        y = 2.18 + i * 1.16
        rect(s, 0.9, y, 7.0, 0.94, fill=SURF)
        rect(s, 0.9, y, 0.055, 0.94, fill=c)
        tb(s, 1.18, y + 0.15, 2.1, 0.34, t, size=15, bold=True, color=INK)
        tb(s, 1.18, y + 0.54, 3.3, 0.3, sub, size=10.5, font=MONO, color=MUTED)
        tb(s, 4.6, y + 0.33, 3.1, 0.35, d, size=11, color=BODY)
        if i < 3:
            rect(s, 4.32, y + 0.96, 0.022, 0.20, fill=RULE)
    tb(s, 8.45, 2.28, 4.0, 0.3, '为什么这么切', size=11, color=MUTED)
    rect(s, 8.45, 2.60, 0.55, 0.026, fill=GREEN)
    tb(s, 8.45, 2.86, 4.0, 3.3,
       '小程序端的 openid 由微信下发，\n但客户端代码可被反编译。\n\n'
       '身份判定、封禁校验、写权限\n全部下沉到云函数，数据库\n安全规则对客户端读写关闭。\n\n'
       '客户端只剩一个出口。', size=12.5, color=BODY, line=1.8)
    notes(s, '40 秒：强调客户端零直写。')

    # 7 架构全景
    s = base(prs, '02 / 全景', '15 个页面 → 6 组 action → 11 个集合', 7)
    tb(s, 0.9, 2.18, 3.6, 0.28, '页面（15）', size=11, color=MUTED)
    tb(s, 0.9, 2.50, 3.6, 3.6,
       '首页 分类 搜索 详情 发布\n我的发布 订单 评价\n消息 聊天 收藏\n登录 我的 账号管理\n管理员控制台',
       size=12, color=BODY, line=1.95)
    rect(s, 4.55, 2.50, 0.011, 3.3, fill=RULE)
    tb(s, 4.95, 2.18, 3.6, 0.28, '云函数 action（38）', size=11, color=MUTED)
    acts = [('auth', 6), ('goods', 7), ('chat', 7), ('order', 5), ('favorite', 3), ('admin', 9)]
    for i, (a, n) in enumerate(acts):
        y = 2.55 + i * 0.55
        tb(s, 4.95, y, 1.5, 0.3, a, size=12, font=MONO, color=BODY)
        rect(s, 6.15, y + 0.06, n * 0.13, 0.19, fill=GREEN)
        tb(s, 6.15 + n * 0.13 + 0.10, y, 0.5, 0.3, str(n), size=10, font=MONO, color=MUTED)
    rect(s, 8.4, 2.50, 0.011, 3.3, fill=RULE)
    tb(s, 8.8, 2.18, 3.7, 0.28, '数据库集合（11）', size=11, color=MUTED)
    tb(s, 8.8, 2.50, 3.7, 3.6,
       'users　goods　orders\nchats　messages　reads\nfavorites　bans　violations\nwhitelist　admins',
       size=11.5, font=MONO, color=BODY, line=2.1)
    rect(s, 0.9, 6.32, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 6.54, 11.5, 0.3,
       '任意一条写请求：页面 → services → utils/api → 云函数鉴权 → 集合', size=11, color=MUTED)
    notes(s, '30 秒：给一个全局印象，说明页面不是各写各的。')

    # 8 代码页：唯一出口
    s = base(prs, '02 / 代码', '客户端只有一处碰网络', 8)
    code_window(s, 0.9, 2.12, 7.5, [
        'function call(action, payload = {}) {',
        '  return new Promise((resolve, reject) => {',
        '    wx.cloud.callFunction({',
        '      name: "api",',
        '      data: { action, payload },',
        '      success(res) {',
        '        const r = res && res.result;',
        '        if (r && r.ok) resolve(r.data);',
        '        else reject({ code: r.code, message: r.message });',
        '      }',
        '    });',
        '  });',
        '}',
    ], 'utils/api.js')
    tb(s, 8.85, 2.20, 3.6, 0.3, '为什么只留一个出口', size=11, color=MUTED)
    rect(s, 8.85, 2.54, 0.55, 0.026, fill=GREEN)
    tb(s, 8.85, 2.84, 3.6, 3.4,
       '服务端统一返回\n{ ok, data } / { ok:false, code }\n\n'
       '拆包只发生一次，\n「错误码 → 提示文案」\n只需维护一份。\n\n'
       '新增接口不用重写错误处理。', size=12, color=BODY, line=1.85)
    notes(s, '35 秒：这是全项目最窄的接缝。')

    # 9 代码页：安全边界
    s = base(prs, '02 / 代码', '身份只信微信，不信客户端', 9)
    code_window(s, 0.9, 2.12, 6.55, [
        'const me = async (openid) => {',
        '  const user = await userByOpenid(openid);',
        '  assert(user, "NOT_LOGGED_IN");',
        '  if (user.status === "deleted") fail(...);',
        '  const ban = await findOne("bans", { sid: user.sid });',
        '  if (ban) fail("BANNED");',
        '  return user;',
        '};',
    ], 'cloudfunctions/api/lib.js')
    code_window(s, 7.7, 2.12, 4.73, [
        '{',
        '  "read": "doc.openidA == auth.openid"',
        '        " || doc.openidB == auth.openid",',
        '  "write": false',
        '}',
    ], '数据库安全规则 · messages')
    tb(s, 0.9, 5.62, 11.5, 1.0,
       'openid 只从 getWXContext() 取，payload 里传什么都不看。封禁检查写在 me() 里，'
       '所有需要登录的接口自动获得拦截，不必逐个 action 重复写。', size=12, color=BODY, line=1.85)
    notes(s, '40 秒：左边是入口，右边是最后一道闸。')

    # 10 章节 03
    s = section(prs, '03', '一个真实的线上故障', '同一个卖家，两个聊天框，消息发不出去',
                ['现象', '排查', '根因', '修复'], 10)
    notes(s, '转场 10 秒：接下来讲我们真正栽过的坑。')

    # 11 现象
    s = base(prs, '03 / 现象', '同一个卖家，却有两个聊天框', 11)
    rect(s, 0.9, 2.18, 5.35, 3.85, fill=SURF)
    for i, (nm, tag, color, gname) in enumerate([('裴同学', '正常', GREEN, '正宗青岛鲜啤'),
                                                 ('卖家', '对手方查不到', ORANGE, '烟台冰淇淋')]):
        y = 2.52 + i * 1.50
        rect(s, 1.2, y, 4.75, 1.15, fill=PAGE, line=RULE, lw=1)
        rect(s, 1.42, y + 0.26, 0.62, 0.62, fill=SURF2, shape=MSO_SHAPE.OVAL)
        tb(s, 1.42, y + 0.36, 0.62, 0.4, '裴' if i == 0 else '?', size=14, color=MUTED,
           align=PP_ALIGN.CENTER)
        tb(s, 2.20, y + 0.24, 2.4, 0.3, nm, size=13, bold=True, color=INK)
        tb(s, 2.20, y + 0.62, 3.3, 0.3, '关于：' + gname, size=10, color=MUTED)
        rect(s, 4.35, y + 0.24, 1.38, 0.30, fill=None, line=color, lw=1,
             shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        tb(s, 4.35, y + 0.29, 1.38, 0.24, tag, size=8.5, color=color, align=PP_ALIGN.CENTER)
    tb(s, 0.9, 6.18, 5.35, 0.3, '同一对用户，库里两条会话记录', size=10, color=MUTED,
       align=PP_ALIGN.CENTER)
    tb(s, 6.75, 2.24, 5.6, 0.3, '三个同时出现的现象', size=11, color=MUTED)
    rect(s, 6.75, 2.56, 0.55, 0.026, fill=GREEN)
    items = [('同一个卖家，点两次不同商品', '进了两个不同的聊天窗口，历史消息被切开。'),
             ('其中一个对手方显示「卖家」', '头像永远是默认图标，改名换头像都不生效。'),
             ('管理员收不到别人的消息', '发出去的消息对方看不到，对方发的他也收不到。')]
    for i, (h, d) in enumerate(items):
        y = 2.88 + i * 1.14
        tb(s, 6.75, y, 5.6, 0.32, h, size=14, bold=True, color=INK)
        tb(s, 6.75, y + 0.38, 5.6, 0.5, d, size=11.5, color=BODY, line=1.65)
    notes(s, '45 秒：只讲现象，不给结论。')

    # 12 代码页：根因
    s = base(prs, '03 / 根因', '学号被写进了 openid 字段', 12)
    code_window(s, 0.9, 2.12, 7.9, [
        'chats.openidA      = "000000003"   // 学号，不是 openid',
        'goods.sellerOpenid = "000000000"   // 同样是学号',
        'users 按 openid 查  ->  null',
        '昵称回退成字面量「卖家」  // 头像也一起丢了',
    ], '数据库真实数据（已脱敏）')
    tb(s, 9.2, 2.20, 3.2, 0.3, '怎么查出来的', size=11, color=MUTED)
    tb(s, 9.2, 2.56, 3.2, 3.2,
       '1　写只读自检接口\n　 只返回本人数据\n\n2　两个账号各跑一次\n　 对比 chats/users/goods\n\n3　sid 反查 users\n　 发现「卖家」是同班同学',
       size=11, color=BODY, line=1.85)
    rect(s, 0.9, 4.62, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 4.88, 11.5, 1.2,
       '真实 openid 形如 obfA_3VuO7m9tS-…，永远不会是纯数字。历史代码把 sid 直接写进了 openid 字段，'
       '会话的「对手方」指向了一个不存在的用户——\n一条会话没有主人，消息写进去，谁都收不到。',
       size=12.5, color=BODY, line=1.9)
    notes(s, '50 秒：全场核心。强调不是权限问题，是数据问题。')

    # 13 代码页：方案
    s = base(prs, '03 / 方案', '一对用户，只能有一条会话', 13)
    code_window(s, 0.9, 2.12, 7.3, [
        'const pairKeyOf = (a, b) => {',
        '  const [x, y] = a < b ? [a, b] : [b, a];',
        '  return "c_" + md5(x + "|" + y).slice(0, 24);',
        '};',
        '',
        'const chatId = pairKeyOf(openid, good.sellerOpenid);',
        'let chat = await getChat(chatId);',
        '// 同 _id 的 add 会被数据库直接拒绝',
    ], 'cloudfunctions/api/actions/chat.js')
    pts = [('确定性主键', '会话 id 由两个 openid 算出，写死在服务端。'),
           ('主键即约束', '并发也造不出第二条，不依赖「先查后插」。'),
           ('商品降级为上下文', 'goodId 不再进主键，改为 currentGoodId。')]
    for i, (h, d) in enumerate(pts):
        y = 2.30 + i * 1.05
        rect(s, 8.55, y + 0.06, 0.05, 0.42, fill=GREEN)
        tb(s, 8.80, y, 3.6, 0.3, h, size=12.5, bold=True, color=INK)
        tb(s, 8.80, y + 0.34, 3.6, 0.5, d, size=11, color=BODY, line=1.65)
    tb(s, 0.9, 5.55, 7.3, 0.9,
       '迁移脚本先预演再执行；旧会话只打 mergedInto 标记，消息一条不删。', size=11.5,
       color=MUTED, line=1.75)
    notes(s, '45 秒："主键即约束"是最值得讲的——把约定变成数据库层的保证。')

    # 14 效果
    s = base(prs, '03 / 效果', '数据对得上，才叫修好了', 14)
    nums = [('12', '条消息', '迁移前后一条不少'), ('4', '条会话', '碎片会话合并为正本'),
            ('1', '条消息', '此前双方都看不到，被找回')]
    for i, (n, u, d) in enumerate(nums):
        x = 0.9 + i * 3.9
        tb(s, x, 2.12, 3.5, 0.9, n, size=44, bold=True, color=GREEN, font=MONO, line=1.0)
        tb(s, x + 0.06, 3.10, 3.5, 0.3, u, size=12, color=MUTED)
        rect(s, x, 3.46, 0.55, 0.026, fill=RULE)
        tb(s, x, 3.70, 3.5, 0.6, d, size=11.5, color=BODY, line=1.55)
    rect(s, 0.9, 4.56, 11.53, 0.011, fill=RULE)
    shot(s, '01-message.png', 0.9, 4.88, 5.5, 1.52, '修复后：一个卖家一条会话')
    shot(s, '03-timeline.png', 6.93, 4.88, 5.5, 1.52, '同一窗口内切换商品，时间线自动分段')
    notes(s, '40 秒：用数字收尾。12 = 7 + 2 + 3，逐条核对过归属。')

    # 15 测试与质量
    s = base(prs, '04 / 质量', '42 条用例，7 个缺陷，2 个严重', 15)
    tb(s, 0.9, 2.18, 6.6, 0.3, '用例分布', size=11, color=MUTED)
    bars = [('聊天', 10), ('商品', 7), ('管理员', 7), ('登录认证', 6), ('交易', 5), ('头像', 4),
            ('安全', 3)]
    for i, (name, n) in enumerate(bars):
        y = 2.58 + i * 0.52
        tb(s, 0.9, y, 1.4, 0.3, name, size=10.5, color=BODY)
        rect(s, 2.4, y + 0.05, n * 0.28, 0.24, fill=GREEN)
        tb(s, 2.4 + n * 0.28 + 0.12, y, 0.6, 0.3, str(n), size=10.5, font=MONO, color=MUTED)
    rect(s, 6.95, 2.18, 0.011, 3.7, fill=RULE)
    tb(s, 7.25, 2.18, 5.2, 0.3, '7 个缺陷全部定位到根因', size=11, color=MUTED)
    bugs = [('BUG-01', '严重', '管理员收不到消息', ORANGE),
            ('BUG-03', '严重', '同一卖家两个聊天框', ORANGE),
            ('BUG-05', '中', '键盘把顶部商品条顶走', MUTED),
            ('BUG-02', '中', '看不到别人换的头像', MUTED),
            ('BUG-04', '轻', '空会话占位', MUTED),
            ('BUG-06', '轻', '切商品无时间线提示', MUTED),
            ('BUG-07', '中', '成交数只加卖家不加买家', MUTED)]
    for i, (bid, sev, d, c) in enumerate(bugs):
        y = 2.56 + i * 0.52
        tb(s, 7.25, y, 0.95, 0.3, bid, size=9.5, font=MONO, color=MUTED)
        rect(s, 8.26, y + 0.04, 0.6, 0.26, fill=None, line=c, lw=1,
             shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        tb(s, 8.26, y + 0.07, 0.6, 0.22, sev, size=8, color=c, align=PP_ALIGN.CENTER)
        tb(s, 9.02, y, 3.6, 0.3, d, size=11, color=BODY)
    rect(s, 0.9, 6.25, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 6.47, 11.5, 0.35,
       '另附 3 个自研静态检查脚本：页面四件套引用 · WXML 绑定 ↔ 页面方法 · 纯逻辑冒烟（10 例）',
       size=11, color=MUTED)
    notes(s, '35 秒：两个严重缺陷都在数据模型层。')

    # 16 数字墙
    s = new_slide(prs)
    dots(s, 0.55, 5.9, 22, 3, 0.22, GHOST, d=0.035)
    tb(s, 0.9, 0.85, 8, 0.3, '05 / 收尾', size=10.5, color=MUTED)
    tb(s, 0.9, 1.20, 11.5, 0.7, '这个项目的六个数字', size=30, bold=True, color=INK)
    rect(s, 0.9, 2.05, 0.5, 0.035, fill=GREEN)
    wall = [('38', '云函数接口'), ('15', '页面'), ('11', '数据库集合'),
            ('42', '测试用例'), ('7', '已修缺陷'), ('12', '消息一条不少')]
    for i, (n, label) in enumerate(wall):
        col, row = i % 3, i // 3
        x = 0.9 + col * 3.9
        y = 2.55 + row * 2.02
        tb(s, x, y, 2.6, 1.0, n, size=72, bold=True, color=GREEN, font=MONO, line=1.0)
        tb(s, x + 0.05, y + 1.05, 3.0, 0.3, label, size=13, color=MUTED)
        rect(s, x, y + 1.48, 2.2, 0.011, fill=RULE)
    rect(s, 0.9, 6.52, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 6.76, 5, 0.4, 'Q & A', size=22, bold=True, color=INK)
    tb(s, 5.0, 6.88, 7.4, 0.3, 'github.com/Zion-17/xiaoyuanershou', size=10.5,
       color=MUTED, align=PP_ALIGN.RIGHT)
    notes(s, '30 秒收尾：六个数字铺满，然后停下来等提问。')

    prs.save(OUT)
    print('saved:', OUT)


if __name__ == '__main__':
    build()
