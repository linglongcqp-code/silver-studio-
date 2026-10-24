/** Browser-only, dependency-free media and local project helpers. */
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
const DB_NAME = '银作工作台';
const STORE_NAME = 'projects';

export function makeId() {
  return globalThis.crypto?.randomUUID?.() || `silver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error('图片没有有效尺寸，请换一张图片。'));
    img.onerror = () => reject(new Error('图片无法读取，请确认文件完整且格式为 PNG、JPEG 或 WEBP。'));
    img.src = source;
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取图片失败，请重新选择文件。'));
    reader.onabort = () => reject(new Error('图片读取已取消。'));
    reader.readAsDataURL(file);
  });
}

export async function readPhoto(file) {
  if (!(file instanceof Blob) || !file.size) throw new Error('请选择一张有效的图片。');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('单张图片不能超过 12 MB，请先压缩后再上传。');
  let bytes;
  try { bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer()); }
  catch { throw new Error('无法读取图片文件，请重新选择后重试。'); }
  const isPng = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!isPng && !isJpeg && !isWebp) throw new Error('仅支持 PNG、JPEG、WEBP 图片，暂不支持 HEIC、GIF、SVG 或其他格式。');
  const source = await readAsDataURL(file);
  const img = await loadImage(source);
  const scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法处理图片，请更新浏览器后重试。');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  let dataUrl;
  try {
    // PNG and WEBP are kept lossless so transparent product references stay transparent.
    dataUrl = canvas.toDataURL(isJpeg ? 'image/jpeg' : 'image/png', 0.95);
  } catch {
    throw new Error('图片处理失败，请压缩图片或更换浏览器后重试。');
  }
  return { id: makeId(), name: file.name || '产品实拍图', dataUrl, width, height, role: '正面', primary: false };
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function linesFor(ctx, value, maxWidth) {
  const output = [];
  for (const paragraph of String(value).replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) {
      if (line && ctx.measureText(line + char).width > maxWidth) {
        output.push(line);
        line = char;
      } else line += char;
    }
    output.push(line);
  }
  return output.length ? output : [''];
}

function clampLines(ctx, lines, count, width) {
  if (lines.length <= count) return lines;
  const result = lines.slice(0, count);
  let last = result[count - 1];
  while (last && ctx.measureText(last + '…').width > width) last = Array.from(last).slice(0, -1).join('');
  result[count - 1] = `${last}…`;
  return result;
}

function confirmedValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') return '待确认';
  return String(value).trim();
}

/** A locally typeset parameter page. Template images are references, never silently applied. */
export async function renderParameterPage(config = {}, photoDataUrl, templateDataUrl) {
  void templateDataUrl;
  if (!photoDataUrl) throw new Error('请先上传一张产品实拍图，再生成参数页。');
  const img = await loadImage(photoDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法生成参数页。');
  const warm = config.paramStyle === 'warm';
  const colors = warm
    ? { bg: '#f6f3ed', ink: '#343c37', muted: '#777c72', rule: '#deded4', accent: '#737e66', card: '#fffdfa' }
    : { bg: '#ffffff', ink: '#29352f', muted: '#7b847f', rule: '#e3e8e4', accent: '#697d70', card: '#f8faf8' };
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, 1200, 1600);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colors.ink;
  ctx.font = `500 27px ${FONT}`;
  ctx.fillText('银作 · 产品档案', 80, 91);
  ctx.fillStyle = colors.muted;
  ctx.font = `400 15px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('PRODUCT DETAILS', 1120, 89);
  ctx.textAlign = 'left';
  ctx.strokeStyle = colors.rule;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(80, 119); ctx.lineTo(1120, 119); ctx.stroke();

  let titleLines;
  let titleSize = 49;
  const title = String(config.name || '').trim() || '银饰产品';
  for (; titleSize >= 34; titleSize -= 3) {
    ctx.font = `500 ${titleSize}px ${FONT}`;
    titleLines = linesFor(ctx, title, 1040);
    if (titleLines.length <= 2) break;
  }
  titleLines = clampLines(ctx, titleLines, 2, 1040);
  ctx.fillStyle = colors.ink;
  titleLines.forEach((line, i) => ctx.fillText(line, 80, 187 + i * 54));

  const photoBox = { x: 80, y: 278, w: 1040, h: 524 };
  ctx.fillStyle = colors.card;
  roundedRect(ctx, photoBox.x, photoBox.y, photoBox.w, photoBox.h, 16);
  ctx.fill();
  const imageScale = Math.min((photoBox.w - 36) / img.naturalWidth, (photoBox.h - 36) / img.naturalHeight);
  const iw = img.naturalWidth * imageScale;
  const ih = img.naturalHeight * imageScale;
  ctx.save();
  roundedRect(ctx, photoBox.x, photoBox.y, photoBox.w, photoBox.h, 16);
  ctx.clip();
  // Contain the original reference, including its original background. No cutout is implied.
  ctx.drawImage(img, photoBox.x + (photoBox.w - iw) / 2, photoBox.y + (photoBox.h - ih) / 2, iw, ih);
  ctx.restore();
  ctx.fillStyle = colors.muted;
  ctx.font = `400 19px ${FONT}`;
  ctx.fillText('产品图片为实拍参考', 80, 837);

  ctx.fillStyle = colors.accent;
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText('产品参数', 80, 907);
  const labels = ['材质', '纯度', '重量', '尺寸', '工艺', '备注'];
  let rows;
  let fontSize = 28;
  let maxLines = 4;
  for (; fontSize >= 18; fontSize--) {
    ctx.font = `400 ${fontSize}px ${FONT}`;
    rows = labels.map(label => {
      const value = confirmedValue(config.params?.[label]);
      const lines = clampLines(ctx, linesFor(ctx, value, 846), maxLines, 846);
      return { label, value, lines, height: Math.max(71, lines.length * (fontSize + 9) + 25) };
    });
    if (rows.reduce((sum, row) => sum + row.height, 0) <= 535) break;
  }
  if (rows.reduce((sum, row) => sum + row.height, 0) > 535) {
    fontSize = 18;
    maxLines = 2;
    ctx.font = `400 ${fontSize}px ${FONT}`;
    rows = rows.map(row => {
      const lines = clampLines(ctx, linesFor(ctx, row.value, 846), maxLines, 846);
      return { ...row, lines, height: Math.max(71, lines.length * 27 + 22) };
    });
  }
  let top = 938;
  for (const row of rows) {
    ctx.strokeStyle = colors.rule;
    ctx.beginPath(); ctx.moveTo(80, top); ctx.lineTo(1120, top); ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.font = `400 23px ${FONT}`;
    ctx.fillText(row.label, 80, top + 38);
    ctx.fillStyle = row.value === '待确认' ? colors.muted : colors.ink;
    ctx.font = `400 ${fontSize}px ${FONT}`;
    row.lines.forEach((line, index) => ctx.fillText(line, 264, top + 38 + index * (fontSize + 9)));
    top += row.height;
  }
  ctx.strokeStyle = colors.rule;
  ctx.beginPath(); ctx.moveTo(80, top); ctx.lineTo(1120, top); ctx.stroke();
  ctx.fillStyle = colors.muted;
  ctx.font = `400 18px ${FONT}`;
  ctx.fillText('未填写参数标记为「待确认」，请核实后用于商品发布。', 80, 1537);
  return canvas.toDataURL('image/png');
}

function safeFileName(name, fallback = '下载文件') {
  const cleaned = String(name || '').normalize('NFC').replace(/[\\/\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/^\.+/, '').trim();
  return (cleaned || fallback).slice(0, 180);
}

function dataURLToBytes(dataURL) {
  const comma = dataURL.indexOf(',');
  if (comma < 0) throw new Error('图片数据格式不正确，无法下载。');
  const header = dataURL.slice(0, comma);
  try {
    if (/;base64(?:;|$)/i.test(header)) {
      const binary = atob(dataURL.slice(comma + 1).replace(/\s/g, ''));
      return Uint8Array.from(binary, char => char.charCodeAt(0));
    }
    return new TextEncoder().encode(decodeURIComponent(dataURL.slice(comma + 1)));
  } catch {
    throw new Error('图片数据损坏，无法下载，请重新生成。');
  }
}

export function downloadFile(name, dataOrBlob, mime = 'application/octet-stream') {
  let blob = dataOrBlob;
  if (!(blob instanceof Blob)) {
    if (typeof blob === 'string' && blob.startsWith('data:')) {
      mime = blob.slice(5, blob.indexOf(',')).split(';')[0] || mime;
      blob = dataURLToBytes(blob);
    }
    blob = new Blob([blob], { type: mime });
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFileName(name);
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let value = i;
      for (let j = 0; j < 8; j++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      crcTable[i] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function fileBytes(data) {
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string') return data.startsWith('data:') ? dataURLToBytes(data) : new TextEncoder().encode(data);
  throw new Error('打包文件数据无效，请重新生成后再下载。');
}

/** Standards-compliant ZIP (store method, CRC-32, UTF-8 names), no external library. */
export async function downloadZip(files, name = '银作电商组图.zip') {
  if (!Array.isArray(files) || !files.length) throw new Error('还没有可打包的文件。');
  if (files.length > 65535) throw new Error('单个压缩包的文件数量过多。');
  const localParts = [];
  const centralParts = [];
  const names = new Set();
  let offset = 0;
  let centralSize = 0;
  const now = new Date();
  const year = Math.min(2107, Math.max(1980, now.getFullYear()));
  const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const bytes = await fileBytes(file.data);
    let fileName = safeFileName(file.name, `图片-${i + 1}.png`);
    const base = fileName;
    let duplicate = 1;
    while (names.has(fileName)) {
      const extIndex = base.lastIndexOf('.');
      fileName = extIndex > 0 ? `${base.slice(0, extIndex)}-${++duplicate}${base.slice(extIndex)}` : `${base}-${++duplicate}`;
    }
    names.add(fileName);
    const encodedName = new TextEncoder().encode(fileName);
    if (bytes.byteLength > 0xffffffff || offset + bytes.byteLength + encodedName.length + 30 > 0xffffffff) throw new Error('压缩包超过 4 GB，请分批下载。');
    const crc = crc32(bytes);
    const local = new Uint8Array(30 + encodedName.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, bytes.byteLength, true);
    lv.setUint32(22, bytes.byteLength, true);
    lv.setUint16(26, encodedName.length, true);
    local.set(encodedName, 30);
    localParts.push(local, bytes);
    const central = new Uint8Array(46 + encodedName.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, bytes.byteLength, true);
    cv.setUint32(24, bytes.byteLength, true);
    cv.setUint16(28, encodedName.length, true);
    cv.setUint32(42, offset, true);
    central.set(encodedName, 46);
    centralParts.push(central);
    centralSize += central.byteLength;
    offset += local.byteLength + bytes.byteLength;
  }
  if (centralSize + offset + 22 > 0xffffffff) throw new Error('压缩包超过 4 GB，请分批下载。');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const blob = new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  downloadFile(name, blob, 'application/zip');
  return blob;
}

function projectError(error) {
  if (error?.name === 'QuotaExceededError') return new Error('浏览器本地空间不足，请删除旧项目或减少图片后重试。');
  if (error?.name === 'DataCloneError') return new Error('项目包含无法保存的数据，请刷新页面后重试。');
  return new Error('无法访问本地项目，请检查浏览器是否允许网站存储；无痕模式可能限制保存。');
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('当前浏览器不支持本地项目保存，请使用较新版本的浏览器。'));
    let request;
    try { request = indexedDB.open(DB_NAME, 1); } catch (error) { return reject(projectError(error)); }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(projectError(request.error));
    request.onblocked = () => reject(new Error('本地项目被其他标签页占用，请关闭其他工作台页面后重试。'));
  });
}

async function transact(mode, action) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      let transaction;
      let request;
      try {
        transaction = db.transaction(STORE_NAME, mode);
        request = action(transaction.objectStore(STORE_NAME));
      } catch (error) {
        reject(projectError(error));
        return;
      }
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(projectError(transaction.error || request.error));
      transaction.onerror = () => reject(projectError(transaction.error || request.error));
    });
  } finally { db.close(); }
}

function withoutCredentials(value, visited = new WeakMap()) {
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof Date) return value;
  if (visited.has(value)) return visited.get(value);
  const copy = Array.isArray(value) ? [] : {};
  visited.set(value, copy);
  for (const [key, child] of Object.entries(value)) {
    const normal = key.replace(/[_\s-]/g, '').toLowerCase();
    if (/^(key|apikey|secret|secretkey|token|accesstoken|refreshtoken|authorization|password|credential|credentials|clientsecret)$/.test(normal)) continue;
    copy[key] = withoutCredentials(child, visited);
  }
  return copy;
}

export async function saveProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('项目数据无效，无法保存。');
  const record = withoutCredentials(project);
  record.id = typeof record.id === 'string' && record.id ? record.id : makeId();
  record.name = String(record.config?.name || record.name || '未命名银饰').trim() || '未命名银饰';
  record.updatedAt = Date.now();
  await transact('readwrite', store => store.put(record));
  return record;
}

export async function loadProject(id) {
  if (!id) throw new Error('请选择要打开的项目。');
  return (await transact('readonly', store => store.get(id))) || null;
}

export async function listProjects() {
  const records = await transact('readonly', store => store.getAll());
  return records.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export async function deleteProject(id) {
  if (!id) throw new Error('请选择要删除的项目。');
  await transact('readwrite', store => store.delete(id));
}
