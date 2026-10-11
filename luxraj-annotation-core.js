/*
 * Luxraj Annotation Core
 * Copyright (c) 2026 Luxraj Editor. All rights reserved.
 *
 * First-party annotation data, geometry, history, and canvas drawing utilities.
 * This module has no third-party runtime dependencies.
 */

export const ANNOTATION_TYPES = Object.freeze([
  'pen', 'highlight', 'rect', 'ellipse', 'line', 'arrow', 'text'
]);

const DEFAULTS = Object.freeze({
  color: '#2563eb',
  thickness: 3,
  opacity: 1,
  fill: false,
  fontSize: 18,
});

export function cloneAnnotationList(annotations = []) {
  return JSON.parse(JSON.stringify(annotations));
}

export function createAnnotation(type, pageIndex, point, options = {}) {
  if (!ANNOTATION_TYPES.includes(type)) {
    throw new TypeError(`Unsupported annotation type: ${type}`);
  }
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new TypeError('pageIndex must be a non-negative integer.');
  }
  const origin = normalizePoint(point);
  const thickness = Number(options.thickness ?? DEFAULTS.thickness);
  const opacity = Number(options.opacity ?? (type === 'highlight' ? 0.33 : DEFAULTS.opacity));
  if (!Number.isFinite(thickness) || thickness <= 0) throw new TypeError('thickness must be a positive number.');
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new TypeError('opacity must be between 0 and 1.');

  return {
    id: options.id ?? createAnnotationId(),
    type,
    pageIndex,
    color: normalizeHexColor(options.color ?? DEFAULTS.color),
    thickness,
    fill: Boolean(options.fill ?? DEFAULTS.fill),
    opacity,
    points: [{ x: origin.x, y: origin.y }],
  };
}

let localIdCounter = 1;
function createAnnotationId() {
  // No crypto API is required; this is an editor-local identifier, not a security token.
  return `luxraj-ann-${Date.now().toString(36)}-${(localIdCounter++).toString(36)}`;
}

export function normalizePoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError('A point must contain finite numeric x and y coordinates.');
  }
  return { x: point.x, y: point.y };
}

export function normalizeHexColor(value) {
  if (typeof value !== 'string' || !/^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(value.trim())) {
    throw new TypeError('Color must be a 3- or 6-digit hex value.');
  }
  let hex = value.trim().replace(/^#/, '');
  if (hex.length === 3) hex = [...hex].map((ch) => ch + ch).join('');
  return `#${hex.toLowerCase()}`;
}

export function annotationBounds(annotation) {
  const points = Array.isArray(annotation?.points) ? annotation.points : [
    { x: annotation?.x1 ?? annotation?.x ?? 0, y: annotation?.y1 ?? annotation?.y ?? 0 },
    { x: annotation?.x2 ?? annotation?.x ?? 0, y: annotation?.y2 ?? annotation?.y ?? 0 },
  ];
  const valid = points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = valid.map((point) => point.x);
  const ys = valid.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  // Text anchors need a practical selection target even though glyph widths vary.
  if (annotation.type === 'text' && valid.length === 1) {
    return { x: minX, y: minY - (annotation.fontSize ?? DEFAULTS.fontSize), w: Math.max(12, String(annotation.text ?? '').length * (annotation.fontSize ?? DEFAULTS.fontSize) * 0.55), h: annotation.fontSize ?? DEFAULTS.fontSize };
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function findAnnotationAt(annotations, pageIndex, point, options = {}) {
  const target = normalizePoint(point);
  const minPadding = Number(options.minPadding ?? 9);
  const candidates = annotations.filter((annotation) => annotation.pageIndex === pageIndex);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const annotation = candidates[i];
    const bounds = annotationBounds(annotation);
    const padding = Math.max(minPadding, Number(annotation.thickness ?? DEFAULTS.thickness) * 2);
    if (
      target.x >= bounds.x - padding && target.x <= bounds.x + bounds.w + padding &&
      target.y >= bounds.y - padding && target.y <= bounds.y + bounds.h + padding
    ) return annotation;
  }
  return null;
}

export function translateAnnotation(annotation, deltaX, deltaY) {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    throw new TypeError('Translation offsets must be finite numbers.');
  }
  if (Array.isArray(annotation.points)) {
    annotation.points = annotation.points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY }));
  } else {
    if (Number.isFinite(annotation.x)) annotation.x += deltaX;
    if (Number.isFinite(annotation.y)) annotation.y += deltaY;
    if (Number.isFinite(annotation.x1)) annotation.x1 += deltaX;
    if (Number.isFinite(annotation.y1)) annotation.y1 += deltaY;
    if (Number.isFinite(annotation.x2)) annotation.x2 += deltaX;
    if (Number.isFinite(annotation.y2)) annotation.y2 += deltaY;
  }
  return annotation;
}

export function drawAnnotation(context, annotation, selected = false, options = {}) {
  const points = Array.isArray(annotation.points) ? annotation.points : [];
  const selectionColor = options.selectionColor ?? '#2563eb';
  context.save();
  context.globalAlpha = annotation.opacity ?? DEFAULTS.opacity;
  context.strokeStyle = annotation.color ?? DEFAULTS.color;
  context.fillStyle = annotation.color ?? DEFAULTS.color;
  context.lineWidth = annotation.thickness ?? DEFAULTS.thickness;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (annotation.type === 'highlight') {
    context.globalAlpha = annotation.opacity ?? 0.33;
    context.lineWidth = Math.max(12, (annotation.thickness ?? DEFAULTS.thickness) * 4);
  }

  if (annotation.type === 'pen' || annotation.type === 'highlight') {
    if (points.length > 0) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y);
      context.stroke();
    }
  } else if (points.length >= 2) {
    const start = points[0];
    const end = points[1];
    if (annotation.type === 'rect') {
      const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
      if (annotation.fill) context.fillRect(x, y, width, height);
      else context.strokeRect(x, y, width, height);
    } else if (annotation.type === 'ellipse') {
      context.beginPath();
      context.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2);
      if (annotation.fill) context.fill(); else context.stroke();
    } else if (annotation.type === 'line' || annotation.type === 'arrow') {
      context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
      if (annotation.type === 'arrow') {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const size = Math.max(9, (annotation.thickness ?? DEFAULTS.thickness) * 3.2);
        context.beginPath();
        context.moveTo(end.x, end.y);
        context.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
        context.moveTo(end.x, end.y);
        context.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
        context.stroke();
      }
    }
  } else if (annotation.type === 'text' && points.length > 0) {
    context.font = `600 ${annotation.fontSize ?? DEFAULTS.fontSize}px system-ui, sans-serif`;
    context.fillText(annotation.text ?? '', points[0].x, points[0].y);
  }

  if (selected) {
    const bounds = annotationBounds(annotation);
    context.globalAlpha = 1;
    context.strokeStyle = selectionColor;
    context.lineWidth = 1;
    context.setLineDash([4, 3]);
    context.strokeRect(bounds.x - 5, bounds.y - 5, Math.max(10, bounds.w + 10), Math.max(10, bounds.h + 10));
  }
  context.restore();
}

export function renderAnnotationLayer(context, width, height, annotations, pageIndex, selectedId = null, options = {}) {
  context.clearRect(0, 0, width, height);
  const selectionEnabled = options.selectionEnabled !== false;
  for (const annotation of annotations) {
    if (annotation.pageIndex !== pageIndex) continue;
    drawAnnotation(context, annotation, selectionEnabled && annotation.id === selectedId, options);
  }
}

export class AnnotationHistory {
  constructor(limit = 60) {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError('History limit must be a positive integer.');
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  push(annotations) {
    this.undoStack.push(cloneAnnotationList(annotations));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  undo(currentAnnotations) {
    if (!this.canUndo) return null;
    this.redoStack.push(cloneAnnotationList(currentAnnotations));
    return this.undoStack.pop();
  }
  redo(currentAnnotations) {
    if (!this.canRedo) return null;
    this.undoStack.push(cloneAnnotationList(currentAnnotations));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    return this.redoStack.pop();
  }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; }
}

export function serializeAnnotationState({ documentName = '', pages = [], annotations = [] } = {}) {
  return JSON.stringify({
    format: 'luxraj-annotation-state',
    version: 1,
    documentName: String(documentName),
    pages: pages.map(({ index, pdfWidth, pdfHeight }) => ({ index, pdfWidth, pdfHeight })),
    annotations: cloneAnnotationList(annotations),
  }, null, 2);
}

export function parseAnnotationState(serialized) {
  const data = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  if (!data || data.format !== 'luxraj-annotation-state' || data.version !== 1 || !Array.isArray(data.annotations)) {
    throw new TypeError('Unsupported or invalid Luxraj annotation-state file.');
  }
  for (const item of data.annotations) {
    if (!item || !ANNOTATION_TYPES.includes(item.type) || !Number.isInteger(item.pageIndex) || item.pageIndex < 0 || !Array.isArray(item.points)) {
      throw new TypeError('The annotation-state file contains an invalid annotation.');
    }
    item.points.forEach(normalizePoint);
    item.color = normalizeHexColor(item.color ?? DEFAULTS.color);
    if (!Number.isFinite(item.thickness) || item.thickness <= 0) item.thickness = DEFAULTS.thickness;
    if (!Number.isFinite(item.opacity) || item.opacity < 0 || item.opacity > 1) item.opacity = DEFAULTS.opacity;
  }
  return data;
}
