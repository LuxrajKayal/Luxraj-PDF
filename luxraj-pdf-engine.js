/*
 * Luxraj PDF Engine — first-party syntax and minimal document writer.
 * Copyright (c) 2026 Luxraj Kayal. All rights reserved.
 *
 * This is an original, deliberately limited implementation. It is not yet a
 * general-purpose PDF reader or a replacement for the app's current renderer.
 */

const encoder = new TextEncoder();
const isWhite = (code) => code === 0 || code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
const isDelimiter = (char) => char !== undefined && '()<>[]{}/%'.includes(char);

export class PdfName {
  constructor(value) {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError('PDF names must be non-empty strings.');
    this.value = value;
  }
}
export class PdfReference {
  constructor(objectNumber, generation = 0) {
    if (!Number.isInteger(objectNumber) || objectNumber < 1 || !Number.isInteger(generation) || generation < 0) {
      throw new TypeError('A PDF reference requires a positive object number and non-negative generation.');
    }
    this.objectNumber = objectNumber;
    this.generation = generation;
  }
}
export class PdfString {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes.slice() : encoder.encode(String(bytes));
  }
}
export class PdfHexString {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes.slice() : encoder.encode(String(bytes));
  }
}

export const pdfName = (value) => new PdfName(value);
export const pdfRef = (objectNumber, generation = 0) => new PdfReference(objectNumber, generation);
export const pdfString = (value) => new PdfString(value);
export const pdfHexString = (value) => new PdfHexString(value);

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string') return encoder.encode(value);
  throw new TypeError('Expected a string, ArrayBuffer, or Uint8Array.');
}

function concatBytes(parts) {
  const arrays = parts.map(toBytes);
  const total = arrays.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of arrays) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) throw new TypeError('PDF numbers must be finite.');
  if (Object.is(value, -0)) return '0';
  return String(Number(value.toFixed(6)));
}

function serializeName(name) {
  if ([...name.value].some((character) => character.charCodeAt(0) > 255)) {
    throw new RangeError('PDF names must be represented as single-byte name characters.');
  }
  const bytes = Uint8Array.from(name.value, (character) => character.charCodeAt(0) & 255);
  let result = '/';
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    if (byte < 33 || byte > 126 || '#%()/<>[]{}'.includes(char)) {
      result += `#${byte.toString(16).padStart(2, '0').toUpperCase()}`;
    } else {
      result += char;
    }
  }
  return result;
}

function serializeLiteralString(value) {
  let result = '(';
  for (const byte of value.bytes) {
    if (byte === 40) result += '\\(';
    else if (byte === 41) result += '\\)';
    else if (byte === 92) result += '\\\\';
    else if (byte === 10) result += '\\n';
    else if (byte === 13) result += '\\r';
    else if (byte === 9) result += '\\t';
    else if (byte === 8) result += '\\b';
    else if (byte === 12) result += '\\f';
    else if (byte < 32 || byte > 126) result += `\\${byte.toString(8).padStart(3, '0')}`;
    else result += String.fromCharCode(byte);
  }
  return result + ')';
}

function serializeHexString(value) {
  return `<${Array.from(value.bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}>`;
}

export function serializePdfValue(value) {
  if (value instanceof PdfName) return serializeName(value);
  if (value instanceof PdfReference) return `${value.objectNumber} ${value.generation} R`;
  if (value instanceof PdfString) return serializeLiteralString(value);
  if (value instanceof PdfHexString) return serializeHexString(value);
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') return formatNumber(value);
  if (Array.isArray(value)) return `[${value.map(serializePdfValue).join(' ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length
      ? `<< ${entries.map(([key, item]) => `/${serializeName(new PdfName(key)).slice(1)} ${serializePdfValue(item)}`).join(' ')} >>`
      : '<< >>';
  }
  throw new TypeError(`Unsupported PDF value: ${typeof value}`);
}

function parserFor(source) {
  if (typeof source !== 'string') throw new TypeError('PDF syntax input must be a binary string.');
  let index = 0;

  function skipSpaceAndComments() {
    while (index < source.length) {
      const code = source.charCodeAt(index);
      if (isWhite(code)) { index += 1; continue; }
      if (source[index] === '%') {
        while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1;
        continue;
      }
      break;
    }
  }

  function readName() {
    index += 1; // slash
    let value = '';
    while (index < source.length && !isWhite(source.charCodeAt(index)) && !isDelimiter(source[index])) {
      if (source[index] === '#' && /^[\da-f]{2}$/i.test(source.slice(index + 1, index + 3))) {
        value += String.fromCharCode(parseInt(source.slice(index + 1, index + 3), 16));
        index += 3;
      } else {
        value += source[index++];
      }
    }
    if (!value) throw new SyntaxError('Empty or malformed PDF name.');
    return new PdfName(value);
  }

  function readLiteralString() {
    index += 1; // opening parenthesis
    const bytes = [];
    let depth = 1;
    while (index < source.length && depth > 0) {
      const char = source[index++];
      if (char === '\\') {
        if (index >= source.length) break;
        const escaped = source[index++];
        const simple = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
        if (Object.hasOwn(simple, escaped)) {
          bytes.push(simple[escaped]);
        } else if (escaped === '\n') {
          // A backslash followed by a line ending is a line continuation.
        } else if (escaped === '\r') {
          if (source[index] === '\n') index += 1;
        } else if (/[0-7]/.test(escaped)) {
          let octal = escaped;
          for (let count = 0; count < 2 && /[0-7]/.test(source[index] || ''); count += 1) octal += source[index++];
          bytes.push(parseInt(octal, 8) & 255);
        } else {
          bytes.push(escaped.charCodeAt(0) & 255);
        }
      } else if (char === '(') {
        depth += 1; bytes.push(40);
      } else if (char === ')') {
        depth -= 1;
        if (depth > 0) bytes.push(41);
      } else if (char === '\r') {
        if (source[index] === '\n') index += 1;
        bytes.push(10);
      } else {
        bytes.push(char.charCodeAt(0) & 255);
      }
    }
    if (depth !== 0) throw new SyntaxError('Unterminated PDF literal string.');
    return new PdfString(new Uint8Array(bytes));
  }

  function readHexString() {
    index += 1; // <
    let hex = '';
    while (index < source.length && source[index] !== '>') {
      if (!isWhite(source.charCodeAt(index))) {
        if (!/[\da-f]/i.test(source[index])) throw new SyntaxError('Invalid character in PDF hex string.');
        hex += source[index];
      }
      index += 1;
    }
    if (source[index] !== '>') throw new SyntaxError('Unterminated PDF hex string.');
    index += 1;
    if (hex.length % 2) hex += '0';
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return new PdfHexString(bytes);
  }

  function readArray() {
    index += 1;
    const values = [];
    while (true) {
      skipSpaceAndComments();
      if (index >= source.length) throw new SyntaxError('Unterminated PDF array.');
      if (source[index] === ']') { index += 1; return values; }
      values.push(readValue());
    }
  }

  function readDictionary() {
    index += 2;
    const dictionary = {};
    while (true) {
      skipSpaceAndComments();
      if (source.startsWith('>>', index)) { index += 2; return dictionary; }
      if (index >= source.length) throw new SyntaxError('Unterminated PDF dictionary.');
      if (source[index] !== '/') throw new SyntaxError('PDF dictionary keys must be names.');
      const key = readName().value;
      if (Object.hasOwn(dictionary, key)) throw new SyntaxError(`Duplicate PDF dictionary key: ${key}`);
      dictionary[key] = readValue();
    }
  }

  function readAtom() {
    const start = index;
    while (index < source.length && !isWhite(source.charCodeAt(index)) && !isDelimiter(source[index])) index += 1;
    if (start === index) throw new SyntaxError(`Unexpected PDF syntax at offset ${index}.`);
    const token = source.slice(start, index);
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) {
      const first = Number(token);
      const afterFirst = index;
      skipSpaceAndComments();
      const secondStart = index;
      while (index < source.length && !isWhite(source.charCodeAt(index)) && !isDelimiter(source[index])) index += 1;
      const secondToken = source.slice(secondStart, index);
      if (Number.isInteger(first) && /^\d+$/.test(secondToken)) {
        const generation = Number(secondToken);
        skipSpaceAndComments();
        if (source[index] === 'R' && (index + 1 === source.length || isWhite(source.charCodeAt(index + 1)) || isDelimiter(source[index + 1]))) {
          index += 1;
          return new PdfReference(first, generation);
        }
      }
      index = afterFirst;
      return first;
    }
    throw new SyntaxError(`Unsupported PDF token "${token}" at offset ${start}.`);
  }

  function readValue() {
    skipSpaceAndComments();
    if (index >= source.length) throw new SyntaxError('Expected a PDF value at end of input.');
    if (source.startsWith('<<', index)) return readDictionary();
    if (source[index] === '<') return readHexString();
    if (source[index] === '(') return readLiteralString();
    if (source[index] === '/') return readName();
    if (source[index] === '[') return readArray();
    return readAtom();
  }

  return {
    parse() {
      const value = readValue();
      return { value, offset: index };
    }
  };
}

export function parsePdfValue(source, offset = 0) {
  if (!Number.isInteger(offset) || offset < 0 || offset > source.length) {
    throw new RangeError('The PDF syntax offset is outside the input.');
  }
  const parser = parserFor(source.slice(offset));
  const result = parser.parse();
  return { value: result.value, offset: offset + result.offset };
}

function positivePageNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be a positive finite number.`);
  return value;
}

/**
 * Write a small, new PDF from page boxes and raw PDF content-stream operators.
 * This does not yet parse or preserve arbitrary input PDFs.
 *
 * Each page: { width: number, height: number, content?: string | Uint8Array }
 * Content streams contain PDF graphics/text operators authored by the caller.
 */
export function createPdf({ pages = [] } = {}) {
  if (!Array.isArray(pages)) throw new TypeError('pages must be an array.');
  const objects = [];
  const pushObject = (body) => {
    objects.push(toBytes(body));
    return objects.length;
  };
  const addRawObject = (bodyBytes) => {
    objects.push(bodyBytes);
    return objects.length;
  };

  // Object identifiers are assigned once, then all forward references are stable.
  pushObject(''); // 1: Catalog, filled after the page tree is known.
  pushObject(''); // 2: Pages root.
  pushObject(serializePdfValue({ Type: pdfName('Font'), Subtype: pdfName('Type1'), BaseFont: pdfName('Helvetica'), Encoding: pdfName('WinAnsiEncoding') })); // 3: built-in font.

  const pageRefs = [];
  for (const page of pages) {
    const width = positivePageNumber(page.width, 'Page width');
    const height = positivePageNumber(page.height, 'Page height');
    const pageObjectId = objects.length + 1;
    const contentObjectId = pageObjectId + 1;
    pageRefs.push(pdfRef(pageObjectId));
    const contentBytes = toBytes(page.content ?? '');
    const pageBody = serializePdfValue({
      Type: pdfName('Page'),
      Parent: pdfRef(2),
      MediaBox: [0, 0, width, height],
      Resources: { Font: { F1: pdfRef(3), LuxrajText: pdfRef(3) } },
      Contents: pdfRef(contentObjectId)
    });
    addRawObject(toBytes(pageBody));
    const streamHeader = toBytes(`<< /Length ${contentBytes.length} >>\nstream\n`);
    const streamFooter = toBytes('\nendstream');
    addRawObject(concatBytes([streamHeader, contentBytes, streamFooter]));
  }

  objects[0] = toBytes(serializePdfValue({ Type: pdfName('Catalog'), Pages: pdfRef(2) }));
  objects[1] = toBytes(serializePdfValue({ Type: pdfName('Pages'), Count: pages.length, Kids: pageRefs }));

  const header = new Uint8Array([ ...encoder.encode('%PDF-1.4\n%'), 0xE2, 0xE3, 0xCF, 0xD3, 10 ]);
  const pieces = [header];
  const offsets = [0];
  let byteOffset = header.length;
  for (let i = 0; i < objects.length; i += 1) {
    const prefix = toBytes(`${i + 1} 0 obj\n`);
    const suffix = toBytes('\nendobj\n');
    offsets.push(byteOffset);
    pieces.push(prefix, objects[i], suffix);
    byteOffset += prefix.length + objects[i].length + suffix.length;
  }
  const xrefOffset = byteOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  pieces.push(toBytes(xref), toBytes(trailer));
  return concatBytes(pieces);
}


function pdfRgb(hex, pale = false) {
  const input = typeof hex === 'string' ? hex.trim().replace(/^#/, '') : '';
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) {
    throw new TypeError('Annotation color must be a 3- or 6-digit hex value.');
  }
  let raw = input;
  if (raw.length === 3) raw = [...raw].map((char) => char + char).join('');
  const channels = [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16) / 255);
  const values = pale ? channels.map((channel) => channel * 0.22 + 0.78) : channels;
  return values.map(formatNumber).join(' ');
}

function contentPoint(point, context) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError('Annotation points must have finite x and y coordinates.');
  }
  return {
    x: point.x * context.scaleX,
    y: context.pageHeight - point.y * context.scaleY,
  };
}

function pdfTextLiteral(text) {
  const value = String(text ?? '');
  // The initial writer uses the built-in Helvetica/WinAnsi font, so avoid silently
  // corrupting characters that require a Unicode font or ToUnicode map.
  if (/[^\x20-\x7E]/.test(value)) {
    throw new RangeError('The first-party PDF writer currently supports ASCII annotation text only.');
  }
  return serializePdfValue(new PdfString(value));
}

/**
 * Convert our annotation model for one page into a first-party PDF content stream.
 * Annotation point coordinates use a top-left origin; PDF uses a bottom-left origin.
 * Options: pageIndex, pageWidth, pageHeight, canvasWidth, canvasHeight.
 */
export function annotationsToPdfContent(annotations, options = {}) {
  if (!Array.isArray(annotations)) throw new TypeError('annotations must be an array.');
  const pageIndex = options.pageIndex ?? 0;
  const fontName = options.fontName ?? 'LuxrajText';
  if (typeof fontName !== 'string' || !/^[A-Za-z0-9_-]+$/.test(fontName)) throw new TypeError('fontName must be a simple PDF resource name.');
  const pageWidth = positivePageNumber(options.pageWidth, 'Page width');
  const pageHeight = positivePageNumber(options.pageHeight, 'Page height');
  const canvasWidth = positivePageNumber(options.canvasWidth ?? pageWidth, 'Canvas width');
  const canvasHeight = positivePageNumber(options.canvasHeight ?? pageHeight, 'Canvas height');
  const context = {
    pageHeight,
    scaleX: pageWidth / canvasWidth,
    scaleY: pageHeight / canvasHeight,
  };
  const commands = [];

  for (const annotation of annotations) {
    if (annotation.pageIndex !== pageIndex) continue;
    const points = Array.isArray(annotation.points) ? annotation.points : [];
    if (!points.length) continue;
    const lineWidth = Math.max(0.1, Number(annotation.thickness ?? 1) * (context.scaleX + context.scaleY) / 2);
    if (!Number.isFinite(lineWidth)) throw new TypeError('Annotation thickness must be finite.');
    const highlight = annotation.type === 'highlight';
    const strokeColor = pdfRgb(annotation.color ?? '#2563eb', highlight);
    const fillColor = pdfRgb(annotation.color ?? '#2563eb', highlight);
    commands.push('q', `${strokeColor} RG`, `${fillColor} rg`, `${formatNumber(highlight ? Math.max(12, Number(annotation.thickness ?? 1) * 4) * (context.scaleX + context.scaleY) / 2 : lineWidth)} w`, '1 J', '1 j');

    if (annotation.type === 'pen' || highlight) {
      if (points.length > 1) {
        const first = contentPoint(points[0], context);
        commands.push(`${formatNumber(first.x)} ${formatNumber(first.y)} m`);
        for (let i = 1; i < points.length; i += 1) {
          const point = contentPoint(points[i], context);
          commands.push(`${formatNumber(point.x)} ${formatNumber(point.y)} l`);
        }
        commands.push('S');
      } else {
        const point = contentPoint(points[0], context);
        commands.push(`${formatNumber(point.x)} ${formatNumber(point.y)} m ${formatNumber(point.x)} ${formatNumber(point.y)} l S`);
      }
    } else if (points.length >= 2) {
      const a = points[0], b = points[1];
      const left = Math.min(a.x, b.x) * context.scaleX;
      const right = Math.max(a.x, b.x) * context.scaleX;
      const top = Math.min(a.y, b.y) * context.scaleY;
      const bottom = Math.max(a.y, b.y) * context.scaleY;
      const width = right - left;
      const height = bottom - top;
      const bottomY = pageHeight - bottom;
      if (annotation.type === 'rect') {
        commands.push(`${formatNumber(left)} ${formatNumber(bottomY)} ${formatNumber(width)} ${formatNumber(height)} re`);
        commands.push(annotation.fill ? 'B' : 'S');
      } else if (annotation.type === 'ellipse') {
        const k = 0.5522847498;
        const cx = left + width / 2, cy = bottomY + height / 2;
        const rx = width / 2, ry = height / 2;
        commands.push(
          `${formatNumber(cx + rx)} ${formatNumber(cy)} m`,
          `${formatNumber(cx + rx)} ${formatNumber(cy + k * ry)} ${formatNumber(cx + k * rx)} ${formatNumber(cy + ry)} ${formatNumber(cx)} ${formatNumber(cy + ry)} c`,
          `${formatNumber(cx - k * rx)} ${formatNumber(cy + ry)} ${formatNumber(cx - rx)} ${formatNumber(cy + k * ry)} ${formatNumber(cx - rx)} ${formatNumber(cy)} c`,
          `${formatNumber(cx - rx)} ${formatNumber(cy - k * ry)} ${formatNumber(cx - k * rx)} ${formatNumber(cy - ry)} ${formatNumber(cx)} ${formatNumber(cy - ry)} c`,
          `${formatNumber(cx + k * rx)} ${formatNumber(cy - ry)} ${formatNumber(cx + rx)} ${formatNumber(cy - k * ry)} ${formatNumber(cx + rx)} ${formatNumber(cy)} c`,
          annotation.fill ? 'B' : 'S',
        );
      } else if (annotation.type === 'line' || annotation.type === 'arrow') {
        const start = contentPoint(a, context), end = contentPoint(b, context);
        commands.push(`${formatNumber(start.x)} ${formatNumber(start.y)} m ${formatNumber(end.x)} ${formatNumber(end.y)} l S`);
        if (annotation.type === 'arrow') {
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const size = Math.max(9, Number(annotation.thickness ?? 1) * 3.2) * (context.scaleX + context.scaleY) / 2;
          const p1 = { x: end.x - size * Math.cos(angle - Math.PI / 6), y: end.y - size * Math.sin(angle - Math.PI / 6) };
          const p2 = { x: end.x - size * Math.cos(angle + Math.PI / 6), y: end.y - size * Math.sin(angle + Math.PI / 6) };
          commands.push(`${formatNumber(end.x)} ${formatNumber(end.y)} m ${formatNumber(p1.x)} ${formatNumber(p1.y)} l S`);
          commands.push(`${formatNumber(end.x)} ${formatNumber(end.y)} m ${formatNumber(p2.x)} ${formatNumber(p2.y)} l S`);
        }
      }
    } else if (annotation.type === 'text') {
      const point = contentPoint(points[0], context);
      const size = positivePageNumber(Number(annotation.fontSize ?? 18), 'Font size');
      commands.push(`BT /${fontName} ${formatNumber(size)} Tf 1 0 0 1 ${formatNumber(point.x)} ${formatNumber(point.y)} Tm ${pdfTextLiteral(annotation.text ?? '')} Tj ET`);
    }
    commands.push('Q');
  }
  return commands.join('\n') + (commands.length ? '\n' : '');
}

/**
 * Create a brand-new PDF whose pages contain the supplied annotations.
 * This is not a source-preserving editor yet: it does not include any background
 * content from an input PDF.
 */
export function createAnnotationPdf({ pages = [], annotations = [] } = {}) {
  if (!Array.isArray(pages)) throw new TypeError('pages must be an array.');
  if (!Array.isArray(annotations)) throw new TypeError('annotations must be an array.');
  const outputPages = pages.map((page, index) => {
    const pageIndex = page.index ?? index;
    return {
      width: page.width,
      height: page.height,
      content: annotationsToPdfContent(annotations, {
        pageIndex,
        pageWidth: page.width,
        pageHeight: page.height,
        canvasWidth: page.canvasWidth ?? page.width,
        canvasHeight: page.canvasHeight ?? page.height,
      }),
    };
  });
  return createPdf({ pages: outputPages });
}


function binaryBytesToString(bytes) {
  let result = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return result;
}

function binaryStringToBytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 255;
  return bytes;
}

function skipPdfWhitespace(source, initialOffset) {
  let offset = initialOffset;
  while (offset < source.length) {
    if (isWhite(source.charCodeAt(offset))) {
      offset += 1;
    } else if (source[offset] === '%') {
      while (offset < source.length && source[offset] !== '\n' && source[offset] !== '\r') offset += 1;
    } else {
      break;
    }
  }
  return offset;
}

function readPdfToken(source, initialOffset) {
  const offset = skipPdfWhitespace(source, initialOffset);
  let end = offset;
  while (end < source.length && !isWhite(source.charCodeAt(end)) && !isDelimiter(source[end])) end += 1;
  if (end === offset) throw new SyntaxError(`Expected PDF token at offset ${offset}.`);
  return { token: source.slice(offset, end), offset: end };
}

function parseClassicXrefSection(source, xrefOffset, seen = new Set(), depth = 0) {
  if (depth > 32 || seen.has(xrefOffset)) throw new SyntaxError('The PDF cross-reference chain is cyclic or too deep.');
  seen.add(xrefOffset);
  let offset = skipPdfWhitespace(source, xrefOffset);
  if (!source.startsWith('xref', offset)) {
    throw new SyntaxError('This PDF uses an xref stream; this first-party reader currently supports classic xref tables only.');
  }
  offset += 4;
  const localEntries = new Map();
  let trailer = null;

  while (offset < source.length) {
    const tokenResult = readPdfToken(source, offset);
    offset = tokenResult.offset;
    if (tokenResult.token === 'trailer') {
      const parsed = parsePdfValue(source, offset);
      trailer = parsed.value;
      offset = parsed.offset;
      break;
    }
    if (!/^\d+$/.test(tokenResult.token)) throw new SyntaxError('Invalid classic PDF cross-reference subsection.');
    const firstObject = Number(tokenResult.token);
    const countResult = readPdfToken(source, offset);
    if (!/^\d+$/.test(countResult.token)) throw new SyntaxError('Invalid cross-reference entry count.');
    const count = Number(countResult.token);
    offset = countResult.offset;
    for (let i = 0; i < count; i += 1) {
      const objectOffset = readPdfToken(source, offset);
      const generationToken = readPdfToken(source, objectOffset.offset);
      const statusToken = readPdfToken(source, generationToken.offset);
      if (!/^\d+$/.test(objectOffset.token) || !/^\d+$/.test(generationToken.token) || !/^[nf]$/.test(statusToken.token)) {
        throw new SyntaxError('Malformed PDF cross-reference entry.');
      }
      localEntries.set(firstObject + i, {
        offset: Number(objectOffset.token),
        generation: Number(generationToken.token),
        inUse: statusToken.token === 'n',
      });
      offset = statusToken.offset;
    }
  }

  if (!trailer || typeof trailer !== 'object' || Array.isArray(trailer)) {
    throw new SyntaxError('The PDF has no valid trailer dictionary.');
  }
  const previousOffset = trailer.Prev;
  let entries = localEntries;
  let mergedTrailer = trailer;
  if (typeof previousOffset === 'number' && Number.isInteger(previousOffset) && previousOffset >= 0) {
    const previous = parseClassicXrefSection(source, previousOffset, seen, depth + 1);
    entries = new Map(previous.entries);
    for (const [objectNumber, entry] of localEntries) entries.set(objectNumber, entry);
    mergedTrailer = { ...previous.trailer, ...trailer };
  }
  return { entries, trailer: mergedTrailer };
}

function parseIndirectObjectAt(source, objectNumber, entry) {
  const headerPattern = /^(\d+)\s+(\d+)\s+obj\b/;
  const match = headerPattern.exec(source.slice(entry.offset));
  if (!match) {
    throw new SyntaxError(`Object ${objectNumber} uses an unsupported compressed or malformed representation.`);
  }
  const actualNumber = Number(match[1]);
  const generation = Number(match[2]);
  if (actualNumber !== objectNumber || generation !== entry.generation) {
    throw new SyntaxError(`Cross-reference offset mismatch for PDF object ${objectNumber}.`);
  }
  const valueOffset = entry.offset + match[0].length;
  const parsed = parsePdfValue(source, valueOffset);
  const value = parsed.value;
  let offset = skipPdfWhitespace(source, parsed.offset);
  let stream = null;

  if (source.startsWith('stream', offset)) {
    offset += 6;
    if (source.startsWith('\r\n', offset)) offset += 2;
    else if (source[offset] === '\r' || source[offset] === '\n') offset += 1;
    else throw new SyntaxError(`PDF stream for object ${objectNumber} must start on a new line.`);

    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.Length !== 'number' || !Number.isInteger(value.Length) || value.Length < 0) {
      throw new SyntaxError(`PDF object ${objectNumber} has a missing or indirect stream Length, which is not supported yet.`);
    }
    const end = offset + value.Length;
    if (end > source.length) throw new SyntaxError(`PDF stream for object ${objectNumber} is truncated.`);
    stream = binaryStringToBytes(source.slice(offset, end));
    const afterStream = skipPdfWhitespace(source, end);
    if (!source.startsWith('endstream', afterStream)) {
      throw new SyntaxError(`PDF stream Length is inconsistent for object ${objectNumber}.`);
    }
  }

  return { number: objectNumber, generation, value, stream };
}

function pdfNameIs(value, name) {
  return value instanceof PdfName && value.value === name;
}

function resolvePdfValue(value, objects, depth = 0) {
  if (depth > 64) throw new SyntaxError('PDF object references are cyclic or too deeply nested.');
  if (!(value instanceof PdfReference)) return value;
  const record = objects.get(value.objectNumber);
  if (!record || record.generation !== value.generation) {
    throw new SyntaxError(`Unresolved PDF reference ${value.objectNumber} ${value.generation} R.`);
  }
  return resolvePdfValue(record.value, objects, depth + 1);
}

function readPageContentStreams(contents, objects) {
  const values = Array.isArray(contents) ? contents : [contents];
  const streams = [];
  for (const item of values) {
    if (item instanceof PdfReference) {
      const record = objects.get(item.objectNumber);
      if (!record || record.generation !== item.generation) {
        throw new SyntaxError(`Unresolved page content stream ${item.objectNumber} ${item.generation} R.`);
      }
      if (!(record.stream instanceof Uint8Array)) throw new SyntaxError('A page Contents reference did not point to a stream.');
      streams.push(record.stream.slice());
    } else if (item !== null && item !== undefined) {
      throw new SyntaxError('Direct page content streams are not supported.');
    }
  }
  return streams;
}

function collectPdfPages(objects, trailer) {
  const rootReference = trailer.Root;
  if (!(rootReference instanceof PdfReference)) throw new SyntaxError('The PDF trailer has no indirect Root reference.');
  const catalog = resolvePdfValue(rootReference, objects);
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new SyntaxError('The PDF catalog is invalid.');
  const pagesRoot = catalog.Pages;
  const pages = [];

  function visit(nodeValue, inheritedMediaBox = null, inheritedResources = null, depth = 0) {
    if (depth > 64) throw new SyntaxError('The PDF page tree is too deep.');
    const node = resolvePdfValue(nodeValue, objects);
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new SyntaxError('Invalid PDF page-tree node.');
    const mediaBox = node.MediaBox ?? inheritedMediaBox;
    const resources = node.Resources ?? inheritedResources;
    if (pdfNameIs(node.Type, 'Page')) {
      if (!Array.isArray(mediaBox) || mediaBox.length !== 4 || !mediaBox.every((number) => typeof number === 'number' && Number.isFinite(number))) {
        throw new SyntaxError('Page is missing a supported MediaBox.');
      }
      const [x0, y0, x1, y1] = mediaBox;
      if (x1 <= x0 || y1 <= y0) throw new SyntaxError('Page MediaBox has invalid dimensions.');
      const contents = node.Contents;
      pages.push({
        object: nodeValue instanceof PdfReference ? nodeValue.objectNumber : null,
        dictionary: node,
        mediaBox: mediaBox.slice(),
        width: x1 - x0,
        height: y1 - y0,
        resources: resources === null ? null : resolvePdfValue(resources, objects),
        contentStreams: readPageContentStreams(contents, objects),
      });
      return;
    }
    if (!pdfNameIs(node.Type, 'Pages') || !Array.isArray(node.Kids)) {
      throw new SyntaxError('The PDF page tree contains a node that is neither /Page nor /Pages.');
    }
    for (const child of node.Kids) visit(child, mediaBox, resources, depth + 1);
  }

  visit(pagesRoot);
  return pages;
}

/**
 * Read PDFs that use classic xref tables, indirect objects, direct-length streams,
 * and ordinary page trees. Object/xref streams, encrypted files, filters, and
 * indirect stream lengths are intentionally rejected until implemented.
 */
export function parsePdfDocument(input) {
  const bytes = toBytes(input);
  const source = binaryBytesToString(bytes);
  const header = /%PDF-(\d+\.\d+)/.exec(source.slice(0, 1024));
  if (!header) throw new SyntaxError('The file does not have a recognizable PDF header.');
  const startXrefPattern = /startxref\s+(\d+)\s+%%EOF/g;
  let startXref = null;
  let match;
  while ((match = startXrefPattern.exec(source)) !== null) startXref = Number(match[1]);
  if (!Number.isInteger(startXref) || startXref < 0 || startXref >= source.length) {
    throw new SyntaxError('The PDF has no valid startxref offset.');
  }

  const xref = parseClassicXrefSection(source, startXref);
  const objects = new Map();
  const liveEntries = [...xref.entries.entries()]
    .filter(([objectNumber, entry]) => objectNumber > 0 && entry.inUse && entry.offset > 0)
    .sort((a, b) => a[1].offset - b[1].offset);
  for (const [objectNumber, entry] of liveEntries) {
    const object = parseIndirectObjectAt(source, objectNumber, entry);
    objects.set(objectNumber, object);
  }

  const pages = collectPdfPages(objects, xref.trailer);
  return {
    version: header[1],
    trailer: xref.trailer,
    objects,
    pages,
    startXref,
    byteLength: bytes.length,
  };
}


/**
 * Append first-party annotation content to supported existing PDFs without
 * rewriting the original bytes. This incremental writer only accepts files
 * handled by parsePdfDocument and deliberately rejects encrypted documents.
 *
 * pageMetrics is optional; provide [{ canvasWidth, canvasHeight }] when
 * annotation coordinates came from a scaled canvas. Page boxes are taken from
 * the parsed PDF, and any non-zero MediaBox origin is accounted for.
 */
export function addAnnotationsToPdf(input, annotations, { pageMetrics = [] } = {}) {
  if (!Array.isArray(annotations)) throw new TypeError('annotations must be an array.');
  if (!Array.isArray(pageMetrics)) throw new TypeError('pageMetrics must be an array.');
  if (annotations.length === 0) return toBytes(input).slice();

  const sourceBytes = toBytes(input);
  const document = parsePdfDocument(sourceBytes);
  if (Object.hasOwn(document.trailer, 'Encrypt')) {
    throw new SyntaxError('Encrypted PDFs are not supported by the first-party writer yet.');
  }
  if (!Object.hasOwn(document.trailer, 'Root')) throw new SyntaxError('The PDF trailer does not identify a root catalog.');
  
  const maximumObjectNumber = Math.max(
    0,
    Number(document.trailer.Size ?? 1) - 1,
    ...document.objects.keys(),
  );
  let nextObjectNumber = maximumObjectNumber + 1;
  const additions = [];
  const modifiedPages = [];
  let sharedFontObjectNumber = null;

  for (let pageIndex = 0; pageIndex < document.pages.length; pageIndex += 1) {
    const page = document.pages[pageIndex];
    const pageAnnotations = annotations.filter((annotation) => annotation.pageIndex === pageIndex);
    if (pageAnnotations.length === 0) continue;
    if (!Number.isInteger(page.object)) throw new SyntaxError('The PDF page is not stored as an indirect object.');

    const metrics = pageMetrics[pageIndex] ?? {};
    const canvasWidth = metrics.canvasWidth ?? page.width;
    const canvasHeight = metrics.canvasHeight ?? page.height;

    let fontName = 'LuxrajText';
    let updatedResources = page.resources && typeof page.resources === 'object' && !Array.isArray(page.resources)
      ? { ...page.resources }
      : {};
    if (pageAnnotations.some((annotation) => annotation.type === 'text')) {
      let fonts = updatedResources.Font ?? {};
      fonts = resolvePdfValue(fonts, document.objects);
      if (!fonts || typeof fonts !== 'object' || Array.isArray(fonts)) {
        throw new SyntaxError(`Page ${pageIndex + 1} has an unsupported font resources dictionary.`);
      }
      fonts = { ...fonts };
      let suffix = 1;
      while (Object.hasOwn(fonts, fontName)) fontName = `LuxrajText${++suffix}`;
      if (sharedFontObjectNumber === null) {
        sharedFontObjectNumber = nextObjectNumber++;
        additions.push({
          objectNumber: sharedFontObjectNumber,
          generation: 0,
          body: toBytes(serializePdfValue({
            Type: pdfName('Font'),
            Subtype: pdfName('Type1'),
            BaseFont: pdfName('Helvetica'),
            Encoding: pdfName('WinAnsiEncoding'),
          })),
        });
      }
      fonts[fontName] = pdfRef(sharedFontObjectNumber);
      updatedResources.Font = fonts;
    }

    const operators = annotationsToPdfContent(annotations, {
      pageIndex,
      pageWidth: page.width,
      pageHeight: page.height,
      canvasWidth,
      canvasHeight,
      fontName,
    });
    if (!operators) continue;

    const [x0, y0] = page.mediaBox;
    const translatedOperators = (x0 !== 0 || y0 !== 0)
      ? `q\n${formatNumber(x0)} ${formatNumber(y0)} cm\n${operators}Q\n`
      : operators;
    const streamBytes = encoder.encode(translatedOperators);
    const streamObjectNumber = nextObjectNumber++;
    const streamBody = concatBytes([
      toBytes(`<< /Length ${streamBytes.length} >>\nstream\n`),
      streamBytes,
      toBytes('\nendstream'),
    ]);
    additions.push({ objectNumber: streamObjectNumber, generation: 0, body: streamBody });

    const existingContents = page.dictionary.Contents;
    let nextContents;
    if (existingContents === undefined || existingContents === null) {
      nextContents = pdfRef(streamObjectNumber);
    } else if (existingContents instanceof PdfReference) {
      nextContents = [existingContents, pdfRef(streamObjectNumber)];
    } else if (Array.isArray(existingContents) && existingContents.every((value) => value instanceof PdfReference)) {
      nextContents = [...existingContents, pdfRef(streamObjectNumber)];
    } else {
      throw new SyntaxError(`Page ${pageIndex + 1} uses an unsupported direct Contents value.`);
    }

    const updatedDictionary = { ...page.dictionary, Contents: nextContents, Resources: updatedResources };
    const pageRecord = document.objects.get(page.object);
    if (!pageRecord) throw new SyntaxError(`Cannot find the page object ${page.object}.`);
    modifiedPages.push({
      objectNumber: page.object,
      generation: pageRecord.generation,
      body: toBytes(serializePdfValue(updatedDictionary)),
    });
  }

  if (additions.length === 0) return sourceBytes.slice();

  const modifiedByNumber = new Map();
  for (const object of additions) modifiedByNumber.set(object.objectNumber, object);
  for (const object of modifiedPages) modifiedByNumber.set(object.objectNumber, object);

  const prefix = sourceBytes.length && sourceBytes[sourceBytes.length - 1] === 10
    ? new Uint8Array()
    : toBytes('\n');
  const outputParts = [sourceBytes, prefix];
  let absoluteOffset = sourceBytes.length + prefix.length;
  const xrefEntries = [];

  const sortedObjects = [...modifiedByNumber.values()].sort((a, b) => a.objectNumber - b.objectNumber);
  for (const object of sortedObjects) {
    const header = toBytes(`${object.objectNumber} ${object.generation} obj\n`);
    const footer = toBytes('\nendobj\n');
    xrefEntries.push({
      objectNumber: object.objectNumber,
      generation: object.generation,
      offset: absoluteOffset,
    });
    outputParts.push(header, object.body, footer);
    absoluteOffset += header.length + object.body.length + footer.length;
  }

  const xrefOffset = absoluteOffset;
  let xrefText = 'xref\n';
  for (const entry of xrefEntries) {
    xrefText += `${entry.objectNumber} 1\n${String(entry.offset).padStart(10, '0')} ${String(entry.generation).padStart(5, '0')} n \n`;
  }
  const nextTrailer = {
    ...document.trailer,
    Size: Math.max(Number(document.trailer.Size ?? 1), nextObjectNumber),
    Root: document.trailer.Root,
    Prev: document.startXref,
  };
  const trailerText = `trailer\n${serializePdfValue(nextTrailer)}\nstartxref\n${xrefOffset}\n%%EOF\n`;
  outputParts.push(toBytes(xrefText), toBytes(trailerText));
  return concatBytes(outputParts);
}
