import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AnnotationHistory,
  annotationBounds,
  cloneAnnotationList,
  createAnnotation,
  drawAnnotation,
  findAnnotationAt,
  normalizeHexColor,
  parseAnnotationState,
  renderAnnotationLayer,
  serializeAnnotationState,
  translateAnnotation,
} from '../luxraj-annotation-core.js';

function mockCanvasContext() {
  const calls = [];
  const ctx = {
    calls,
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: '', lineJoin: '', font: '',
    save() { calls.push(['save']); }, restore() { calls.push(['restore']); },
    beginPath() { calls.push(['beginPath']); }, moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); }, stroke() { calls.push(['stroke']); },
    fill() { calls.push(['fill']); }, fillRect(...args) { calls.push(['fillRect', ...args]); },
    strokeRect(...args) { calls.push(['strokeRect', ...args]); },
    ellipse(...args) { calls.push(['ellipse', ...args]); }, fillText(...args) { calls.push(['fillText', ...args]); },
    setLineDash(...args) { calls.push(['setLineDash', ...args]); }, clearRect(...args) { calls.push(['clearRect', ...args]); },
  };
  return ctx;
}

test('createAnnotation normalizes defaults and coordinates', () => {
  const ann = createAnnotation('rect', 0, { x: 4, y: 7 }, { id: 12, color: '#abc', thickness: 2 });
  assert.equal(ann.id, 12);
  assert.equal(ann.color, '#aabbcc');
  assert.deepEqual(ann.points, [{ x: 4, y: 7 }]);
  assert.equal(ann.fill, false);
});

test('createAnnotation rejects unknown annotation types and invalid points', () => {
  assert.throws(() => createAnnotation('sticker', 0, { x: 1, y: 2 }), /Unsupported annotation type/);
  assert.throws(() => createAnnotation('line', 0, { x: NaN, y: 2 }), /finite numeric/);
  assert.throws(() => createAnnotation('line', -1, { x: 1, y: 2 }), /non-negative integer/);
});

test('color values normalize to six-digit lowercase hex', () => {
  assert.equal(normalizeHexColor('#ABC'), '#aabbcc');
  assert.equal(normalizeHexColor('123456'), '#123456');
  assert.throws(() => normalizeHexColor('red'), /hex value/);
});

test('bounds handle reverse-drag rectangles and text labels', () => {
  const rect = { type: 'rect', points: [{ x: 90, y: 80 }, { x: 10, y: 20 }] };
  assert.deepEqual(annotationBounds(rect), { x: 10, y: 20, w: 80, h: 60 });
  const text = { type: 'text', points: [{ x: 20, y: 50 }], text: 'Hi', fontSize: 10 };
  assert.deepEqual(annotationBounds(text), { x: 20, y: 40, w: 12, h: 10 });
});

test('hit testing returns the topmost annotation on the specified page', () => {
  const lower = { id: 1, type: 'rect', pageIndex: 0, thickness: 2, points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] };
  const upper = { id: 2, type: 'ellipse', pageIndex: 0, thickness: 2, points: [{ x: 15, y: 15 }, { x: 28, y: 28 }] };
  const otherPage = { id: 3, type: 'rect', pageIndex: 1, thickness: 2, points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] };
  assert.equal(findAnnotationAt([lower, upper, otherPage], 0, { x: 18, y: 18 }).id, 2);
  assert.equal(findAnnotationAt([lower, upper, otherPage], 1, { x: 18, y: 18 }).id, 3);
  assert.equal(findAnnotationAt([lower], 0, { x: 100, y: 100 }), null);
});

test('translateAnnotation moves every freehand point without changing type or page', () => {
  const ann = { id: 7, type: 'pen', pageIndex: 2, points: [{ x: 1, y: 3 }, { x: 4, y: 8 }] };
  translateAnnotation(ann, 10, -2);
  assert.deepEqual(ann.points, [{ x: 11, y: 1 }, { x: 14, y: 6 }]);
  assert.equal(ann.type, 'pen');
  assert.equal(ann.pageIndex, 2);
});

test('history supports undo and redo and clears redo after a new action', () => {
  const history = new AnnotationHistory(2);
  const empty = [];
  const one = [{ id: 1, type: 'pen', pageIndex: 0, points: [{ x: 1, y: 1 }] }];
  const two = [...one, { id: 2, type: 'line', pageIndex: 0, points: [{ x: 1, y: 1 }, { x: 4, y: 4 }] }];
  history.push(empty);
  assert.deepEqual(history.undo(one), empty);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(empty), one);
  history.push(one);
  history.push(two);
  history.push(empty);
  assert.equal(history.undoStack.length, 2);
  assert.equal(history.canRedo, false);
});

test('drawing core renders shapes and selection indicator using a canvas-like context', () => {
  const ctx = mockCanvasContext();
  const rect = { id: 1, type: 'rect', pageIndex: 0, color: '#000000', thickness: 2, fill: false, points: [{ x: 20, y: 30 }, { x: 5, y: 10 }] };
  drawAnnotation(ctx, rect, true);
  assert.ok(ctx.calls.some(call => call[0] === 'strokeRect' && call[1] === 5 && call[2] === 10 && call[3] === 15 && call[4] === 20));
  assert.ok(ctx.calls.some(call => call[0] === 'setLineDash'));
  assert.equal(ctx.calls.at(-1)[0], 'restore');
});

test('renderAnnotationLayer only renders matching page annotations', () => {
  const ctx = mockCanvasContext();
  const items = [
    { id: 1, type: 'line', pageIndex: 0, color: '#000000', thickness: 2, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
    { id: 2, type: 'line', pageIndex: 1, color: '#000000', thickness: 2, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
  ];
  renderAnnotationLayer(ctx, 100, 100, items, 0);
  assert.equal(ctx.calls.filter(call => call[0] === 'moveTo').length, 1);
});

test('annotation state serializes and validates round trips', () => {
  const annotations = [createAnnotation('pen', 0, { x: 12, y: 14 }, { id: 1, color: '#abc' })];
  annotations[0].points.push({ x: 17, y: 19 });
  const serialized = serializeAnnotationState({ documentName: 'sample.pdf', pages: [{ index: 0, pdfWidth: 612, pdfHeight: 792 }], annotations });
  const parsed = parseAnnotationState(serialized);
  assert.equal(parsed.documentName, 'sample.pdf');
  assert.equal(parsed.annotations[0].color, '#aabbcc');
  assert.deepEqual(parsed.annotations[0].points, [{ x: 12, y: 14 }, { x: 17, y: 19 }]);
  assert.throws(() => parseAnnotationState('{"format":"unknown","version":1,"annotations":[]}'), /Unsupported or invalid/);
});

test('cloneAnnotationList isolates nested points from the original data', () => {
  const source = [{ id: 1, points: [{ x: 2, y: 3 }] }];
  const copy = cloneAnnotationList(source);
  copy[0].points[0].x = 99;
  assert.equal(source[0].points[0].x, 2);
});
