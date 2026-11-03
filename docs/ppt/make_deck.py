# -*- coding: utf-8 -*-
"""生成课程设计答辩 PPT（12 页）。

用法：python docs/ppt/make_deck.py
截图放到 docs/ppt/img/ 下，文件名见 SHOTS；缺失时自动画占位框。
"""
import os
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

INK = RGBColor(0x1A, 0x1D, 0x21)
MUTED = RGBColor(0x6B, 0x72, 0x80)
GREEN = RGBColor(0x00, 0xB5, 0x78)
ORANGE = RGBColor(0xFF, 0x6B, 0x35)
RULE = RGBColor(0xE6, 0xE8, 0xEC)
CANVAS = RGBColor(0xF7, 0xF8, 0xFA)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
CODEBG = RGBColor(0xF4, 0xF5, 0xF7)

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
       align=PP_ALIGN.LEFT, line=1.45, gap=0, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    for i, ln in enumerate(str(text).split('\n')):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line
        p.space_after = Pt(gap)
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


def base(prs, kicker, title, page):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    rect(s, 0, 0, 13.334, 7.5, fill=WHITE)
    rect(s, 0.9, 0.62, 0.26, 0.035, fill=GREEN)
    tb(s, 1.3, 0.54, 8, 0.3, kicker, size=10.5, color=MUTED)
    tb(s, 0.9, 0.92, 11.5, 0.72, title, size=27, bold=True)
    rect(s, 0.9, 1.8, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 7.04, 6, 0.24, '校园闲转 · 课程设计', size=9, color=MUTED)
    tb(s, 11.83, 7.04, 0.6, 0.24, str(page), size=9, color=MUTED, align=PP_ALIGN.RIGHT)
    return s


def code(slide, x, y, w, lines, size=12.5):
    h = 0.34 + 0.32 * len(lines)
    rect(slide, x, y, w, h, fill=CODEBG)
    rect(slide, x, y, 0.035, h, fill=GREEN)
    tb(slide, x + 0.32, y + 0.2, w - 0.5, h - 0.3, '\n'.join(lines),
       size=size, font=MONO, color=INK, line=1.55)


def shot(slide, name, x, y, w, h, caption=None):
    path = os.path.join(IMG, name)
    if os.path.exists(path):
        rect(slide, x - 0.03, y - 0.03, w + 0.06, h + 0.06, fill=None, line=RULE, lw=1)
        slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    else:
        rect(slide, x, y, w, h, fill=CANVAS, line=RGBColor(0xC9, 0xCE, 0xD6),
             lw=1, dash=MSO_LINE_DASH_STYLE.DASH)
        tb(slide, x, y + h / 2 - 0.32, w, 0.3, SHOTS.get(name, name),
           size=11, color=MUTED, align=PP_ALIGN.CENTER)
        tb(slide, x, y + h / 2 + 0.02, w, 0.3, '待插入截图',
           size=10, color=RGBColor(0xA8, 0xB0, 0xBC), align=PP_ALIGN.CENTER)
    if caption:
        tb(slide, x, y + h + 0.12, w, 0.26, caption, size=9.5, color=MUTED)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def build():
    prs = Presentation()
    prs.slide_width = Inches(13.334)
    prs.slide_height = Inches(7.5)

    # ---------- 1 封面 ----------
    s = prs.slides.add_slide(prs.slide_layouts[6])
    rect(s, 0, 0, 13.334, 7.5, fill=WHITE)
    rect(s, 0, 0, 0.14, 7.5, fill=GREEN)
    tb(s, 1.15, 1.55, 8, 0.32, '课程设计 · 2026 年 11 月 6 日', size=12, color=MUTED)
    tb(s, 1.15, 2.02, 9, 1.1, '校园闲转', size=54, bold=True)
    tb(s, 1.15, 3.15, 9, 0.5, '基于微信云开发的校园闲置二手交易平台', size=19, color=RGBColor(0x3D, 0x44, 0x4F))
    rect(s, 1.15, 3.95, 1.1, 0.035, fill=ORANGE)
    tb(s, 1.15, 4.32, 9, 0.9,
       '微信小程序　·　云函数 + 云数据库\n15 个页面　·　38 个接口　·　42 条测试用例',
       size=13.5, color=MUTED, line=1.7)
    tb(s, 1.15, 6.35, 9, 0.4, '课程设计小组', size=13, color=INK)
    tb(s, 1.15, 6.7, 9, 0.3, '（答辩前把这里替换成真实姓名）', size=10, color=RGBColor(0xA8, 0xB0, 0xBC))
    notes(s, '开场 20 秒：我们组做的是一个校内二手交易小程序，'
             '所有写操作和鉴权都在云函数里完成。今天重点讲两件事：整体做了什么，'
             '以及我们解决的一个真实故障。')

    # ---------- 2 背景 ----------
    s = base(prs, '01 / 背景', '校园里闲置物流转的三个堵点', 2)
    cols = [
        ('信息散', '二手信息散落在班级群、宿舍楼群、楼下贴纸，\n想找一件东西得翻几十条聊天记录。'),
        ('没有信用', '匿名交易看不出对方是谁、靠不靠谱，\n被放鸽子、被低价鸽都只能自认倒霉。'),
        ('没有留痕', '价格、时间、地点全在聊天里，\n事后没有任何可以追溯的凭据。'),
    ]
    for i, (t, d) in enumerate(cols):
        x = 0.9 + i * 3.88
        tb(s, x, 2.3, 3.3, 0.34, '0' + str(i + 1), size=11, color=GREEN, font=MONO)
        tb(s, x, 2.66, 3.3, 0.4, t, size=19, bold=True)
        rect(s, x, 3.18, 0.62, 0.028, fill=RULE)
        tb(s, x, 3.42, 3.4, 1.3, d, size=13, color=RGBColor(0x3D, 0x44, 0x4F), line=1.75)
    rect(s, 0.9, 5.55, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 5.85, 11.5, 0.5,
       '目标：把「校内实名 + 站内沟通 + 订单留痕」收进同一个小程序。', size=17, bold=True)
    notes(s, '30 秒：三个痛点各自对应一个设计决策——实名对白名单，站内沟通对聊天模块，'
             '留痕对订单与评价。')

    # ---------- 3 架构 ----------
    s = base(prs, '02 / 架构', '三层结构，客户端不碰数据库', 3)
    rows = [
        ('页面层', '15 个页面 · pages/*', '只做渲染与交互，无业务逻辑', GREEN),
        ('服务层', 'services/* + utils/api.js', '唯一网络出口，统一拆包 {ok, data}', RGBColor(0x0E, 0x9A, 0x6A)),
        ('云函数', 'cloudfunctions/api · 38 个 action', '身份校验 / 业务校验 / 写库', RGBColor(0x0B, 0x7C, 0x55)),
        ('数据层', '云数据库 + 云存储', '安全规则：客户端读写全部关闭', INK),
    ]
    for i, (t, sub, d, c) in enumerate(rows):
        y = 2.2 + i * 1.18
        rect(s, 0.9, y, 7.0, 0.95, fill=CANVAS)
        rect(s, 0.9, y, 0.055, 0.95, fill=c)
        tb(s, 1.18, y + 0.16, 2.1, 0.34, t, size=15, bold=True)
        tb(s, 1.18, y + 0.55, 3.3, 0.3, sub, size=10.5, font=MONO, color=MUTED)
        tb(s, 4.6, y + 0.34, 3.1, 0.35, d, size=11, color=RGBColor(0x3D, 0x44, 0x4F))
        if i < 3:
            rect(s, 4.32, y + 0.98, 0.022, 0.2, fill=RGBColor(0xC9, 0xCE, 0xD6))
    tb(s, 8.45, 2.3, 4.0, 0.32, '为什么这么切', size=12, color=MUTED)
    rect(s, 8.45, 2.62, 0.55, 0.028, fill=GREEN)
    tb(s, 8.45, 2.85, 4.0, 3.4,
       '小程序端的 openid 由微信下发，\n但客户端代码可被反编译。\n\n'
       '因此身份判定、封禁校验、\n写权限全部下沉到云函数，\n'
       '数据库安全规则对客户端\n读写一律关闭。\n\n'
       '客户端只剩一个出口：\nutils/api.js。',
       size=12.5, color=RGBColor(0x3D, 0x44, 0x4F), line=1.7)
    notes(s, '40 秒：强调"客户端零直写"——这是整个安全设计的地基。')

    # ---------- 4 技术选型 ----------
    s = base(prs, '03 / 选型', '为什么是云开发，而不是自建服务器', 4)
    tb(s, 0.9, 2.28, 5.5, 0.3, '自建服务器', size=12, color=MUTED)
    tb(s, 6.95, 2.28, 5.5, 0.3, '微信云开发', size=12, color=GREEN)
    rect(s, 0.9, 2.6, 5.5, 0.011, fill=RULE)
    rect(s, 6.95, 2.6, 5.5, 0.011, fill=GREEN)
    left = ['部署 / 域名 / HTTPS 证书', '登录态与 openid 换取', '数据库运维与备份',
            '按量计费，前期就要花钱', '至少多花 1 周在环境上']
    right = ['免运维，随小程序一起发布', 'getWXContext 直接给 openid',
             '托管数据库 + 安全规则', '免费额度够课程设计用', '把时间花在业务逻辑上']
    for i, (a, b) in enumerate(zip(left, right)):
        y = 2.85 + i * 0.62
        tb(s, 0.9, y, 5.3, 0.35, a, size=12.5, color=RGBColor(0x8A, 0x92, 0x9E))
        tb(s, 6.95, y, 5.3, 0.35, b, size=12.5, color=INK)
    rect(s, 0.9, 6.25, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 6.5, 11.5, 0.4, '代价：云存储免费版是「仅创建者可读」，图片只能转 base64 入库——后面会提到。',
       size=12, color=ORANGE)
    notes(s, '35 秒：选型不是"云开发更好"，是"在课程设计的时间窗口里更划算"，'
             '并且主动说出它的代价，比只讲优点可信。')

    # ---------- 5 功能全景 ----------
    s = base(prs, '04 / 功能', '15 个页面，5 个模块', 5)
    groups = [
        ('商品', '首页 · 分类 · 搜索\n详情 · 发布 · 我的发布', '6'),
        ('交易', '下单 · 订单 · 评价', '3'),
        ('沟通', '消息 · 聊天', '2'),
        ('收藏', '收藏夹', '1'),
        ('账号与管理', '登录 · 我的 · 账号管理\n管理员控制台', '3'),
    ]
    x = 0.9
    for name, pages, n in groups:
        w = 2.18
        rect(s, x, 2.25, w, 2.05, fill=CANVAS)
        tb(s, x + 0.28, 2.45, w - 0.4, 0.5, n, size=26, bold=True, color=GREEN, font=MONO)
        tb(s, x + 0.28, 3.02, w - 0.4, 0.32, name, size=13.5, bold=True)
        tb(s, x + 0.28, 3.42, w - 0.4, 0.8, pages, size=10.5, color=MUTED, line=1.6)
        x += w + 0.19
    rect(s, 0.9, 4.65, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 4.95, 5.4, 0.32, '管理端做的事', size=12, color=MUTED)
    tb(s, 0.9, 5.32, 5.4, 1.4,
       '数据看板 · 成员封禁（联动下架商品、禁言）\n违规商品下架 / 恢复 · 全站会话只读审计\n数据迁移（先预演，再执行）',
       size=12, color=RGBColor(0x3D, 0x44, 0x4F), line=1.75)
    shot(s, '06-index.png', 7.05, 4.9, 2.55, 1.75)
    shot(s, '05-admin.png', 9.95, 4.9, 2.55, 1.75)
    notes(s, '40 秒：快速过功能，不要逐页念。重点指出"管理员控制台"这一块，'
             '下一段会讲它跟普通用户的关系。')

    # ---------- 6 问题现场 ----------
    s = base(prs, '05 / 案例 · 现象', '同一个卖家，却有两个聊天框', 6)
    rect(s, 0.9, 2.2, 5.35, 3.85, fill=CANVAS)
    for i, (nm, tag, color) in enumerate([('裴同学', '正常', GREEN), ('卖家', '对手方查不到', ORANGE)]):
        y = 2.55 + i * 1.5
        rect(s, 1.2, y, 4.75, 1.15, fill=WHITE, line=RULE, lw=1)
        rect(s, 1.42, y + 0.26, 0.62, 0.62, fill=CANVAS, shape=MSO_SHAPE.OVAL, line=RULE, lw=1)
        tb(s, 1.42, y + 0.36, 0.62, 0.4, '裴' if i == 0 else '?', size=14, color=MUTED, align=PP_ALIGN.CENTER)
        tb(s, 2.2, y + 0.24, 2.4, 0.3, nm, size=13, bold=True)
        tb(s, 2.2, y + 0.62, 3.3, 0.3, '关于：正宗青岛鲜啤' if i == 0 else '关于：烟台冰淇淋', size=10, color=MUTED)
        rect(s, 4.35, y + 0.24, 1.38, 0.3, fill=WHITE, line=color, lw=1,
             shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        tb(s, 4.35, y + 0.29, 1.38, 0.24, tag, size=8.5, color=color, align=PP_ALIGN.CENTER)
    tb(s, 0.9, 6.2, 5.35, 0.3, '同一对用户，库里两条会话记录', size=10, color=MUTED, align=PP_ALIGN.CENTER)

    tb(s, 6.75, 2.28, 5.6, 0.32, '三个同时出现的现象', size=12, color=MUTED)
    rect(s, 6.75, 2.6, 0.55, 0.028, fill=GREEN)
    items = [
        ('同一个卖家，点两次不同商品', '进了两个不同的聊天窗口，历史消息被切开。'),
        ('其中一个对手方显示「卖家」', '头像永远是默认图标，改名换头像都不生效。'),
        ('管理员收不到别人的消息', '发出去的消息对方看不到，对方发的他也收不到。'),
    ]
    for i, (h, d) in enumerate(items):
        y = 2.9 + i * 1.12
        tb(s, 6.75, y, 5.6, 0.32, h, size=14, bold=True)
        tb(s, 6.75, y + 0.38, 5.6, 0.5, d, size=11.5, color=RGBColor(0x3D, 0x44, 0x4F), line=1.6)
    notes(s, '45 秒：先只讲现象，不给结论。让老师跟着"这明显是个 bug"的思路走，'
             '下一页再揭根因。')

    # ---------- 7 根因 ----------
    s = base(prs, '05 / 案例 · 根因', '学号被写进了 openid 字段', 7)
    code(s, 0.9, 2.25, 7.35, [
        'chats.openidA      = "000000003"   ← 这是学号',
        'goods.sellerOpenid = "000000000"   ← 这也是学号',
        'users 按 openid 查 → 查不到 → 昵称回退成字面量「卖家」',
    ], size=11.5)
    tb(s, 0.9, 3.75, 7.35, 2.4,
       '真实 openid 形如 obfA_3VuO7m9tS-…，永远不会是纯数字。\n'
       '历史版本的一部分代码把 sid 直接写进了 openid 字段，\n'
       '于是会话的「对手方」指向了一个根本不存在的用户。\n\n'
       '一条会话没有主人 —— 消息写进去，谁都收不到。',
       size=12.5, color=RGBColor(0x3D, 0x44, 0x4F), line=1.85)
    rect(s, 8.55, 2.25, 3.88, 3.15, fill=CANVAS)
    tb(s, 8.85, 2.5, 3.3, 0.3, '怎么查出来的', size=11, color=MUTED)
    tb(s, 8.85, 2.9, 3.3, 2.7,
       '1  写一个只读自检接口\n    只返回调用者本人的数据\n\n'
       '2  用两个账号各跑一次\n    对比 chats / users / goods\n\n'
       '3  把 sid 反查 users\n    发现「卖家」其实是同班同学',
       size=11, color=RGBColor(0x3D, 0x44, 0x4F), line=1.75)
    notes(s, '50 秒：这是全场核心。强调"不是权限问题，是数据问题"——'
             '我们一开始也以为是管理员特权出了问题，代码里根本没有管理员分支。')

    # ---------- 8 方案 ----------
    s = base(prs, '05 / 案例 · 方案', '一对用户，只能有一条会话', 8)
    code(s, 0.9, 2.25, 7.35, [
        'const pairKeyOf = (a, b) => {',
        "  const [x, y] = a < b ? [a, b] : [b, a];",
        "  return 'c_' + md5(x + '|' + y).slice(0, 24);",
        '};',
    ], size=11.5)
    pts = [
        ('确定性主键', '会话 id 由两个 openid 算出，写死在服务端，并发也造不出第二条。'),
        ('主键即约束', 'add 相同 _id 会被数据库直接拒绝，不依赖「先查后插」这类有竞态的写法。'),
        ('商品降级为上下文', 'goodId 不再进主键，改为会话内 currentGoodId + 每条消息的 goodId。'),
    ]
    for i, (h, d) in enumerate(pts):
        y = 4.15 + i * 0.86
        rect(s, 0.9, y + 0.06, 0.05, 0.42, fill=GREEN)
        tb(s, 1.12, y, 2.5, 0.32, h, size=12.5, bold=True)
        tb(s, 3.55, y - 0.02, 9.0, 0.4, d, size=11.5, color=RGBColor(0x3D, 0x44, 0x4F))
    rect(s, 8.55, 2.25, 3.88, 1.5, fill=CANVAS)
    tb(s, 8.78, 2.45, 3.4, 0.3, '历史数据怎么办', size=11, color=MUTED)
    tb(s, 8.78, 2.82, 3.4, 0.85,
       '迁移脚本：先预演（只读），\n确认后再执行；旧会话只打标记，\n一条消息都不删。',
       size=10.5, color=RGBColor(0x3D, 0x44, 0x4F), line=1.6)
    notes(s, '45 秒：三个设计点里，"主键即约束"是最值得讲的——'
             '它把"不要重复"从应用层的约定变成了数据库层的保证。')

    # ---------- 9 效果 ----------
    s = base(prs, '05 / 案例 · 效果', '数据对得上，才叫修好了', 9)
    nums = [('12', '条消息', '迁移前后一条不少'), ('4', '条会话', '碎片会话合并为正本'),
            ('1', '条消息', '此前双方都看不到，被找回')]
    for i, (n, u, d) in enumerate(nums):
        x = 0.9 + i * 3.9
        tb(s, x, 2.2, 3.5, 0.9, n, size=44, bold=True, color=GREEN, font=MONO)
        tb(s, x + 0.06, 3.15, 3.5, 0.3, u, size=12, color=MUTED)
        rect(s, x, 3.5, 0.55, 0.028, fill=RULE)
        tb(s, x, 3.72, 3.5, 0.6, d, size=11.5, color=RGBColor(0x3D, 0x44, 0x4F), line=1.5)
    rect(s, 0.9, 4.62, 11.53, 0.011, fill=RULE)
    shot(s, '01-message.png', 0.9, 4.88, 5.5, 1.58, '修复后：一个卖家一条会话，不再出现「卖家」')
    shot(s, '03-timeline.png', 6.93, 4.88, 5.5, 1.58, '同一窗口内切换商品，时间线自动分段')
    notes(s, '40 秒：用数字收尾最有说服力。12 = 7 + 2 + 3，'
             '我们逐条核对过归属，没有靠"看起来正常"下结论。')

    # ---------- 10 安全 ----------
    s = base(prs, '06 / 设计', '安全上的三个边界', 10)
    blocks = [
        ('身份边界', 'openid 只从 getWXContext 取，\n客户端传什么都不信。',
         'const { OPENID } =\n  cloud.getWXContext();'),
        ('数据边界', '所有写操作经云函数；\n数据库对客户端一律读写关闭。',
         '{ "read":\n    "doc.openidA == auth.openid",\n  "write": false }'),
        ('管理边界', 'admins 表 + 服务端常量双判定；\n控制台与个人会话完全隔离。',
         'adminOf(openid)\n  → requireAdmin()'),
    ]
    for i, (h, d, c) in enumerate(blocks):
        x = 0.9 + i * 3.9
        rect(s, x, 2.25, 3.7, 4.15, fill=WHITE, line=RULE, lw=1)
        tb(s, x + 0.3, 2.5, 3.1, 0.35, h, size=15, bold=True)
        rect(s, x + 0.3, 2.95, 0.5, 0.026, fill=GREEN)
        tb(s, x + 0.3, 3.2, 3.15, 1.0, d, size=11.5, color=RGBColor(0x3D, 0x44, 0x4F), line=1.7)
        rect(s, x + 0.3, 4.35, 3.15, 1.75, fill=CODEBG)
        tb(s, x + 0.48, 4.52, 2.85, 1.45, c, size=8.5, font=MONO, color=INK, line=1.55)
    notes(s, '40 秒：三条边界各配一句代码，说明不是嘴上说说。'
             '管理边界可以补一句：管理员除了多一个控制台，其他功能与普通用户完全一致。')

    # ---------- 11 测试 ----------
    s = base(prs, '07 / 质量', '42 条用例，6 个缺陷，2 个严重', 11)
    tb(s, 0.9, 2.25, 6.6, 0.3, '用例分布', size=11, color=MUTED)
    bars = [('聊天', 10), ('商品', 7), ('管理员', 7), ('登录认证', 6), ('交易', 5), ('头像', 4), ('安全', 3)]
    for i, (name, n) in enumerate(bars):
        y = 2.68 + i * 0.52
        tb(s, 0.9, y, 1.4, 0.3, name, size=10.5)
        rect(s, 2.4, y + 0.05, n * 0.28, 0.24, fill=GREEN if n >= 7 else RGBColor(0x8F, 0xD8, 0xC0))
        tb(s, 2.4 + n * 0.28 + 0.12, y, 0.6, 0.3, str(n), size=10.5, font=MONO, color=MUTED)
    rect(s, 6.95, 2.25, 0.011, 3.75, fill=RULE)
    tb(s, 7.25, 2.25, 5.2, 0.3, '6 个缺陷全部定位到根因', size=11, color=MUTED)
    bugs = [
        ('BUG-01', '严重', '管理员收不到消息', ORANGE),
        ('BUG-03', '严重', '同一卖家两个聊天框', ORANGE),
        ('BUG-05', '中', '键盘把顶部商品条顶走', MUTED),
        ('BUG-02', '中', '看不到别人换的头像', MUTED),
        ('BUG-04', '轻', '空会话占位', MUTED),
        ('BUG-06', '轻', '切商品无时间线提示', MUTED),
    ]
    for i, (bid, sev, d, c) in enumerate(bugs):
        y = 2.66 + i * 0.55
        tb(s, 7.25, y, 0.95, 0.3, bid, size=9.5, font=MONO, color=MUTED)
        rect(s, 8.28, y + 0.04, 0.6, 0.26, fill=WHITE, line=c, lw=1,
             shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        tb(s, 8.28, y + 0.07, 0.6, 0.22, sev, size=8, color=c, align=PP_ALIGN.CENTER)
        tb(s, 9.05, y, 3.4, 0.3, d, size=11)
    rect(s, 0.9, 6.2, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 6.42, 11.5, 0.35,
       '另附 3 个自研静态检查脚本：页面四件套引用 · WXML 绑定 ↔ 页面方法 · 纯逻辑冒烟（10 例）',
       size=11, color=MUTED)
    notes(s, '35 秒：不要逐条念缺陷。点出"两个严重的都在数据模型层，不是靠改 UI 修好的"。')

    # ---------- 12 总结 ----------
    s = base(prs, '08 / 收尾', '做完的，和没做完的', 12)
    tb(s, 0.9, 2.3, 5.4, 0.32, '做完的', size=12, color=GREEN)
    rect(s, 0.9, 2.62, 0.55, 0.028, fill=GREEN)
    tb(s, 0.9, 2.9, 5.4, 2.8,
       '· 会话按对手方唯一，同一卖家只有一个窗口\n'
       '· 历史脏数据完成修复，消息一条不少\n'
       '· 管理员与普通用户功能完全一致，只多一个控制台\n'
       '· 42 条测试用例 + 3 个自研检查脚本固化质量流程',
       size=12.5, color=RGBColor(0x3D, 0x44, 0x4F), line=2.0)
    tb(s, 6.95, 2.3, 5.4, 0.32, '没做完的', size=12, color=ORANGE)
    rect(s, 6.95, 2.62, 0.55, 0.028, fill=ORANGE)
    tb(s, 6.95, 2.9, 5.4, 2.8,
       '· 交易模块（下单 / 评价 / 封禁联动）未完成真机全流程验证\n'
       '· 云存储免费版私有读，图片只能走 base64，长期应换付费版\n'
       '· 会话数量很大时列表响应体积未压测',
       size=12.5, color=RGBColor(0x3D, 0x44, 0x4F), line=2.0)
    rect(s, 0.9, 5.95, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 6.25, 7, 0.6, 'Q & A', size=26, bold=True)
    tb(s, 3.4, 6.42, 8, 0.4, '代码与测试文档：github.com/Zion-17/xiaoyuanershou', size=11, color=MUTED)
    notes(s, '30 秒收尾：主动说没做完的部分。老师更愿意问"你怎么知道没做完"，'
             '而不是替你发现。')

    prs.save(OUT)
    print('saved:', OUT)


if __name__ == '__main__':
    build()
