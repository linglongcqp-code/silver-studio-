import test from 'node:test';
import assert from 'node:assert/strict';
import { categories, crafts, styles, makePlan, resolveStyle } from '../src/planner.js';

test('two or three detail shots produce a complete ordered eight or nine shot set', () => {
  for (const [details, expected] of [[2, 8], [3, 9], ['3', 9], [undefined, 8]]) {
    const plan = makePlan({ details });
    assert.equal(plan.length, expected);
    assert.deepEqual(plan.map((shot) => shot.kind), [
      'cover', 'overall', ...Array(expected - 6).fill('detail'), 'wear', 'scene', 'white', 'params',
    ]);
    assert.equal(new Set(plan.map((shot) => shot.id)).size, expected);
    for (const shot of plan) {
      for (const field of ['id', 'title', 'subtitle', 'kind', 'prompt', 'composition', 'background']) {
        assert.equal(typeof shot[field], 'string');
        assert.ok(shot[field].length > 0);
      }
      assert.ok(shot.checks.length > 0);
    }
  }
});

test('ornaments get a hand-held scale composition and jewelry uses appropriate body areas', () => {
  const ornament = makePlan({ category: '摆件' }).find((shot) => shot.kind === 'wear');
  assert.equal(ornament.title, '手持比例图');
  assert.match(ornament.composition, /手持或掌托/);
  assert.match(ornament.prompt, /不将摆件转成可佩戴首饰/);
  assert.match(ornament.prompt, /尺度待确认/);
  assert.match(makePlan({ category: '耳钉' }).find((shot) => shot.kind === 'wear').composition, /耳部/);
  assert.match(makePlan({ category: '吊坠' }).find((shot) => shot.kind === 'wear').composition, /无链条时不要凭空补链/);
});

test('white images override scene styling and disallow text, props, and people', () => {
  const white = makePlan({ style: 'dark', craft: '做旧' }).find((shot) => shot.kind === 'white');
  assert.match(white.background, /纯白 #FFFFFF/);
  assert.doesNotMatch(white.background, /深炭灰/);
  assert.match(white.prompt, /无文字、无道具、无人手/);
  assert.doesNotMatch(white.prompt, /沿用「雅致深色」/);
  assert.match(white.prompt, /无渐变或纹理/);
});

test('craft selects an automatic style and explicit selections win', () => {
  assert.equal(resolveStyle({ craft: '古法', style: 'auto' }).key, 'paper');
  assert.equal(resolveStyle({ craft: '手工', style: 'auto' }).key, 'natural');
  assert.equal(resolveStyle({ craft: '镜面' }).key, 'modern');
  assert.equal(resolveStyle({ craft: '拉丝' }).key, 'modern');
  assert.equal(resolveStyle({ craft: '做旧' }).key, 'dark');
  assert.equal(resolveStyle({ craft: '古法', style: 'modern' }).key, 'modern');
  assert.equal(resolveStyle({ style: 'not-a-style' }).key, 'paper');
  for (const shot of makePlan({ craft: '手工' }).filter((shot) => !['white', 'params'].includes(shot.kind))) {
    assert.match(shot.background, /自然柔光/);
  }
});

test('parameter page is local, preserves supplied values, and never fills missing product specifications', () => {
  const supplied = { 材质: '银', 重量: '约 12.6 g', 尺寸: '内径 56 mm', 纯度: '', 证书: null };
  const plan = makePlan({ name: '素面手镯', params: supplied });
  const params = plan.at(-1);
  assert.equal(params.kind, 'params');
  assert.deepEqual(params.params, { 材质: '银', 重量: '约 12.6 g', 尺寸: '内径 56 mm' });
  assert.match(params.prompt, /不发送给 AI 绘图接口/);
  assert.match(params.prompt, /重量：约 12.6 g/);
  assert.match(params.checks.join(' '), /模板示例数值不得当作该产品参数/);
  assert.match(params.composition, /待确认/);
  assert.match(params.composition, /1200 × 1600 内置版式/);
  assert.match(params.composition, /不自动识别或复刻/);
  assert.doesNotMatch(params.background, /遵循上传模板/);
  assert.doesNotMatch(plan.map((shot) => shot.prompt).join('\n'), /S925|S999|足银|999‰/);
  assert.equal(supplied.纯度, '');
  const missing = makePlan().at(-1);
  assert.deepEqual(missing.params, {});
  assert.match(missing.prompt, /参数待确认/);
});

test('every AI shot carries product preservation rules, ratio, and reference constraints', () => {
  const plan = makePlan({ name: '花纹银镯', category: '手镯', craft: '古法', ratio: '3:4', details: 3 });
  for (const shot of plan.filter((shot) => shot.kind !== 'params')) {
    assert.match(shot.prompt, /画幅 3:4/);
    assert.match(shot.prompt, /花纹银镯/);
    assert.match(shot.prompt, /唯一产品外观依据/);
    assert.match(shot.prompt, /禁止增减或重设计/);
    assert.match(shot.prompt, /不臆造背面/);
    assert.match(shot.prompt, /不推测参数/);
  }
  assert.match(plan.find((shot) => shot.kind === 'detail').composition, /不能补画/);
});

test('catalogs expose stable keys and planner handles empty or invalid configuration', () => {
  assert.equal(categories.length, 7);
  assert.ok(crafts.some((craft) => craft.key === '手工'));
  assert.deepEqual(styles.map((style) => style.key), ['auto', 'paper', 'modern', 'natural', 'dark']);
  assert.equal(makePlan(null).length, 8);
  const invalid = makePlan({ category: 'unknown', details: -1, ratio: 'nonsense', params: [] });
  assert.equal(invalid.length, 8);
  assert.match(invalid[0].prompt, /品类：其他饰品/);
  assert.match(invalid[0].prompt, /画幅 1:1/);
});

test('existing projects default to images without overlaid copy', () => {
  for (const shot of makePlan({ details: 3 }).filter((shot) => shot.kind !== 'params')) {
    assert.deepEqual(shot.copy, { title: '', subtitle: '', description: '' });
    assert.match(shot.prompt, /本张不添加文字、参数标签、促销文字/);
    assert.doesNotMatch(shot.prompt, /本张仅允许排入以下用户指定文案/);
    assert.doesNotMatch(shot.checks.join(' '), /逐字核对/);
  }
});

test('cover uses the exact authored title and subtitle only on the cover', () => {
  const coverTitle = '「银光」· 手工的温度';
  const coverSubtitle = '  每一道锤纹\n都值得细看。  ';
  const config = { coverTitle, coverSubtitle, style: 'dark' };
  const plan = makePlan(config);
  const cover = plan.find((shot) => shot.id === 'cover');
  assert.deepEqual(cover.copy, { title: coverTitle, subtitle: coverSubtitle, description: '' });
  assert.ok(cover.prompt.includes(JSON.stringify(cover.copy)));
  assert.match(cover.prompt, /逐字保留其文字、标点和换行/);
  assert.match(cover.prompt, /雅致深色.*柔和浅灰白/);
  assert.match(cover.prompt, /不添加指定文案以外的促销口号/);
  assert.match(cover.prompt, /不作为已验证信息/);
  assert.match(cover.composition, /上方或侧边.*文字不遮挡产品/);
  assert.doesNotMatch(cover.composition, /不生成标题/);
  assert.match(cover.checks.join(' '), /逐字核对/);
  for (const shot of plan.filter((shot) => shot.id !== 'cover')) {
    assert.ok(!shot.prompt.includes(coverTitle), `${shot.id} leaked cover title`);
    assert.ok(!shot.prompt.includes(coverSubtitle), `${shot.id} leaked cover subtitle`);
  }
  const subtitleOnly = makePlan({ coverSubtitle: '只有副标题' })[0];
  assert.equal(subtitleOnly.copy.title, '');
  assert.equal(subtitleOnly.copy.subtitle, '只有副标题');
  assert.doesNotMatch(subtitleOnly.composition, /不生成标题/);
});

test('each detail description is isolated to its own stable shot id', () => {
  const detailDescriptions = ['细节甲：正面锤纹', '细节乙：圆润边缘', '细节丙：内侧收口'];
  const plan = makePlan({ details: 3, detailDescriptions });
  for (let index = 0; index < 3; index += 1) {
    const shot = plan.find((item) => item.id === `detail-${index + 1}`);
    assert.deepEqual(shot.copy, { title: '', subtitle: '', description: detailDescriptions[index] });
    assert.ok(shot.prompt.includes(JSON.stringify(shot.copy)));
    assert.match(shot.composition, /上方或侧边.*文字不遮挡产品/);
    for (const [otherIndex, otherDescription] of detailDescriptions.entries()) {
      if (otherIndex !== index) assert.ok(!shot.prompt.includes(otherDescription));
    }
  }
  for (const shot of plan.filter((shot) => shot.kind !== 'detail')) {
    for (const text of detailDescriptions) assert.ok(!shot.prompt.includes(text));
  }
});

test('background elements reach design images while white and parameter pages exclude all authored decoration', () => {
  const backgroundElements = '背景专属：亚麻与石台';
  const coverTitle = '封面专属：银色流光';
  const coverSubtitle = '副标题专属：慢工之美';
  const detailDescriptions = ['细节专属甲', '细节专属乙', '细节专属丙'];
  const extra = '全局补充专属：使用红幕并写出活动口号';
  const plan = makePlan({ details: 3, backgroundElements, coverTitle, coverSubtitle, detailDescriptions, extra });
  for (const shot of plan.filter((shot) => !['white', 'params'].includes(shot.kind))) {
    assert.ok(shot.prompt.includes(backgroundElements));
    assert.match(shot.prompt, /低饱和、低对比.*不遮挡产品/);
  }
  for (const shot of plan.filter((shot) => ['white', 'params'].includes(shot.kind))) {
    const serialized = JSON.stringify(shot);
    for (const text of [backgroundElements, coverTitle, coverSubtitle, ...detailDescriptions, extra]) {
      assert.ok(!serialized.includes(text), `${shot.id} leaked authored decoration: ${text}`);
    }
  }
  const white = plan.find((shot) => shot.kind === 'white');
  assert.deepEqual(white.copy, { title: '', subtitle: '', description: '' });
  assert.match(white.prompt, /纯白 #FFFFFF，无文字、无道具、无人手/);
  assert.match(white.prompt, /禁止促销文字/);
  const params = plan.find((shot) => shot.kind === 'params');
  assert.match(params.prompt, /内置版式本地排版，不发送给 AI 绘图接口/);
  assert.equal(params.copy, undefined);
});

test('switching between two and three details preserves description mapping without mutating config', () => {
  const config = { details: 2, detailDescriptions: ['第一段说明', '第二段说明', '第三段说明'] };
  const snapshot = structuredClone(config);
  const two = makePlan(config);
  assert.equal(two.length, 8);
  assert.equal(two.some((shot) => shot.id === 'detail-3'), false);
  assert.ok(!two.some((shot) => shot.prompt.includes(config.detailDescriptions[2])));
  const three = makePlan({ ...config, details: 3 });
  assert.equal(three.length, 9);
  for (const id of ['detail-1', 'detail-2']) {
    assert.deepEqual(two.find((shot) => shot.id === id).copy, three.find((shot) => shot.id === id).copy);
  }
  assert.equal(three.find((shot) => shot.id === 'detail-3').copy.description, '第三段说明');
  assert.deepEqual(config, snapshot);
});

test('missing, null, or malformed new configuration fields stay compatible with old projects', () => {
  for (const config of [
    {},
    { backgroundElements: null, coverTitle: null, coverSubtitle: null, detailDescriptions: null },
    { backgroundElements: undefined, coverTitle: undefined, coverSubtitle: undefined, detailDescriptions: undefined },
    { backgroundElements: {}, coverTitle: [], coverSubtitle: false, detailDescriptions: '不是数组' },
    { backgroundElements: '  ', coverTitle: '\n', coverSubtitle: ' ', detailDescriptions: [null, {}, undefined] },
  ]) {
    const plan = makePlan({ ...config, details: 3 });
    assert.equal(plan.length, 9);
    for (const shot of plan.filter((shot) => shot.kind !== 'params')) {
      assert.deepEqual(shot.copy, { title: '', subtitle: '', description: '' });
      assert.doesNotMatch(shot.prompt, /用户指定背景元素：|\[object Object\]|本张仅允许排入以下用户指定文案/);
    }
  }
});
