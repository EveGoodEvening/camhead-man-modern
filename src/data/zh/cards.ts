// src/data/zh/cards.ts — owner F. GDD §10.1 chapter cards (+ the S_wake epigraph), §10.5 聊斋卡, §15 photo card,
// epilogues and credits. Card ids: chapter cards = CHAPTERS[].cardId + 'epigraph'; liaozhai 'xu' 'juan1' 'juan2'
// 'juan3' 'zhong_A' 'zhong_B'; photo 'ph_2026_group'. Liaozhai `body` paragraphs are separated by '\n'; the last
// paragraph is always the 「拍客曰」 line. CREDITS: '' = blank line; '{n}' = bestiary count (at 6/6 E appends
// t('sys.credits.full') right after that line).
export interface CardText { title: string; subtitle?: string; body?: string; seal?: string }

export const CARDS: Readonly<Record<string, CardText>> = {
  // S_wake step 2: black screen, epigraph (3 s)
  epigraph: { title: '昔者仓颉作书，而天雨粟，鬼夜哭。', subtitle: '——《淮南子·本经训》' },
  // GDD §10.1 chapter cards (seal characters per §10.1: 醒 脸 眼 影 合)
  prologue: { title: '序章 · 醒', subtitle: '9月29日 06:10', seal: '醒' },
  ch1: { title: '第一章 · 无脸', subtitle: '9月29日 10:00', seal: '脸' },
  ch2: { title: '第二章 · 开眼', subtitle: '9月29日 17:40', seal: '眼' },
  ch3: { title: '第三章 · 显影', subtitle: '9月29日 22:00', seal: '影' },
  finale: { title: '终章 · 合影', subtitle: '9月30日 05:40', seal: '合' },
  // GDD §10.5 聊斋卡
  xu: {
    title: '序卷 · 无面客',
    body: '望潮里，海隅小邑也，明日将拆。晨有客卧候车亭中，首方而扁，背有微光，面无耳目，唯三珠嵌焉。或问其姓字，客背上现字曰：「面容无法识别。」客亦自惘然。独持旧照一帧，照中数十人，皆无面。\n'
      + '拍客曰：终日对屏者，屏亦对之。久之，不知谁照谁矣。',
    seal: '显影',
  },
  juan1: {
    title: '卷一 · 取件',
    body: '邻里柜第十七格，有物寄存千又九十六日，无人来取。取件之码，惟发一人之手机，而其人终日低首，未尝一顾。是日客登天桥，信号满格，其信始至。或曰：客忆船号零八一五，试之，柜应声开。启之，得钥一串、字一纸，纸上名已漫漶。后借邻妪之面，过人面之门，门曰：「请眨眼。」\n'
      + '拍客曰：世间至远之途，不在山海，在一条未读之信。',
    seal: '显影',
  },
  juan2: {
    title: '卷二 · 开眼',
    body: '山顶土地祠，木像无面。人谓香火所熏，土地自言：「非也，无人来看，看淡耳。」客扫码得旧照，立左狮之侧，以三倍之镜复摄之，像面乃还。土地喜，开其夜眼。客临巷口凸镜自照，镜中识之曰：「手机九十七，人三。」\n'
      + '拍客曰：神亦待人看而后有面，况人乎。',
    seal: '显影',
  },
  juan3: {
    title: '卷三 · 拆变折',
    body: '望潮里有字妖曰拆，朱圈白底，昼伏夜行，所过之处，照中人面尽失。其右一点喷歪，悬于网上，惟自路中望之，方成拆字。客夜立地铁口石级之上，借路灯之罩掩其一点，摄之，照中乃「折」也。俄而满街拆字皆为折，旧照诸面复还。\n'
      + '拍客曰：拆者去之，折者携之。',
    seal: '显影',
  },
  zhong_A: {
    title: '终卷 · 回家',
    body: '客冲卷于暗室，得接片四格，中有粉笔一叉，其父所留也。黎明，街坊人鬼咸集天桥之阶。客摘首置三脚架上，驱无首之身，十息之内立于叉上。闪光既过，照中始见一人有面，眉目类其父。时有零路车至，客登之。末班车中，有人醒焉，自扪其面，有须。\n'
      + '拍客曰：拍照之人，不在照中。今日始在。',
    seal: '显影',
  },
  zhong_B: {
    title: '终卷 · 守望',
    body: '客既得面，车至而不登。其身卧末班车中，酣睡不复醒，手中机余电百分之一，俄而屏黑。土地老矣，遂以望潮里付之。日出，推土机穿其魂而过，人皆不觉。后数年，其地起新楼，广场灯杆上有摄像头一具，屏上画一笑面，每逢有人合影，其灯辄一眨。土地之号，自此改作「望潮里土地（周）」。\n'
      + '拍客曰：有人离乡而归，有人归而不离，皆是留影。',
    seal: '显影',
  },
  // GDD §15 photo card caption (hand font)
  ph_2026_group: { title: '二〇二六年九月三十日 · 望潮里全街合影' },
};

/** GDD §15.1 / §15.2 epilogue lines (one line every 1.6 s). */
export const EPILOGUE: Readonly<Record<'A' | 'B', readonly string[]>> = {
  A: [
    '06:15。',
    '一辆真的公交车，停在一片工地前。',
    '周远下了车。',
    '他摸了摸自己的脸。有鼻子，有嘴，有一点胡茬。',
    '手机电量 1%。它撑到了。',
    '屏幕上，是一张合影。',
    '微信响了一声。',
    '「路上慢点。」',
    '他打了两个字，发出去。',
    '「对方已不是你的好友。」',
    '他站了一会儿。',
    '然后转过身，第一次打开前置镜头，',
    '把自己和身后的废墟，拍进了同一张照片。',
  ],
  B: [
    '他没有上车。',
    '同一时刻，末班车开到了终点站。靠窗那个乘客没有醒。',
    '他的手机停在 1%，然后黑了屏。',
    '六点整，推土机开进望潮里。它从他身上穿了过去，谁也没有察觉。',
    '后来，这里盖起了新楼，修了广场。',
    '广场的灯杆上装了一个摄像头。',
    '它的屏幕上，画着一张小小的笑脸。',
    '每当有人在广场上拍合影，',
    '摄像头的指示灯，就会眨一下。',
    '望潮里土地的微信名，改成了「望潮里土地（周）」。',
  ],
};

/** GDD §15.3 credits (scroll 40 px/s; stops on 「显影」). */
export const CREDITS: readonly string[] = [
  '显影',
  '望潮里志怪',
  '',
  '—',
  '',
  '策划 · 程序 · 美术',
  '显影制作组',
  '',
  '引擎',
  'three.js',
  '',
  '字体',
  '均为 SIL Open Font License',
  '经 Google Fonts 提供',
  '站酷庆科黄油体 ZCOOL QingKe HuangYou',
  '站酷快乐体 ZCOOL KuaiLe',
  '龙藏体 Long Cang',
  '马善政毛笔楷书 Ma Shan Zheng',
  'Silkscreen',
  '',
  '画面风格致敬',
  'Messenger（abeto）',
  '仅参考风格，未使用其任何素材',
  '',
  '题词',
  '《淮南子·本经训》',
  '',
  '—',
  '',
  '谨以此作',
  '献给所有还没来得及冲洗的胶卷',
  '和所有站在镜头后面的人',
  '',
  '—',
  '',
  '怪谈录 {n}/6',
  '',
  '谢谢游玩。',
  '',
  '显影',
];
