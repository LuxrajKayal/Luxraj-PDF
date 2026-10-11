/*
 * Luxraj PDF Renderer — first-party rendering foundation.
 * Copyright (c) 2026 Luxraj Kayal. All rights reserved.
 *
 * This renderer implements a deliberately limited subset of PDF page operators.
 * It does not yet replace a general-purpose PDF renderer.
 */
import { PdfName, PdfReference } from './luxraj-pdf-engine.js';

const WHITE = '#ffffff';
const IDENTITY = [1, 0, 0, 1, 0, 0];
const isWhite = (code) => code === 0 || code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
const isDelimiter = (char) => char !== undefined && '()<>[]{}/%'.includes(char);

function bytesToLatin1(bytes) {
  const chunks = [];
  const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + size))));
  }
  return chunks.join('');
}

function decodeName(source) {
  return source.replace(/#([\da-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function readContentTokens(source) {
  let index = 0;
  const tokens = [];

  function skipSpace() {
    while (index < source.length) {
      if (isWhite(source.charCodeAt(index))) {
        index += 1;
      } else if (source[index] === '%') {
        while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1;
      } else {
        break;
      }
    }
  }

  function readLiteralString() {
    index += 1;
    let depth = 1;
    let result = '';
    while (index < source.length && depth > 0) {
      const char = source[index++];
      if (char === '\\') {
        if (index >= source.length) break;
        const next = source[index++];
        if (next === 'n') result += '\n';
        else if (next === 'r') result += '\r';
        else if (next === 't') result += '\t';
        else if (next === 'b') result += '\b';
        else if (next === 'f') result += '\f';
        else if (next === '\n') { /* escaped line continuation */ }
        else if (next === '\r') {
          if (source[index] === '\n') index += 1;
        } else if (/[0-7]/.test(next)) {
          let octal = next;
          for (let n = 0; n < 2 && index < source.length && /[0-7]/.test(source[index]); n += 1) octal += source[index++];
          result += String.fromCharCode(parseInt(octal, 8) & 255);
        } else result += next;
      } else if (char === '(') {
        depth += 1;
        result += char;
      } else if (char === ')') {
        depth -= 1;
        if (depth > 0) result += char;
      } else result += char;
    }
    if (depth !== 0) throw new SyntaxError('Unterminated PDF content string.');
    return { type: 'string', value: result };
  }

  function readHexString() {
    index += 1;
    let hex = '';
    while (index < source.length && source[index] !== '>') {
      const char = source[index++];
      if (!isWhite(char.charCodeAt(0))) {
        if (!/[0-9a-f]/i.test(char)) throw new SyntaxError('Invalid hex string in PDF content stream.');
        hex += char;
      }
    }
    if (source[index] !== '>') throw new SyntaxError('Unterminated hex string in PDF content stream.');
    index += 1;
    if (hex.length % 2) hex += '0';
    let value = '';
    for (let offset = 0; offset < hex.length; offset += 2) value += String.fromCharCode(parseInt(hex.slice(offset, offset + 2), 16));
    return { type: 'string', value };
  }

  function readArray() {
    index += 1;
    const values = [];
    while (index < source.length) {
      skipSpace();
      if (source[index] === ']') {
        index += 1;
        return { type: 'array', value: values };
      }
      if (index >= source.length) break;
      const value = readValue();
      if (value.type === 'operator') throw new SyntaxError('Unexpected operator inside PDF operand array.');
      values.push(value);
    }
    throw new SyntaxError('Unterminated array in PDF content stream.');
  }

  function readName() {
    index += 1;
    const start = index;
    while (index < source.length && !isWhite(source.charCodeAt(index)) && !isDelimiter(source[index])) index += 1;
    return { type: 'name', value: decodeName(source.slice(start, index)) };
  }

  function readValue() {
    skipSpace();
    const char = source[index];
    if (char === '(') return readLiteralString();
    if (char === '/') return readName();
    if (char === '[') return readArray();
    if (char === '<') {
      if (source.startsWith('<<', index)) {
        // Inline-image dictionaries are not supported by this renderer phase.
        index += 2;
        while (index < source.length && !source.startsWith('>>', index)) index += 1;
        if (index >= source.length) throw new SyntaxError('Unterminated dictionary in PDF content stream.');
        index += 2;
        return { type: 'dictionary', value: null };
      }
      return readHexString();
    }
    if (char === undefined) throw new SyntaxError('Unexpected end of PDF content stream.');
    const start = index;
    while (index < source.length && !isWhite(source.charCodeAt(index)) && !isDelimiter(source[index])) index += 1;
    if (index === start) throw new SyntaxError('Could not tokenize PDF content at offset ' + index + '.');
    const word = source.slice(start, index);
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) return { type: 'number', value: Number(word) };
    if (word === 'true') return { type: 'boolean', value: true };
    if (word === 'false') return { type: 'boolean', value: false };
    if (word === 'null') return { type: 'null', value: null };
    return { type: 'operator', value: word };
  }

  while (index < source.length) {
    skipSpace();
    if (index >= source.length) break;
    const token = readValue();
    tokens.push(token);
  }
  return tokens;
}

function multiplyMatrix(left, right) {
  const [a, b, c, d, e, f] = left;
  const [A, B, C, D, E, F] = right;
  return [
    a * A + c * B,
    b * A + d * B,
    a * C + c * D,
    b * C + d * D,
    a * E + c * F + e,
    b * E + d * F + f,
  ];
}

function transformPoint(matrix, x, y) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function resolveValue(document, value, depth = 0) {
  if (depth > 40) throw new SyntaxError('PDF resource references are too deeply nested.');
  if (!(value instanceof PdfReference)) return value;
  const item = document.objects.get(value.objectNumber);
  if (!item || item.generation !== value.generation) {
    throw new SyntaxError('Unresolved PDF resource ' + value.objectNumber + ' ' + value.generation + ' R.');
  }
  return resolveValue(document, item.value, depth + 1);
}

function filterNames(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => {
    if (!(item instanceof PdfName)) throw new SyntaxError('Unsupported non-name PDF stream filter.');
    return item.value;
  });
}

async function inflate(bytes) {
  if (typeof DecompressionStream !== 'function' || typeof Blob !== 'function' || typeof Response !== 'function') {
    throw new Error('This browser does not provide the stream decompression API required for FlateDecode PDFs.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeAsciiHex(bytes) {
  const raw = bytesToLatin1(bytes);
  const clean = raw.replace(/\s+/g, '').split('>')[0];
  if (!/^[\da-f]*$/i.test(clean)) throw new SyntaxError('Invalid ASCIIHexDecode stream.');
  const hex = clean.length % 2 ? clean + '0' : clean;
  const output = new Uint8Array(hex.length / 2);
  for (let i = 0; i < output.length; i += 1) output[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return output;
}

async function decodeStream(bytes, streamDictionary) {
  let output = bytes.slice();
  const filters = filterNames(streamDictionary.Filter);
  const parameters = streamDictionary.DecodeParms;
  for (let i = 0; i < filters.length; i += 1) {
    const filter = filters[i];
    const params = resolveValueForStreamParameter(parameters, i);
    if (params && typeof params === 'object' && typeof params.Predictor === 'number' && params.Predictor > 1) {
      throw new Error('PDF stream predictors are not supported by the first-party renderer yet.');
    }
    if (filter === 'FlateDecode' || filter === 'Fl') output = await inflate(output);
    else if (filter === 'ASCIIHexDecode' || filter === 'AHx') output = decodeAsciiHex(output);
    else throw new Error('PDF stream filter /' + filter + ' is not supported by the first-party renderer yet.');
  }
  return output;
}

function resolveValueForStreamParameter(value, index) {
  if (Array.isArray(value)) return value[index] ?? null;
  return index === 0 ? value : null;
}

async function getPageStreamBytes(document, page) {
  const contentValue = page.dictionary.Contents;
  const references = contentValue == null ? [] : Array.isArray(contentValue) ? contentValue : [contentValue];
  if (!references.length) return [];
  const streams = [];
  for (const reference of references) {
    if (!(reference instanceof PdfReference)) {
      throw new Error('Direct PDF content streams are not supported by the first-party renderer.');
    }
    const record = document.objects.get(reference.objectNumber);
    if (!record || record.generation !== reference.generation || !(record.stream instanceof Uint8Array)) {
      throw new Error('A page content reference does not point to a readable stream.');
    }
    streams.push(await decodeStream(record.stream, record.value));
  }
  return streams;
}


function imageColorSpace(document, value) {
  const colorSpace = resolveValue(document, value);
  if (colorSpace instanceof PdfName) {
    if (colorSpace.value === 'DeviceGray' || colorSpace.value === 'G') return { kind: 'gray', components: 1 };
    if (colorSpace.value === 'DeviceRGB' || colorSpace.value === 'RGB') return { kind: 'rgb', components: 3 };
    if (colorSpace.value === 'DeviceCMYK' || colorSpace.value === 'CMYK') return { kind: 'cmyk', components: 4 };
  }
  if (Array.isArray(colorSpace) && colorSpace[0] instanceof PdfName) {
    if (colorSpace[0].value === 'ICCBased') {
      const profile = resolveValue(document, colorSpace[1]);
      const components = Number(profile?.N);
      if (components === 1) return { kind: 'gray', components: 1 };
      if (components === 3) return { kind: 'rgb', components: 3 };
      if (components === 4) return { kind: 'cmyk', components: 4 };
    }
    if (colorSpace[0].value === 'Indexed') {
      throw new Error('Indexed PDF image color spaces are not supported by the first-party renderer yet.');
    }
  }
  throw new Error('This PDF image color space is not supported by the first-party renderer yet.');
}

function getPackedSample(bytes, byteOffset, bitOffset, bitsPerComponent) {
  if (bitsPerComponent === 8) return bytes[byteOffset + bitOffset] / 255;
  if (bitsPerComponent === 16) {
    const offset = byteOffset + bitOffset * 2;
    return ((bytes[offset] << 8) | bytes[offset + 1]) / 65535;
  }
  const startBit = bitOffset * bitsPerComponent;
  let value = 0;
  for (let bit = 0; bit < bitsPerComponent; bit += 1) {
    const pos = startBit + bit;
    value = (value << 1) | ((bytes[byteOffset + Math.floor(pos / 8)] >> (7 - (pos % 8))) & 1);
  }
  return value / ((1 << bitsPerComponent) - 1);
}

function unpackImageSamples(bytes, width, height, components, bitsPerComponent) {
  if (![1, 2, 4, 8, 16].includes(bitsPerComponent)) {
    throw new Error('Image bit depth ' + bitsPerComponent + ' is not supported by the first-party renderer yet.');
  }
  const rowBytes = Math.ceil(width * components * bitsPerComponent / 8);
  const samples = new Array(width * height * components);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let component = 0; component < components; component += 1) {
        const bitSampleOffset = x * components + component;
        samples[(y * width + x) * components + component] =
          getPackedSample(bytes, y * rowBytes, bitSampleOffset, bitsPerComponent);
      }
    }
  }
  return samples;
}

function applyDecodeRange(value, decode, component) {
  if (!Array.isArray(decode) || decode.length < component * 2 + 2) return value;
  const low = decode[component * 2], high = decode[component * 2 + 1];
  if (typeof low !== 'number' || typeof high !== 'number') return value;
  return Math.max(0, Math.min(1, low + value * (high - low)));
}

async function readSoftMask(document, maskReference, width, height) {
  if (!(maskReference instanceof PdfReference)) throw new Error('Direct PDF soft masks are not supported.');
  const record = document.objects.get(maskReference.objectNumber);
  if (!record || !(record.stream instanceof Uint8Array)) throw new Error('PDF soft-mask image stream is missing.');
  const dict = record.value;
  if (Number(dict.Width) !== width || Number(dict.Height) !== height) {
    throw new Error('Soft masks with dimensions different from the image are not supported yet.');
  }
  if (Number(dict.BitsPerComponent) !== 8) throw new Error('Soft-mask bit depths other than 8 are not supported yet.');
  const decoded = await decodeStream(record.stream, dict);
  const samples = unpackImageSamples(decoded, width, height, 1, 8);
  return samples.map((value, index) => Math.round(applyDecodeRange(value, dict.Decode, 0) * 255));
}

async function imageObjectToCanvas(state, objectReference, objectDictionary) {
  if (!(objectReference instanceof PdfReference)) throw new Error('Direct PDF image XObjects are not supported.');
  const record = state.document.objects.get(objectReference.objectNumber);
  if (!record || !(record.stream instanceof Uint8Array)) throw new Error('PDF image XObject stream is missing.');

  const width = Number(objectDictionary.Width);
  const height = Number(objectDictionary.Height);
  const bitsPerComponent = Number(objectDictionary.BitsPerComponent);
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 ||
      width > 12000 || height > 12000 || width * height > 40000000) {
    throw new Error('This PDF image has unsupported dimensions.');
  }

  let sampleBytes;
  const filters = filterNames(objectDictionary.Filter);
  if (filters.some((filter) => filter === 'DCTDecode' || filter === 'DCT')) {
    if (typeof createImageBitmap !== 'function' || typeof Blob !== 'function') {
      throw new Error('JPEG PDF image decoding is not available in this browser.');
    }
    const bitmap = await createImageBitmap(new Blob([record.stream], { type: 'image/jpeg' }));
    const scratch = state.context.canvas?.ownerDocument?.createElement('canvas') ?? globalThis.document?.createElement('canvas');
    if (!scratch) throw new Error('A browser canvas is required to decode this PDF image.');
    scratch.width = width;
    scratch.height = height;
    const scratchContext = scratch.getContext('2d');
    scratchContext.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const imageData = scratchContext.getImageData(0, 0, width, height);
    if (objectDictionary.SMask instanceof PdfReference) {
      const alpha = await readSoftMask(state.document, objectDictionary.SMask, width, height);
      for (let i = 0; i < alpha.length; i += 1) imageData.data[i * 4 + 3] = alpha[i];
      scratchContext.putImageData(imageData, 0, 0);
    }
    return scratch;
  }

  sampleBytes = await decodeStream(record.stream, objectDictionary);
  const color = imageColorSpace(state.document, objectDictionary.ColorSpace);
  const components = color.components;
  const samples = unpackImageSamples(sampleBytes, width, height, components, bitsPerComponent);
  const decode = objectDictionary.Decode;
  const imageMask = objectDictionary.ImageMask === true;
  const alpha = objectDictionary.SMask instanceof PdfReference
    ? await readSoftMask(state.document, objectDictionary.SMask, width, height)
    : null;

  const scratch = state.context.canvas?.ownerDocument?.createElement('canvas') ?? globalThis.document?.createElement('canvas');
  if (!scratch) throw new Error('A browser canvas is required to draw PDF image XObjects.');
  scratch.width = width;
  scratch.height = height;
  const scratchContext = scratch.getContext('2d');
  const imageData = scratchContext.createImageData(width, height);
  const max = (1 << bitsPerComponent) - 1;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * components;
    const componentValues = [];
    for (let component = 0; component < components; component += 1) {
      componentValues.push(applyDecodeRange(samples[offset + component], decode, component));
    }
    let red, green, blue;
    if (imageMask) {
      red = green = blue = 0;
    } else if (color.kind === 'gray') {
      red = green = blue = componentValues[0];
    } else if (color.kind === 'rgb') {
      [red, green, blue] = componentValues;
    } else {
      const [c, m, y, k] = componentValues;
      red = (1 - c) * (1 - k);
      green = (1 - m) * (1 - k);
      blue = (1 - y) * (1 - k);
    }
    const target = pixel * 4;
    imageData.data[target] = Math.round(Math.max(0, Math.min(1, red)) * 255);
    imageData.data[target + 1] = Math.round(Math.max(0, Math.min(1, green)) * 255);
    imageData.data[target + 2] = Math.round(Math.max(0, Math.min(1, blue)) * 255);
    imageData.data[target + 3] = alpha ? alpha[pixel] : imageMask ? Math.round((1 - samples[pixel]) * 255) : 255;
  }
  scratchContext.putImageData(imageData, 0, 0);
  return scratch;
}

async function renderImageXObject(state, name) {
  const xobjects = resolveValue(state.document, state.resources?.XObject);
  const reference = xobjects && typeof xobjects === 'object' ? xobjects[name] : null;
  const objectDictionary = resolveValue(state.document, reference);
  if (!objectDictionary || typeof objectDictionary !== 'object') {
    state.warnings.add('An unresolved XObject /' + name + ' was skipped.');
    return;
  }
  if (!(objectDictionary.Subtype instanceof PdfName) || objectDictionary.Subtype.value !== 'Image') {
    state.warnings.add('Form XObjects are not supported yet; some page artwork may be missing.');
    return;
  }
  const scratch = await imageObjectToCanvas(state, reference, objectDictionary);
  state.context.save();
  state.context.transform(1, 0, 0, -1, 0, 1);
  state.context.drawImage(scratch, 0, 0, 1, 1);
  state.context.restore();
}

function applyExtendedGraphicsState(state, name) {
  const table = resolveValue(state.document, state.resources?.ExtGState);
  const value = table && typeof table === 'object' ? table[name] : null;
  const dictionary = resolveValue(state.document, value);
  if (!dictionary || typeof dictionary !== 'object') {
    state.warnings.add('Extended graphics state /' + name + ' could not be resolved.');
    return;
  }
  if (typeof dictionary.ca === 'number') state.fillAlpha = Math.max(0, Math.min(1, dictionary.ca));
  if (typeof dictionary.CA === 'number') state.strokeAlpha = Math.max(0, Math.min(1, dictionary.CA));
  if (typeof dictionary.LW === 'number') {
    state.lineWidth = Math.max(0.1, dictionary.LW);
    state.context.lineWidth = state.lineWidth;
  }
  if (dictionary.BM instanceof PdfName && dictionary.BM.value !== 'Normal' && dictionary.BM.value !== 'Compatible') {
    state.warnings.add('Blend mode /' + dictionary.BM.value + ' is not supported yet.');
  }
  if (dictionary.SMask instanceof PdfName && dictionary.SMask.value !== 'None') {
    state.warnings.add('Soft-mask graphics states are not supported yet.');
  }
}

function colorGray(value) {
  const channel = Math.max(0, Math.min(1, value));
  return 'rgb(' + Math.round(channel * 255) + ',' + Math.round(channel * 255) + ',' + Math.round(channel * 255) + ')';
}

function colorRgb(values) {
  const channels = values.slice(0, 3).map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255));
  return 'rgb(' + channels.join(',') + ')';
}

function colorCmyk(values) {
  const [c, m, y, k] = values.map((value) => Math.max(0, Math.min(1, value)));
  return colorRgb([(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]);
}

function unicodeFromHex(hex) {
  let result = '';
  const evenHex = hex.length % 4 ? hex.padStart(Math.ceil(hex.length / 4) * 4, '0') : hex;
  for (let i = 0; i < evenHex.length; i += 4) {
    result += String.fromCharCode(parseInt(evenHex.slice(i, i + 4), 16));
  }
  return result;
}

function parseToUnicodeCMap(bytes) {
  const source = bytesToLatin1(bytes);
  const map = new Map();
  const codeLengths = new Set();

  for (const section of source.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    for (const pair of section[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
      codeLengths.add(pair[1].length / 2);
    }
  }

  for (const section of source.matchAll(/\d+\s+beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of section[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
      const key = pair[1].toUpperCase();
      codeLengths.add(key.length / 2);
      map.set(key, unicodeFromHex(pair[2]));
    }
  }

  for (const section of source.matchAll(/\d+\s+beginbfrange([\s\S]*?)endbfrange/g)) {
    const rangePattern = /<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<([0-9a-f]+)>|\[([\s\S]*?)\])/gi;
    for (const range of section[1].matchAll(rangePattern)) {
      const firstHex = range[1].toUpperCase();
      const lastHex = range[2].toUpperCase();
      const first = parseInt(firstHex, 16);
      const last = parseInt(lastHex, 16);
      const sourceWidth = firstHex.length;
      codeLengths.add(sourceWidth / 2);
      if (!Number.isFinite(first) || !Number.isFinite(last) || last < first || last - first > 65535) continue;

      if (range[5] !== undefined) {
        const destinations = [...range[5].matchAll(/<([0-9a-f]+)>/gi)].map((item) => item[1]);
        for (let code = first; code <= last; code += 1) {
          const destination = destinations[code - first];
          if (destination !== undefined) map.set(code.toString(16).padStart(sourceWidth, '0').toUpperCase(), unicodeFromHex(destination));
        }
      } else {
        const destinationHex = range[4].toUpperCase();
        const destination = parseInt(destinationHex, 16);
        for (let code = first; code <= last; code += 1) {
          const hex = (destination + code - first).toString(16).padStart(destinationHex.length, '0').toUpperCase();
          map.set(code.toString(16).padStart(sourceWidth, '0').toUpperCase(), unicodeFromHex(hex));
        }
      }
    }
  }

  return {
    map,
    codeLengths: [...codeLengths].filter((length) => Number.isInteger(length) && length > 0).sort((a, b) => b - a),
  };
}

function decodeFontText(text, fontInfo) {
  const cmap = fontInfo?.cmap;
  if (!cmap || !cmap.map.size) return text;
  const codeLengths = cmap.codeLengths.length ? cmap.codeLengths : [2];
  let output = '';
  let offset = 0;
  while (offset < text.length) {
    let found = false;
    for (const byteLength of codeLengths) {
      if (offset + byteLength > text.length) continue;
      let hex = '';
      for (let i = 0; i < byteLength; i += 1) hex += text.charCodeAt(offset + i).toString(16).padStart(2, '0');
      hex = hex.toUpperCase();
      if (cmap.map.has(hex)) {
        output += cmap.map.get(hex);
        offset += byteLength;
        found = true;
        break;
      }
    }
    if (!found) {
      const byteLength = codeLengths[0] || 1;
      output += '\uFFFD';
      offset += Math.min(byteLength, text.length - offset);
    }
  }
  return output;
}

async function getFontInfo(document, resources, resourceName) {
  const fontTable = resolveValue(document, resources?.Font);
  const fontDictionary = fontTable && typeof fontTable === 'object' ? resolveValue(document, fontTable[resourceName]) : null;
  const baseFont = fontDictionary?.BaseFont instanceof PdfName ? fontDictionary.BaseFont.value : 'Helvetica';
  const normalized = baseFont.replace(/^[A-Z]{6}\+/, '');
  const bold = /bold|demi|black/i.test(normalized);
  const italic = /italic|oblique/i.test(normalized);
  let family = 'Arial';
  if (/courier/i.test(normalized)) family = 'Courier New';
  else if (/times|serif/i.test(normalized)) family = 'Times New Roman';
  else if (/symbol/i.test(normalized)) family = 'serif';

  let cmap = null;
  const toUnicode = fontDictionary?.ToUnicode;
  if (toUnicode instanceof PdfReference) {
    const record = document.objects.get(toUnicode.objectNumber);
    if (record?.stream instanceof Uint8Array) {
      cmap = parseToUnicodeCMap(await decodeStream(record.stream, record.value));
    }
  }
  const encoding = fontDictionary?.Encoding instanceof PdfName ? fontDictionary.Encoding.value : '';
  return {
    family, bold, italic, cmap,
    codeLengths: cmap?.codeLengths?.length ? cmap.codeLengths : [encoding === 'Identity-H' || encoding === 'Identity-V' ? 2 : 1],
    widths: Array.isArray(fontDictionary?.Widths) ? fontDictionary.Widths : null,
    firstChar: typeof fontDictionary?.FirstChar === 'number' ? fontDictionary.FirstChar : 0,
  };
}

function createRenderState(document, page, baseMatrix, context) {
  return {
    document, page, context, baseMatrix,
    ctm: IDENTITY.slice(), stack: [], operands: [],
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1,
    lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, dash: [], dashOffset: 0,
    alpha: 1, fillAlpha: 1, strokeAlpha: 1, pendingClip: null, currentPoint: { x: 0, y: 0 },
    fillColorSpace: 'DeviceGray', strokeColorSpace: 'DeviceGray',
    resources: page.resources, fontCache: new Map(),
    fontName: 'F1', fontSize: 12, fontInfo: null,
    textMatrix: IDENTITY.slice(), textLineMatrix: IDENTITY.slice(),
    charSpace: 0, wordSpace: 0, horizontalScale: 1, leading: 0, rise: 0, textMode: 0,
    warnings: new Set(),
  };
}

function setFillStyle(state, style) {
  state.fillStyle = style;
  state.context.fillStyle = style;
}

function setStrokeStyle(state, style) {
  state.strokeStyle = style;
  state.context.strokeStyle = style;
}

function applyPendingClip(state) {
  if (!state.pendingClip) return;
  state.context.clip(state.pendingClip);
  state.pendingClip = null;
}

function pathPaint(state, operator) {
  const context = state.context;
  applyPendingClip(state);
  if (operator === 'S' || operator === 's' || operator === 'B' || operator === 'B*' || operator === 'b' || operator === 'b*') {
    if (operator === 's' || operator === 'b' || operator === 'b*') context.closePath();
    const previousAlpha = context.globalAlpha;
    context.globalAlpha = state.strokeAlpha;
    context.stroke();
    context.globalAlpha = previousAlpha;
  }
  if (operator === 'f' || operator === 'F' || operator === 'f*' || operator === 'B' || operator === 'B*' || operator === 'b' || operator === 'b*') {
    const rule = operator === 'f*' || operator === 'B*' || operator === 'b*' ? 'evenodd' : 'nonzero';
    const previousAlpha = context.globalAlpha;
    context.globalAlpha = state.fillAlpha;
    context.fill(rule);
    context.globalAlpha = previousAlpha;
  }
  context.beginPath();
}

function textAdvance(state, text) {
  const context = state.context;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  const info = state.fontInfo || { family: 'Arial', bold: false, italic: false };
  context.font = (info.italic ? 'italic ' : '') + (info.bold ? 'bold ' : '') + '1px ' + info.family;
  let measured = 0;
  if (typeof context.measureText === 'function') measured = context.measureText(text).width;
  else measured = text.length * 0.5;
  context.restore();
  const wordCount = (text.match(/ /g) || []).length;
  return (measured * state.fontSize + text.length * state.charSpace + wordCount * state.wordSpace) * state.horizontalScale;
}

function drawPdfText(state, rawText) {
  const text = decodeFontText(rawText, state.fontInfo);
  if (state.textMode === 3 || state.textMode >= 4) {
    if (state.textMode >= 4) state.warnings.add('Text clipping modes are not supported yet.');
    return;
  }
  const context = state.context;
  const info = state.fontInfo || { family: 'Arial', bold: false, italic: false };
  const textScale = [state.fontSize * state.horizontalScale, 0, 0, -state.fontSize, 0, state.rise];
  const matrix = multiplyMatrix(multiplyMatrix(multiplyMatrix(state.baseMatrix, state.ctm), state.textMatrix), textScale);
  context.save();
  context.setTransform(...matrix);
  context.font = (info.italic ? 'italic ' : '') + (info.bold ? 'bold ' : '') + '1px ' + info.family;
  if (state.textMode === 1 || state.textMode === 2 || state.textMode === 5 || state.textMode === 6) {
    const previousAlpha = context.globalAlpha;
    context.globalAlpha = state.strokeAlpha;
    context.strokeText(text, 0, 0);
    context.globalAlpha = previousAlpha;
  }
  if (state.textMode === 0 || state.textMode === 2 || state.textMode === 4 || state.textMode === 6) {
    const previousAlpha = context.globalAlpha;
    context.globalAlpha = state.fillAlpha;
    context.fillText(text, 0, 0);
    context.globalAlpha = previousAlpha;
  }
  context.restore();
  state.textMatrix = multiplyMatrix(state.textMatrix, [1, 0, 0, 1, textAdvance(state, text), 0]);
}

async 
function evaluatePdfFunction(fn, input) {
  const type = fn?.FunctionType;
  const domain = Array.isArray(fn?.Domain) ? fn.Domain : [0, 1];
  if (type === 2) {
    const c0 = Array.isArray(fn.C0) ? fn.C0 : [0];
    const c1 = Array.isArray(fn.C1) ? fn.C1 : [1];
    const exponent = typeof fn.N === 'number' ? fn.N : 1;
    const t = Math.max(0, Math.min(1, (input - domain[0]) / Math.max(1e-9, domain[1] - domain[0])));
    return c0.map((start, index) => start + Math.pow(t, exponent) * ((c1[index] ?? start) - start));
  }
  if (type === 3 && Array.isArray(fn.Functions) && fn.Functions.length) {
    const bounds = Array.isArray(fn.Bounds) ? fn.Bounds : [];
    const encode = Array.isArray(fn.Encode) ? fn.Encode : [];
    const boundaries = [domain[0], ...bounds, domain[1]];
    let segment = fn.Functions.length - 1;
    for (let index = 0; index < fn.Functions.length; index += 1) {
      if (input <= boundaries[index + 1]) { segment = index; break; }
    }
    const start = boundaries[segment], end = boundaries[segment + 1];
    const e0 = encode[segment * 2] ?? 0, e1 = encode[segment * 2 + 1] ?? 1;
    const local = (input - start) / Math.max(1e-9, end - start);
    return evaluatePdfFunction(fn.Functions[segment], e0 + local * (e1 - e0));
  }
  throw new Error('This PDF shading function type is not supported.');
}

function shadingColor(values, colorSpace) {
  if (colorSpace instanceof PdfName) {
    if (colorSpace.value === 'DeviceGray' || colorSpace.value === 'G') return colorGray(values[0] ?? 0);
    if (colorSpace.value === 'DeviceCMYK' || colorSpace.value === 'CMYK') return colorCmyk(values);
    if (colorSpace.value === 'DeviceRGB' || colorSpace.value === 'RGB') return colorRgb(values);
  }
  if (Array.isArray(colorSpace) && colorSpace[0] instanceof PdfName && colorSpace[0].value === 'ICCBased') {
    const profile = resolveValueForColorSpaceProfile(colorSpace[1]);
    const components = Number(profile?.N);
    if (components === 1) return colorGray(values[0] ?? 0);
    if (components === 4) return colorCmyk(values);
    return colorRgb(values);
  }
  return colorRgb(values);
}

function resolveValueForColorSpaceProfile(profile) {
  return profile && typeof profile === 'object' ? profile : null;
}

function makeShadingStops(shading) {
  const fn = shading.Function;
  const domain = Array.isArray(fn?.Domain) ? fn.Domain : [0, 1];
  const stops = [];
  const count = fn?.FunctionType === 3 ? Math.max(12, fn.Functions.length * 8) : 20;
  for (let index = 0; index <= count; index += 1) {
    const fraction = index / count;
    const input = domain[0] + fraction * (domain[1] - domain[0]);
    stops.push({ offset: fraction, values: evaluatePdfFunction(fn, input) });
  }
  return stops;
}

function createShadingPattern(state, name) {
  const context = state.context;
  if (typeof context.createLinearGradient !== 'function') return null;
  const patternTable = resolveValue(state.document, state.resources?.Pattern);
  const pattern = patternTable && typeof patternTable === 'object' ? resolveValue(state.document, patternTable[name]) : null;
  if (!pattern || pattern.PatternType !== 2 || !pattern.Shading || typeof pattern.Shading !== 'object') return null;

  const shading = pattern.Shading;
  const shadingType = Number(shading.ShadingType);
  const coords = shading.Coords;
  if (!Array.isArray(coords) || (shadingType !== 2 && shadingType !== 3)) return null;

  context.save();
  if (Array.isArray(pattern.Matrix) && pattern.Matrix.length === 6) context.transform(...pattern.Matrix);
  let gradient;
  if (shadingType === 2) {
    gradient = context.createLinearGradient(coords[0], coords[1], coords[2], coords[3]);
  } else {
    if (typeof context.createRadialGradient !== 'function') {
      context.restore();
      return null;
    }
    gradient = context.createRadialGradient(coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
  }
  context.restore();

  const stops = makeShadingStops(shading);
  const colorSpace = shading.ColorSpace;
  for (const stop of stops) {
    const offset = Math.max(0, Math.min(1, stop.offset));
    const color = shadingColor(stop.values, colorSpace);
    try { gradient.addColorStop(offset, color); } catch { /* repeated positions are ignored */ }
  }
  return gradient;
}

function renderOperator(state, operator, args) {
  const context = state.context;
  const nums = (count) => {
    if (args.length < count || args.slice(-count).some((arg) => arg.type !== 'number')) {
      throw new SyntaxError('Operator ' + operator + ' received invalid numeric operands.');
    }
    return args.slice(-count).map((arg) => arg.value);
  };
  const val = (indexFromEnd) => args[args.length - indexFromEnd];
  const stringArg = () => {
    const item = val(1);
    if (!item || item.type !== 'string') throw new SyntaxError('Operator ' + operator + ' expects a string.');
    return item.value;
  };

  switch (operator) {
    case 'q':
      context.save();
      state.stack.push({
        ctm: state.ctm.slice(), fillStyle: state.fillStyle, strokeStyle: state.strokeStyle,
        lineWidth: state.lineWidth, lineCap: state.lineCap, lineJoin: state.lineJoin,
        miterLimit: state.miterLimit, dash: state.dash.slice(), dashOffset: state.dashOffset,
        alpha: state.alpha, fillAlpha: state.fillAlpha, strokeAlpha: state.strokeAlpha,
        fillColorSpace: state.fillColorSpace, strokeColorSpace: state.strokeColorSpace,
        pendingClip: state.pendingClip,
      });
      break;
    case 'Q': {
      if (!state.stack.length) {
        state.warnings.add('An unmatched Q graphics-state operator was ignored.');
        break;
      }
      const saved = state.stack.pop();
      context.restore();
      Object.assign(state, saved);
      break;
    }
    case 'cm': {
      const matrix = nums(6);
      context.transform(...matrix);
      state.ctm = multiplyMatrix(state.ctm, matrix);
      break;
    }
    case 'w':
      state.lineWidth = Math.max(0.1, nums(1)[0]);
      context.lineWidth = state.lineWidth;
      break;
    case 'J': {
      const cap = nums(1)[0];
      state.lineCap = cap === 1 ? 'round' : cap === 2 ? 'square' : 'butt';
      context.lineCap = state.lineCap;
      break;
    }
    case 'j': {
      const join = nums(1)[0];
      state.lineJoin = join === 1 ? 'round' : join === 2 ? 'bevel' : 'miter';
      context.lineJoin = state.lineJoin;
      break;
    }
    case 'M':
      state.miterLimit = Math.max(1, nums(1)[0]);
      context.miterLimit = state.miterLimit;
      break;
    case 'd': {
      const array = val(2), phase = val(1);
      if (!array || array.type !== 'array' || array.value.some((item) => item.type !== 'number') || !phase || phase.type !== 'number') {
        throw new SyntaxError('Invalid dash pattern in PDF content stream.');
      }
      state.dash = array.value.map((item) => Math.max(0, item.value));
      state.dashOffset = phase.value;
      context.setLineDash(state.dash);
      context.lineDashOffset = state.dashOffset;
      break;
    }
    case 'm': {
      const [x, y] = nums(2);
      context.moveTo(x, y); state.currentPoint = { x, y }; break;
    }
    case 'l': {
      const [x, y] = nums(2);
      context.lineTo(x, y); state.currentPoint = { x, y }; break;
    }
    case 'c': {
      const [x1, y1, x2, y2, x3, y3] = nums(6);
      context.bezierCurveTo(x1, y1, x2, y2, x3, y3);
      state.currentPoint = { x: x3, y: y3 }; break;
    }
    case 'v': {
      const [x2, y2, x3, y3] = nums(4);
      context.bezierCurveTo(state.currentPoint.x, state.currentPoint.y, x2, y2, x3, y3);
      state.currentPoint = { x: x3, y: y3 }; break;
    }
    case 'y': {
      const [x1, y1, x3, y3] = nums(4);
      context.bezierCurveTo(x1, y1, x3, y3, x3, y3);
      state.currentPoint = { x: x3, y: y3 }; break;
    }
    case 'h':
      context.closePath(); break;
    case 're': {
      const [x, y, width, height] = nums(4);
      context.rect(x, y, width, height);
      state.currentPoint = { x, y }; break;
    }
    case 'W':
      state.pendingClip = 'nonzero'; break;
    case 'W*':
      state.pendingClip = 'evenodd'; break;
    case 'S': case 's': case 'f': case 'F': case 'f*': case 'B': case 'B*': case 'b': case 'b*': case 'n':
      if (operator === 'n') { applyPendingClip(state); context.beginPath(); }
      else pathPaint(state, operator);
      break;
    case 'rg':
      setFillStyle(state, colorRgb(nums(3))); break;
    case 'RG':
      setStrokeStyle(state, colorRgb(nums(3))); break;
    case 'g':
      setFillStyle(state, colorGray(nums(1)[0])); break;
    case 'G':
      setStrokeStyle(state, colorGray(nums(1)[0])); break;
    case 'k':
      setFillStyle(state, colorCmyk(nums(4))); break;
    case 'K':
      setStrokeStyle(state, colorCmyk(nums(4))); break;
    case 'BT':
      state.textMatrix = IDENTITY.slice(); state.textLineMatrix = IDENTITY.slice(); break;
    case 'ET':
      break;
    case 'Tf': {
      const font = val(2), size = val(1);
      if (!font || font.type !== 'name' || !size || size.type !== 'number') throw new SyntaxError('Invalid Tf operands.');
      state.fontName = font.value;
      state.fontSize = size.value;
      if (!state.fontCache.has(state.fontName)) {
        state.fontCache.set(state.fontName, await getFontInfo(state.document, state.resources, state.fontName));
      }
      state.fontInfo = state.fontCache.get(state.fontName);
      break;
    }
    case 'Tm': {
      const matrix = nums(6);
      state.textMatrix = matrix; state.textLineMatrix = matrix.slice(); break;
    }
    case 'Td': case 'TD': {
      const [x, y] = nums(2);
      if (operator === 'TD') state.leading = -y;
      state.textLineMatrix = multiplyMatrix(state.textLineMatrix, [1, 0, 0, 1, x, y]);
      state.textMatrix = state.textLineMatrix.slice(); break;
    }
    case 'T*':
      state.textLineMatrix = multiplyMatrix(state.textLineMatrix, [1, 0, 0, 1, 0, -state.leading]);
      state.textMatrix = state.textLineMatrix.slice(); break;
    case 'Tc':
      state.charSpace = nums(1)[0]; break;
    case 'Tw':
      state.wordSpace = nums(1)[0]; break;
    case 'Tz':
      state.horizontalScale = nums(1)[0] / 100; break;
    case 'TL':
      state.leading = nums(1)[0]; break;
    case 'Ts':
      state.rise = nums(1)[0]; break;
    case 'Tr':
      state.textMode = nums(1)[0]; break;
    case 'Tj':
      drawPdfText(state, stringArg()); break;
    case 'TJ': {
      const list = val(1);
      if (!list || list.type !== 'array') throw new SyntaxError('TJ expects an array.');
      for (const item of list.value) {
        if (item.type === 'string') drawPdfText(state, item.value);
        else if (item.type === 'number') {
          state.textMatrix = multiplyMatrix(state.textMatrix, [1, 0, 0, 1, -item.value * state.fontSize / 1000 * state.horizontalScale, 0]);
        }
      }
      break;
    }
    case "'":
      state.textLineMatrix = multiplyMatrix(state.textLineMatrix, [1, 0, 0, 1, 0, -state.leading]);
      state.textMatrix = state.textLineMatrix.slice();
      drawPdfText(state, stringArg()); break;
    case '"': {
      const charSpace = val(3), wordSpace = val(2), text = val(1);
      if (!charSpace || !wordSpace || !text || charSpace.type !== 'number' || wordSpace.type !== 'number' || text.type !== 'string') {
        throw new SyntaxError('Invalid double-quote text operator operands.');
      }
      state.wordSpace = wordSpace.value; state.charSpace = charSpace.value;
      state.textLineMatrix = multiplyMatrix(state.textLineMatrix, [1, 0, 0, 1, 0, -state.leading]);
      state.textMatrix = state.textLineMatrix.slice();
      drawPdfText(state, text.value); break;
    }
    case 'Do': {
      const xObject = val(1);
      if (!xObject || xObject.type !== 'name') throw new SyntaxError('Do expects an XObject name.');
      await renderImageXObject(state, xObject.value);
      break;
    }
    case 'gs': {
      const extState = val(1);
      if (!extState || extState.type !== 'name') throw new SyntaxError('gs expects an extended graphics-state name.');
      applyExtendedGraphicsState(state, extState.value);
      break;
    }
    case 'BI':
      throw new Error('Inline images are not supported by the first-party renderer yet.');
    case 'sh':
      state.warnings.add('Shading fills are not supported yet.');
      break;
    case 'CS': case 'cs': {
      const colorSpace = val(1);
      if (colorSpace && colorSpace.type === 'name') {
        if (operator === 'CS') state.strokeColorSpace = colorSpace.value;
        else state.fillColorSpace = colorSpace.value;
      }
      break;
    }
    case 'SC': case 'SCN': case 'sc': case 'scn':
      if (operator === 'scn' || operator === 'SCN') {
        const pattern = args.slice().reverse().find((item) => item.type === 'name');
        const colorSpace = operator === 'scn' ? state.fillColorSpace : state.strokeColorSpace;
        if (pattern && colorSpace === 'Pattern') {
          const style = createShadingPattern(state, pattern.value);
          if (style) {
            if (operator === 'scn') setFillStyle(state, style);
            else setStrokeStyle(state, style);
          } else {
            state.warnings.add('Pattern /' + pattern.value + ' is not supported yet.');
          }
        }
      }
      break;
    case 'BDC': case 'BMC': case 'EMC': case 'MP': case 'DP':
    case 'ri': case 'i': case 'BX': case 'EX':
      // Marked-content tags and compatibility markers do not paint page pixels.
      break;
    default:
      state.warnings.add('Unsupported PDF operator: ' + operator);
  }
}

async function runTokens(state, bytes) {
  const source = bytesToLatin1(bytes);
  const tokens = readContentTokens(source);
  for (const token of tokens) {
    if (token.type !== 'operator') {
      state.operands.push(token);
      continue;
    }
    if (token.value === 'ID' || token.value === 'EI') {
      throw new Error('Inline images are not supported by the first-party renderer yet.');
    }
    const args = state.operands;
    state.operands = [];
    await renderOperator(state, token.value, args);
  }
}

function assertCanvasContext(context) {
  const required = [
    'save', 'restore', 'setTransform', 'transform', 'clearRect', 'fillRect',
    'beginPath', 'moveTo', 'lineTo', 'bezierCurveTo', 'closePath', 'rect',
    'stroke', 'fill', 'clip', 'fillText', 'strokeText', 'setLineDash', 'drawImage',
  ];
  const missing = required.filter((name) => typeof context?.[name] !== 'function');
  if (missing.length) throw new TypeError('A Canvas 2D context is required; missing: ' + missing.join(', '));
}

/**
 * Render one parsed page to a Canvas 2D context.
 *
 * Supported in this first phase: simple paths, fills/strokes, RGB/gray/CMYK
 * colors, basic text with standard fonts, q/Q and cm transforms, ASCIIHexDecode,
 * and FlateDecode streams without predictors. Images, complex fonts, clipping
 * edge cases, xref streams, object streams, and many PDF features remain work.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} document Parsed result from parsePdfDocument().
 * @param {number} pageIndex Zero-based page index.
 * @param {object} options { scale, background, resizeCanvas }
 * @returns {Promise<{width:number,height:number,warnings:string[]}>}
 */
export async function renderPdfPage(context, document, pageIndex, options = {}) {
  assertCanvasContext(context);
  if (!document || !Array.isArray(document.pages)) throw new TypeError('A parsed PDF document is required.');
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= document.pages.length) {
    throw new RangeError('Page index is outside the parsed document.');
  }
  const scale = Number(options.scale ?? 1);
  if (!Number.isFinite(scale) || scale <= 0) throw new TypeError('Render scale must be a positive finite number.');
  const page = document.pages[pageIndex];
  const [x0, y0, x1, y1] = page.mediaBox;
  const width = Math.max(1, Math.ceil(page.width * scale));
  const height = Math.max(1, Math.ceil(page.height * scale));
  if (options.resizeCanvas !== false && context.canvas) {
    if (context.canvas.width !== width) context.canvas.width = width;
    if (context.canvas.height !== height) context.canvas.height = height;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = options.background ?? WHITE;
  context.fillRect(0, 0, width, height);
  const baseMatrix = [scale, 0, 0, -scale, -x0 * scale, y1 * scale];
  context.setTransform(...baseMatrix);
  const state = createRenderState(document, page, baseMatrix, context);
  context.fillStyle = state.fillStyle;
  context.strokeStyle = state.strokeStyle;
  context.lineWidth = state.lineWidth;
  context.lineCap = state.lineCap;
  context.lineJoin = state.lineJoin;
  context.miterLimit = state.miterLimit;

  try {
    const streams = await getPageStreamBytes(document, page);
    for (const stream of streams) await runTokens(state, stream);
  } finally {
    // Malformed input may leave q operators unbalanced. Do not leak render state to
    // the caller's canvas context, and unwind any saves from the PDF content stream.
    while (state.stack.length) {
      state.stack.pop();
      context.restore();
    }
    context.restore();
  }
  return { width, height, warnings: [...state.warnings] };
}
