const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/media.js': ['media.js', 'text/javascript; charset=utf-8'],
  '/planner.js': ['planner.js', 'text/javascript; charset=utf-8'],
};

const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_CHARS = 29 * 1024 * 1024;
const MAX_PROMPT_CHARS = 16000;
const IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/edits';

function respond(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      ...headers,
    },
  });
}

function json(value, status = 200, headers = {}) {
  return respond(JSON.stringify(value), status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
}

function failure(message, status) {
  return json({ error: message }, status);
}

function methodNotAllowed(allowed) {
  return json({ error: '此接口不支持当前请求方式。' }, 405, { Allow: allowed });
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: '请求内容必须为 JSON 对象。' };
  }
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) {
    return { error: '请先填写画面设计说明。' };
  }
  if (input.prompt.length > MAX_PROMPT_CHARS) {
    return { error: `画面设计说明最多 ${MAX_PROMPT_CHARS} 个字符。` };
  }
  if (!['1:1', '3:4'].includes(input.ratio)) {
    return { error: '图片比例请选择 1:1 或 3:4。' };
  }
  if (!['medium', 'high'].includes(input.quality)) {
    return { error: '图片质量请选择 medium 或 high。' };
  }
  if (!Array.isArray(input.images) || input.images.length < 1 || input.images.length > MAX_IMAGES) {
    return { error: `请提供 1 至 ${MAX_IMAGES} 张产品参考图。` };
  }
  let totalBytes = 0;
  for (const image of input.images) {
    if (typeof image !== 'string') return { error: '参考图必须为 PNG、JPEG 或 WebP 格式。' };
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!match || match[2].length % 4 !== 0) {
      return { error: '参考图必须为有效的 PNG、JPEG 或 WebP Base64 图片。' };
    }
    const base64 = match[2];
    totalBytes += base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (totalBytes > MAX_IMAGE_BYTES) {
      return { error: '参考图总大小不能超过 20 MB，请压缩后重试。', status: 413 };
    }
  }
  return { value: { prompt: input.prompt.trim(), images: input.images, ratio: input.ratio, quality: input.quality } };
}

function providerError(status) {
  if (status === 401 || status === 403) return '绘图服务认证失败，请检查服务端 API Key、项目权限及模型访问权限。';
  if (status === 429) return '绘图服务额度不足或请求过于频繁，请检查账户额度后稍后重试。';
  if (status === 400 || status === 422) return '绘图服务未能接受本次图片或设计说明，请检查参考图和模型配置后重试。';
  if (status >= 500) return '绘图服务暂时不可用，请稍后重试。';
  return '绘图服务未能完成请求，请检查服务端模型配置后重试。';
}

async function generate(request, env) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return failure('为保护产品图片，仅允许在本站发起生成请求。', 403);
  }
  if (!env.OPENAI_API_KEY || typeof env.OPENAI_API_KEY !== 'string' || !env.OPENAI_API_KEY.trim()) {
    return failure('尚未配置绘图服务。请在部署平台的服务端环境变量中配置 OPENAI_API_KEY 后再生成；密钥不会保存在浏览器。', 503);
  }
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return failure('请使用 JSON 格式提交生成请求。', 415);
  }
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_REQUEST_CHARS) return failure('提交内容过大，请将参考图总大小压缩至 20 MB 内。', 413);
  let input;
  try {
    const raw = await request.text();
    if (raw.length > MAX_REQUEST_CHARS) return failure('提交内容过大，请将参考图总大小压缩至 20 MB 内。', 413);
    input = JSON.parse(raw);
  } catch {
    return failure('请求内容不是有效的 JSON，请刷新页面后重试。', 400);
  }
  const validated = validateInput(input);
  if (validated.error) return failure(validated.error, validated.status || 400);
  const { prompt, images, ratio, quality } = validated.value;
  const model = env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  const payload = {
    model,
    images: images.map(image_url => ({ image_url })),
    prompt,
    n: 1,
    size: ratio === '3:4' ? '1024x1536' : '1024x1024',
    quality,
    output_format: 'png',
  };
  if (model === 'gpt-image-1.5') payload.input_fidelity = 'high';
  let upstream;
  try {
    upstream = await fetch(IMAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return failure('本张图片生成超时，请稍后重试。', 504);
    }
    return failure('无法连接绘图服务，请检查网络和服务端配置后重试。', 502);
  }
  // Upstream bodies may contain sensitive diagnostic data. Never echo or log them.
  if (!upstream.ok) return failure(providerError(upstream.status), upstream.status === 429 ? 429 : 502);
  let result;
  try {
    result = await upstream.json();
  } catch {
    return failure('绘图服务返回了无法读取的结果，请重试。', 502);
  }
  const encoded = result?.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    return failure('绘图服务没有返回可用图片，请检查模型配置后重试。', 502);
  }
  return json({ dataUrl: `data:image/png;base64,${encoded}` });
}

export default {
  async fetch(request, env = {}) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/status') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const configured = !!(typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim());
      return json({
        configured,
        provider: 'OpenAI',
        model: env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
        message: configured
          ? '服务端密钥已配置，可先测试一张图确认连接和权限。'
          : '尚未配置服务端 OPENAI_API_KEY。可先上传产品、设计分镜并导出方案；配置后即可生成图片。',
      });
    }
    if (pathname === '/api/generate') {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      return generate(request, env);
    }
    if (STATIC_FILES[pathname]) {
      if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed('GET, HEAD');
      const [filename, type] = STATIC_FILES[pathname];
      const embedded = typeof assets === 'undefined' ? {} : assets;
      if (typeof embedded[filename] !== 'string') return failure('页面资源尚未构建。', 404);
      return respond(request.method === 'HEAD' ? null : embedded[filename], 200, { 'Content-Type': type });
    }
    return failure('未找到此页面。', 404);
  },
};
