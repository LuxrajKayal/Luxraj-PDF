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
  const bytes = encoder.encode(name.value);
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
      Resources: { Font: { F1: pdfRef(3) } },
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
      commands.push(`BT /F1 ${formatNumber(size)} Tf ${formatNumber(point.x)} ${formatNumber(point.y)} Td ${pdfTextLiteral(annotation.text ?? '')} Tj ET`);
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
