// Container metadata only. Browser decoding is checked again by the runtime.
export const MAX_VIDEO_SECONDS = 4;

function mp4Boxes(b, start, end) {
  const boxes = [];
  for (let p = start; p < end;) {
    if (p + 8 > end) throw new Error('Truncated MP4 box.');
    let size = b.readUInt32BE(p), header = 8;
    if (size === 1) {
      if (p + 16 > end) throw new Error('Truncated extended MP4 box.');
      size = Number(b.readBigUInt64BE(p + 8)); header = 16;
    } else if (size === 0) size = end - p;
    if (!Number.isSafeInteger(size) || size < header || p + size > end) throw new Error('Invalid MP4 box size.');
    boxes.push({ type: b.toString('ascii', p + 4, p + 8), start: p + header, end: p + size });
    p += size;
  }
  return boxes;
}

function mp4Duration(b) {
  const moov = mp4Boxes(b, 0, b.length).find(x => x.type === 'moov');
  if (!moov) throw new Error('MP4 is missing movie metadata.');
  const mvhd = mp4Boxes(b, moov.start, moov.end).find(x => x.type === 'mvhd');
  if (!mvhd) throw new Error('MP4 is missing duration metadata.');
  const p = mvhd.start, version = b[p];
  let scale, duration;
  if (version === 0 && p + 20 <= mvhd.end) {
    scale = b.readUInt32BE(p + 12); duration = b.readUInt32BE(p + 16);
    if (duration === 0xffffffff) throw new Error('MP4 duration is unknown.');
  } else if (version === 1 && p + 32 <= mvhd.end) {
    scale = b.readUInt32BE(p + 20);
    const ticks = b.readBigUInt64BE(p + 24);
    if (ticks > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MP4 duration is unknown or too large.');
    duration = Number(ticks);
  } else throw new Error('Unsupported or truncated MP4 duration metadata.');
  return duration / scale;
}

function vint(b, p, size = false) {
  if (p >= b.length || b[p] === 0) throw new Error('Invalid WebM integer.');
  let length = 1;
  while (length <= 8 && !(b[p] & (0x80 >> (length - 1)))) length++;
  if (length > 8 || p + length > b.length || (!size && length > 4)) throw new Error('Truncated WebM integer.');
  let value = BigInt(size ? b[p] & ((1 << (8 - length)) - 1) : b[p]);
  for (let i = 1; i < length; i++) value = (value << 8n) | BigInt(b[p + i]);
  return { length, value: Number(value), unknown: size && value === (1n << BigInt(7 * length)) - 1n };
}

function webmElements(b, start, end) {
  const elements = [];
  for (let p = start; p < end;) {
    const id = vint(b, p), size = vint(b, p + id.length, true);
    const content = p + id.length + size.length;
    const next = size.unknown ? end : content + size.value;
    if (!Number.isSafeInteger(next) || next > end || next < content) throw new Error('Invalid WebM element size.');
    elements.push({ id: id.value, start: content, end: next });
    p = next;
  }
  return elements;
}

function webmDuration(b) {
  const segment = webmElements(b, 0, b.length).find(x => x.id === 0x18538067);
  if (!segment) throw new Error('WebM is missing its segment.');
  const info = webmElements(b, segment.start, segment.end).find(x => x.id === 0x1549a966);
  if (!info) throw new Error('WebM is missing duration metadata.');
  const children = webmElements(b, info.start, info.end);
  const duration = children.find(x => x.id === 0x4489);
  if (!duration) throw new Error('WebM duration is unknown. Export a file with duration metadata.');
  const size = duration.end - duration.start;
  const ticks = size === 4 ? b.readFloatBE(duration.start) : size === 8 ? b.readDoubleBE(duration.start) : NaN;
  const scaleBox = children.find(x => x.id === 0x2ad7b1);
  let scale = 1000000;
  if (scaleBox) {
    const length = scaleBox.end - scaleBox.start;
    if (length < 1 || length > 6) throw new Error('Unsupported WebM timestamp scale.');
    scale = b.readUIntBE(scaleBox.start, length);
  }
  return ticks * scale / 1e9;
}

export function inspectMedia(bytes) {
  const b = Buffer.from(bytes);
  let result;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) result = { kind: 'image', mime: 'image/jpeg', extension: 'jpg' };
  else if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) result = { kind: 'image', mime: 'image/png', extension: 'png' };
  else if (b.length >= 6 && ['GIF87a','GIF89a'].includes(b.toString('ascii', 0, 6))) result = { kind: 'image', mime: 'image/gif', extension: 'gif' };
  else if (b.length >= 12 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') result = { kind: 'image', mime: 'image/webp', extension: 'webp' };
  else if (b.length >= 12 && b.toString('ascii',4,8) === 'ftyp') result = { kind: 'video', mime: 'video/mp4', extension: 'mp4', duration: mp4Duration(b) };
  else if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3) result = { kind: 'video', mime: 'video/webm', extension: 'webm', duration: webmDuration(b) };
  else throw new Error('Use JPEG, PNG/APNG, GIF, WebP, MP4 or WebM. SVG and remote URLs are not accepted.');
  if (result.kind === 'video') {
    if (!Number.isFinite(result.duration) || result.duration <= 0) throw new Error('Video duration cannot be verified. Export a video with valid duration metadata.');
    if (result.duration > MAX_VIDEO_SECONDS) throw new Error(`Video is ${result.duration.toFixed(3)} seconds; maximum is ${MAX_VIDEO_SECONDS} seconds. Shorten it before importing.`);
  }
  return result;
}
