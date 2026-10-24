/** Silver Studio: deterministic shot planning. No network calls or API credentials. */
export const categories = [
  { key: '手镯', name: '手镯', wear: '腕部佩戴图' },
  { key: '手链', name: '手链', wear: '腕部佩戴图' },
  { key: '摆件', name: '摆件', wear: '手持比例图' },
  { key: '吊坠', name: '吊坠', wear: '颈部佩戴图' },
  { key: '耳钉', name: '耳钉', wear: '耳部佩戴图' },
  { key: '戒指', name: '戒指', wear: '手部佩戴图' },
  { key: '其他饰品', name: '其他饰品', wear: '上手展示图' },
];

export const crafts = [
  { key: '古法', name: '古法' },
  { key: '手工', name: '手工' },
  { key: '镜面', name: '镜面' },
  { key: '拉丝', name: '拉丝' },
  { key: '做旧', name: '做旧' },
  { key: '其他', name: '其他' },
];

export const styles = [
  {
    key: 'auto', name: '智能匹配',
    description: '按工艺匹配克制的背景与光线，同套图片保持一致。',
    colors: ['#E9E4DB', '#D2C9BC', '#F7F5F0'],
  },
  {
    key: 'paper', name: '古法素境',
    description: '暖灰、米白与低对比素纸肌理，柔和侧光呈现温润银质。',
    colors: ['#E8E3D9', '#C6BDAE', '#F5F2EB'],
  },
  {
    key: 'modern', name: '现代冷灰',
    description: '浅冷灰、清晰留白与大面积柔光，控制高光以保留金属轮廓。',
    colors: ['#E9ECEE', '#BBC4CA', '#F7F8F8'],
  },
  {
    key: 'natural', name: '自然柔光',
    description: '浅米色、柔和日光与细腻素面，低饱和呈现手工质感。',
    colors: ['#E8E3D8', '#C7CBBE', '#F7F5F0'],
  },
  {
    key: 'dark', name: '雅致深色',
    description: '低饱和深炭灰与柔和轮廓光，保留银饰暗部细节，背景不抢主体。',
    colors: ['#33383A', '#575E5D', '#BFC4C1'],
  },
];

const clean = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const result = String(value).trim();
  return result || fallback;
};

// Keep authored copy verbatim, including punctuation and line breaks. Older projects
// have none of these fields; malformed values should never become visible copy.
const authoredText = (value) => typeof value === 'string' && value.trim() ? value : '';
const emptyCopy = () => ({ title: '', subtitle: '', description: '' });

const categoryFor = (value) => categories.find((item) => item.key === value) || categories.at(-1);
const craftFor = (value) => crafts.find((item) => item.key === value) || crafts.at(-1);

/** Explicit style wins. Automatic styles are selected by declared craft only. */
export function resolveStyle(config = {}) {
  config ||= {};
  const explicit = styles.find((style) => style.key === config.style && style.key !== 'auto');
  if (explicit) return explicit;
  const byCraft = {
    古法: 'paper', 手工: 'natural', 镜面: 'modern', 拉丝: 'modern', 做旧: 'dark', 其他: 'paper',
  };
  const key = byCraft[config.craft] || 'paper';
  return styles.find((style) => style.key === key);
}

function suppliedParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return {};
  return Object.fromEntries(
    Object.entries(params)
      .filter(([key, value]) => clean(key) && value !== null && value !== undefined && clean(value))
      .map(([key, value]) => [clean(key), clean(value)]),
  );
}

const detailSubjects = {
  手镯: ['表面纹样与工艺', '镯身边缘与内侧', '实拍可见的收口与结构'],
  手链: ['链身纹样与工艺', '链节连接与边缘', '实拍可见的收口与结构'],
  摆件: ['主体纹样与肌理', '底部与侧面结构', '实拍可见的雕刻与转折'],
  吊坠: ['正面纹样与工艺', '侧面厚度与边缘', '实拍可见的连接与背面'],
  耳钉: ['正面造型与工艺', '侧面轮廓与边缘', '实拍可见的耳针与背部结构'],
  戒指: ['戒面纹样与工艺', '戒壁边缘与内侧', '实拍可见的收口与结构'],
  其他饰品: ['主体纹样与工艺', '侧面轮廓与边缘', '实拍可见的背面与连接结构'],
};

const wearCompositions = {
  手镯: '局部腕部佩戴特写，手势自然，镯体完整清晰，避免手指遮挡主体；不额外叠戴其他首饰。',
  手链: '局部腕部佩戴特写，手链沿腕部自然垂落，只使用实拍已有的链节与配件，不叠戴其他首饰。',
  摆件: '自然手持或掌托摆件，完整保留产品轮廓，让手作为参照物；不将摆件转成可佩戴首饰。',
  吊坠: '裁切至颈部与锁骨的佩戴近景，吊坠居中且完整；只使用参考图已有链条，无链条时不要凭空补链。',
  耳钉: '单侧耳部佩戴近景，产品清晰且无遮挡，真实表现耳钉的朝向与接触位置，不添加第二款首饰。',
  戒指: '自然手部佩戴近景，戒指结构完整且无遮挡；手指数量和关节自然，不叠戴其他戒指。',
  其他饰品: '自然手持的局部展示，完整保留产品，未经确认不改变成另一种佩戴用途。',
};

/**
 * Returns eight or nine shots in fixed order. `params` is a local layout only.
 * Each generated shot includes complete prompt constraints so it can be retried independently.
 */
export function makePlan(config = {}) {
  config ||= {};
  const name = clean(config.name, '未命名银饰');
  const category = categoryFor(config.category);
  const craft = craftFor(config.craft);
  const style = resolveStyle(config);
  const ratio = config.ratio === '3:4' ? '3:4' : '1:1';
  const detailCount = Number(config.details) === 3 ? 3 : 2;
  const params = suppliedParams(config.params);
  const parameterText = Object.keys(params).length
    ? Object.entries(params).map(([key, value]) => `${key}：${value}`).join('；')
    : '参数待确认';
  const points = clean(config.sellingPoints);
  const extra = clean(config.extra);
  const backgroundElements = authoredText(config.backgroundElements);
  const coverCopy = {
    ...emptyCopy(),
    title: authoredText(config.coverTitle),
    subtitle: authoredText(config.coverSubtitle),
  };
  const detailDescriptions = Array.isArray(config.detailDescriptions)
    ? Array.from({ length: 3 }, (_, index) => authoredText(config.detailDescriptions[index]))
    : ['', '', ''];
  const background = `${style.name}：${style.description}`;
  const checks = [
    '与实拍逐项核对造型、纹样、链节数量、配件和结构，禁止增减或重设计。',
    '保留真实银色与工艺肌理；不过度磨皮，不改变材质，不生成金色。',
    '只展示参考图清楚可见的细节，不臆造背面、结构、宝石、镶嵌或品牌。',
    '背景低饱和、低对比，主体清晰，不以道具遮挡产品。',
    '尺寸、重量、纯度、材质、工艺与功效只使用已确认信息，不推测参数。',
  ];
  const base = [
    `任务：为「${name}」制作真实银饰电商展示图；品类：${category.name}；用户声明工艺：${craft.name}；画幅 ${ratio}。`,
    '以上传的同一款多角度实拍图为唯一产品外观依据，选用最匹配视角，不把不同视角拼成新结构。',
    `已提供参数：${parameterText}。只作约束依据，未提供的参数保持待确认，不自行补充。`,
    ...checks,
    '如实拍含有产品刻印，保持其原有位置与形状，不能重新编造；不添加商标或水印。',
    points ? `用户提供的卖点：${points}。仅表现与实拍或确认参数一致的部分，不将其扩写为认证或功效。` : '',
  ].filter(Boolean).join('\n');

  function shot(id, title, subtitle, kind, composition, opts = {}) {
    const shotBackground = opts.background || background;
    const copy = kind === 'white' ? emptyCopy() : { ...emptyCopy(), ...opts.copy };
    const hasCopy = Object.values(copy).some(Boolean);
    const layout = hasCopy
      ? '在上方或侧边预留独立文字留白，文字不遮挡产品、纹理或配件，产品仍是视觉主角。'
      : '';
    const shotComposition = [composition, layout].filter(Boolean).join('');
    const textRule = hasCopy
      ? [
        `本张仅允许排入以下用户指定文案，逐字保留其文字、标点和换行，不改写、不翻译、不补写空字段：${JSON.stringify(copy)}。`,
        `文字使用简洁易读的中文字体，颜色跟随「${style.name}」风格，采用${style.key === 'dark' ? '柔和浅灰白 #F1F2EF' : '克制深灰 #3F4742'}并保证可读性；标题、次级文案层次清楚，字号克制。`,
        '不添加指定文案以外的促销口号、参数标签、额外文字、商标或水印；产品原有刻印按实拍保留。',
        '指定文案只是用户提供的排版文字，其中的纯度、材质、认证或功效不作为已验证信息，也不能据此改动产品或推导参数；最终需用户核对真实性。',
      ].join('\n')
      : '本张不添加文字、参数标签、促销文字、商标或水印；产品原有刻印按实拍保留。其他画面的文案不适用于本张。';
    return {
      id, title, subtitle, kind, composition: shotComposition, background: shotBackground, copy,
      checks: [...checks, ...(opts.checks || []), ...(hasCopy ? [
        '逐字核对本张指定文案的文字、标点与换行，不漏字、不增字，不遮挡产品。',
        '文案不视为已验证的纯度、材质、认证或功效，导出前由用户确认真实性。',
      ] : [])],
      prompt: [
        base,
        kind !== 'white' && extra
          ? `用户补充要求：${extra}。以产品保真和本张指定文字规则优先，不能借此添加其他画面的文案。`
          : '',
        `分镜：${title}。${subtitle}`,
        `构图：${shotComposition}`,
        `背景与光线：${shotBackground}`,
        kind !== 'white' && backgroundElements
          ? `用户指定背景元素：${JSON.stringify(backgroundElements)}。仅用于背景或少量陪衬，以低饱和、低对比呈现，面积和清晰度让位于产品，不遮挡产品，不把背景元素变成产品配件，不将其中的文字当作允许排入的文案。`
          : '',
        kind === 'white'
          ? '白底图专用约束：背景必须为纯白 #FFFFFF，无文字、无道具、无人手、无边框、无渐变或纹理，禁止促销文字，只允许产品底部轻微自然接触阴影。忽略全局补充要求中的背景与文字设计要求。'
          : `整套一致性：与其他分镜沿用「${style.name}」色调、光线方向和材质呈现；白底图与参数页按各自用途处理。`,
        opts.note || '',
        textRule,
      ].filter(Boolean).join('\n'),
    };
  }

  const plan = [
    shot('cover', '封面图', '第一眼看清产品，保留干净留白。', 'cover',
      '产品占画面约 65%～75%，完整轮廓位于视觉中心偏下，使用参考图中最能识别产品的视角，上方保留适度留白。'
        + (coverCopy.title || coverCopy.subtitle ? '' : '不生成标题。'), { copy: coverCopy }),
    shot('overall', '整体展示图', '清楚展示完整造型与结构。', 'overall',
      '采用实拍中信息最完整的正面或三分之四视角，主体占画面约 70%，轮廓全部在画面内；不把参考图未露出的结构补画出来。'),
  ];

  for (let index = 0; index < detailCount; index += 1) {
    const subject = detailSubjects[category.key][index];
    plan.push(shot(`detail-${index + 1}`, `细节展示 ${index + 1}`, subject, 'detail',
      `围绕「${subject}」选取一张确实拍清的局部，特写占画面约 75%～85%，保留足够轮廓让人理解位置。仅裁切或放大实拍已可辨认的细节；无法辨认时改用已有清晰局部，不能补画。`,
      {
        copy: { ...emptyCopy(), description: detailDescriptions[index] },
        checks: ['细节必须能在原实拍中逐一对应，不能凭工艺名称生成不存在的纹理。'],
      }));
  }

  plan.push(shot('wear', category.wear, category.key === '摆件' ? '用自然手持展示产品与手的关系。' : '展示真实使用状态与产品气质。', 'wear',
    wearCompositions[category.key], {
      note: '人体仅作陪衬，皮肤质感自然。按已提供尺寸校准比例；若无尺寸或佩戴参照，仅作为佩戴或手持示意，尺度待确认，不得据此推算或标注尺寸。',
      checks: ['核对人体结构、产品接触位置和遮挡关系；无尺寸依据时需人工确认比例。'],
    }));
  plan.push(shot('scene', '场景图', '少量环境衬托，产品始终是视觉主角。', 'scene',
    '产品占画面至少 60%，前景清晰；最多一个低对比小道具置于侧后方并轻度虚化，道具面积小于主体，不悬空、不遮挡，不加入与产品无关的复杂叙事。'));
  plan.push(shot('white', '白底图', '完整展示产品，便于上架与抠图。', 'white',
    '单款产品居中，占画面约 75%～85%，完整轮廓与所有随产品原有配件均在画面内，四周留出均匀边距；以实拍为依据，不增加其他物体。', {
      background: '纯白 #FFFFFF，均匀中性柔光，真实银色，边缘清晰，允许极轻自然接触阴影。',
      checks: ['纯白底，无文字、无道具、无人物、无渐变或纹理，产品轮廓完整。'],
    }));
  plan.push({
    id: 'params', title: '参数详情页', subtitle: '使用内置版式本地排版，模板原图仅作对照。', kind: 'params',
    composition: '以 1200 × 1600 内置版式本地排版，搭配产品主参考图与参数表。仅填入已提供的字段，缺失项显示“待确认”；上传模板仅保留原图供人工对照，不自动识别或复刻，参数可在表单中编辑确认。',
    background: '以浅色素面和清晰表格为主，使用真实文字与内置版式排版，可选温润米白或简洁白底。',
    checks: [
      '不调用 AI 绘图生成参数页文字，使用本地文字与表格排版。',
      '参数仅来自用户确认的数据，模板示例数值不得当作该产品参数。',
      '模板仅保留原图供人工对照，不自动识别模板字段或复刻模板版式。',
      '不推算纯度、重量、尺寸、产地、证书、价格或功效；缺失字段显示“待确认”。',
      '导出前逐项核对数值和单位。',
    ],
    prompt: `参数详情页使用 1200 × 1600 内置版式本地排版，不发送给 AI 绘图接口。产品：${name}。仅使用以下用户提供数据：${parameterText}。缺失项显示“待确认”，不补写数据；上传参数模板仅保留原图供人工对照，不自动识别或复刻，不沿用示例参数。`,
    params,
  });
  return plan;
}
