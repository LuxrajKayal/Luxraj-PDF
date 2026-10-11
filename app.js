import {
  AnnotationHistory, cloneAnnotationList as cloneAnnotations, createAnnotation,
  findAnnotationAt, translateAnnotation, renderAnnotationLayer
} from './luxraj-annotation-core.js';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.mjs';

const $ = (selector) => document.querySelector(selector);
const els = {
  fileInput: $('#file-input'), openButton: $('#open-pdf-btn'), changeButton: $('#change-pdf-btn'),
  welcome: $('#welcome-panel'), pagesContainer: $('#pages-container'), scroll: $('#canvas-scroll'),
  docName: $('#document-name'), propDocName: $('#property-doc-name'), propDocPages: $('#property-doc-pages'),
  pageStatus: $('#page-status'), download: $('#download-btn'), undo: $('#undo-btn'), redo: $('#redo-btn'),
  color: $('#stroke-color'), hex: $('#color-hex'), thickness: $('#thickness'), thicknessValue: $('#thickness-value'),
  fill: $('#fill-shapes'), annotationCount: $('#annotation-count'), annotationEmpty: $('#annotation-empty'),
  annotationList: $('#annotation-list'), deleteSelected: $('#delete-selected-btn'), dropOverlay: $('#drop-overlay'),
  toast: $('#toast'), about: $('#about-dialog')
};

const state = {
  bytes: null, pdf: null, fileName: '', pages: [], annotations: [], selectedId: null,
  tool: 'select', color: '#2563eb', thickness: 3, fill: false,
  history: new AnnotationHistory(60), nextId: 1, interaction: null, toastTimer: null
};
const TOOL_NAMES = { select: 'Select', pen: 'Pen', highlight: 'Highlight', rect: 'Box', ellipse: 'Circle', line: 'Line', arrow: 'Arrow', text: 'Text', eraser: 'Eraser' };

function notify(message) {
  els.toast.textContent = message;
  els.toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.remove('visible'), 2600);
}

function snapshot() {
  state.history.push(state.annotations);
  updateHistoryButtons();
}

function updateHistoryButtons() {
  els.undo.disabled = !state.history.canUndo;
  els.redo.disabled = !state.history.canRedo;
}

function undo() {
  const restored = state.history.undo(state.annotations);
  if (!restored) return;
  state.annotations = restored;
  state.selectedId = null;
  renderAllAnnotations(); updateAnnotationList(); updateHistoryButtons();
}
function redo() {
  const restored = state.history.redo(state.annotations);
  if (!restored) return;
  state.annotations = restored;
  state.selectedId = null;
  renderAllAnnotations(); updateAnnotationList(); updateHistoryButtons();
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll('.tool-button').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
  document.querySelectorAll('.page-ink').forEach(canvas => canvas.style.cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair');
}

function hexToRgb(hex, rgbFactory) {
  const value = (hex || '#000000').replace('#', '');
  const full = value.length === 3 ? value.split('').map(ch => ch + ch).join('') : value;
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num)) return rgbFactory(0, 0, 0);
  return rgbFactory(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
}

function normalizeColor(value) {
  const match = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
  if (!match) return null;
  const raw = value.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
  return `#${full.toLowerCase()}`;
}

async function openFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    notify('Please choose a PDF file.'); return;
  }
  if (file.size > 100 * 1024 * 1024) {
    notify('For this early version, please choose a PDF smaller than 100 MB.'); return;
  }
  try {
    notify('Opening PDF…');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    state.bytes = bytes; state.pdf = pdf; state.fileName = file.name;
    state.pages = []; state.annotations = []; state.selectedId = null; state.history.clear(); state.nextId = 1;
    els.pagesContainer.replaceChildren();
    els.welcome.hidden = true; els.pagesContainer.hidden = false;
    els.docName.textContent = file.name;
    els.propDocName.textContent = file.name;
    els.propDocPages.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`;
    els.pageStatus.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`;
    els.download.disabled = false;
    for (let i = 1; i <= pdf.numPages; i++) await renderPage(i);
    renderAllAnnotations(); updateAnnotationList(); updateHistoryButtons();
    notify(`Opened ${file.name}`);
  } catch (error) {
    console.error(error); notify(`Could not open this PDF: ${error.message || 'unknown error'}`);
  }
}

async function renderPage(pageNumber) {
  const pdfPage = await state.pdf.getPage(pageNumber);
  const desiredScale = Math.min(1.55, Math.max(0.75, (els.scroll.clientWidth - 80) / pdfPage.getViewport({ scale: 1 }).width));
  const viewport = pdfPage.getViewport({ scale: desiredScale });
  const wrapper = document.createElement('article');
  wrapper.className = 'page-wrap'; wrapper.dataset.page = String(pageNumber - 1);
  wrapper.style.width = `${Math.ceil(viewport.width)}px`;
  wrapper.style.height = `${Math.ceil(viewport.height)}px`;
  const base = document.createElement('canvas');
  base.className = 'page-base'; base.width = Math.ceil(viewport.width); base.height = Math.ceil(viewport.height);
  base.style.width = `${Math.ceil(viewport.width)}px`; base.style.height = `${Math.ceil(viewport.height)}px`;
  const ink = document.createElement('canvas');
  ink.className = 'page-ink'; ink.width = base.width; ink.height = base.height;
  ink.style.width = `${base.width}px`; ink.style.height = `${base.height}px`;
  ink.setAttribute('aria-label', `Annotation layer for page ${pageNumber}`);
  wrapper.append(base, ink); els.pagesContainer.append(wrapper);
  await pdfPage.render({ canvas: base, canvasContext: base.getContext('2d'), viewport }).promise;
  const pageState = { index: pageNumber - 1, pdfPage, viewport, base, ink, ctx: ink.getContext('2d'), width: base.width, height: base.height, pdfWidth: pdfPage.view[2] - pdfPage.view[0], pdfHeight: pdfPage.view[3] - pdfPage.view[1], scale: desiredScale };
  state.pages.push(pageState);
  ink.addEventListener('pointerdown', event => pointerDown(event, pageState));
  ink.addEventListener('pointermove', event => pointerMove(event, pageState));
  ink.addEventListener('pointerup', event => pointerUp(event, pageState));
  ink.addEventListener('pointercancel', event => pointerUp(event, pageState));
  ink.addEventListener('pointerleave', event => { if (state.interaction && state.interaction.pointerId === event.pointerId) pointerUp(event, pageState); });
}

function pointFromEvent(event, page) {
  const rect = page.ink.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * (page.width / rect.width), y: (event.clientY - rect.top) * (page.height / rect.height) };
}
function newAnnotation(type, pageIndex, point) {
  return createAnnotation(type, pageIndex, point, {
    id: state.nextId++, color: state.color, thickness: state.thickness, fill: state.fill,
    opacity: type === 'highlight' ? 0.33 : 1,
  });
}
function pointerDown(event, page) {
  if (!state.pdf) return;
  if (event.button !== 0 && event.pointerType !== 'touch') return;
  const point = pointFromEvent(event, page); page.ink.setPointerCapture?.(event.pointerId);
  if (state.tool === 'select') {
    const found = findAnnotationAt(state.annotations, page.index, point);
    state.selectedId = found?.id ?? null;
    if (found) state.interaction = { kind: 'move', ann: found, pageIndex: page.index, last: point, moved: false, before: cloneAnnotations(), pointerId: event.pointerId };
    renderAllAnnotations(); updateAnnotationList(); return;
  }
  if (state.tool === 'eraser') {
    const found = findAnnotationAt(state.annotations, page.index, point);
    if (found) { snapshot(); state.annotations = state.annotations.filter(ann => ann.id !== found.id); state.selectedId = null; renderAllAnnotations(); updateAnnotationList(); }
    return;
  }
  if (state.tool === 'text') {
    const text = window.prompt('Text to add to the PDF:');
    if (text && text.trim()) { snapshot(); const ann = newAnnotation('text', page.index, point); ann.text = text.trim(); ann.fontSize = 18; state.annotations.push(ann); state.selectedId = ann.id; renderAllAnnotations(); updateAnnotationList(); }
    return;
  }
  snapshot();
  const ann = newAnnotation(state.tool, page.index, point);
  if (state.tool === 'pen' || state.tool === 'highlight') ann.points = [point];
  else ann.points.push(point);
  state.annotations.push(ann); state.selectedId = ann.id;
  state.interaction = { kind: 'draw', ann, pageIndex: page.index, pointerId: event.pointerId };
  page.ink.style.cursor = 'crosshair';
  renderPageAnnotations(page.index);
}
function pointerMove(event, page) {
  const interaction = state.interaction;
  if (!interaction || interaction.pageIndex !== page.index || interaction.pointerId !== event.pointerId) return;
  const point = pointFromEvent(event, page);
  if (interaction.kind === 'move') {
    const dx = point.x - interaction.last.x, dy = point.y - interaction.last.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) interaction.moved = true;
    translateAnnotation(interaction.ann, dx, dy); interaction.last = point;
  } else if (interaction.kind === 'draw') {
    const ann = interaction.ann;
    if (ann.type === 'pen' || ann.type === 'highlight') ann.points.push(point);
    else ann.points[1] = point;
  }
  renderPageAnnotations(page.index);
}
function pointerUp(event, page) {
  const interaction = state.interaction;
  if (!interaction || interaction.pageIndex !== page.index || interaction.pointerId !== event.pointerId) return;
  state.interaction = null;
  if (interaction.kind === 'move' && interaction.moved) {
    state.history.push(interaction.before);
  }
  if (interaction.kind === 'draw' && interaction.ann.points.length === 2) {
    const a = interaction.ann.points[0], b = interaction.ann.points[1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 3) state.annotations = state.annotations.filter(item => item.id !== interaction.ann.id);
  }
  renderAllAnnotations(); updateAnnotationList(); updateHistoryButtons();
}
function renderPageAnnotations(pageIndex) {
  const page = state.pages[pageIndex]; if (!page) return;
  renderAnnotationLayer(page.ctx, page.width, page.height, state.annotations, pageIndex, state.selectedId, {
    selectionEnabled: state.tool === 'select',
  });
}
function renderAllAnnotations() { state.pages.forEach(page => renderPageAnnotations(page.index)); }
function updateAnnotationList() {
  els.annotationList.replaceChildren();
  els.annotationCount.textContent = String(state.annotations.length);
  els.annotationEmpty.hidden = state.annotations.length > 0;
  els.deleteSelected.disabled = !state.annotations.some(ann => ann.id === state.selectedId);
  for (const ann of [...state.annotations].reverse()) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `annotation-item${ann.id === state.selectedId ? ' selected' : ''}`;
    const swatch = document.createElement('span'); swatch.className = 'ann-color'; swatch.style.background = ann.color;
    const label = document.createElement('span'); label.className = 'ann-label'; label.textContent = ann.type === 'text' ? `Text: ${ann.text}` : (TOOL_NAMES[ann.type] || ann.type);
    const page = document.createElement('span'); page.className = 'ann-page'; page.textContent = `P.${ann.pageIndex + 1}`;
    button.append(swatch,label,page); button.addEventListener('click', () => { state.selectedId = ann.id; setTool('select'); renderAllAnnotations(); updateAnnotationList(); const wrapper=els.pagesContainer.querySelector(`[data-page="${ann.pageIndex}"]`); wrapper?.scrollIntoView({ behavior:'smooth', block:'center' }); });
    els.annotationList.append(button);
  }
}
function deleteSelected() {
  if (!state.annotations.some(ann => ann.id === state.selectedId)) return;
  snapshot(); state.annotations = state.annotations.filter(ann => ann.id !== state.selectedId); state.selectedId = null; renderAllAnnotations(); updateAnnotationList(); updateHistoryButtons();
}
function createTransparentAnnotationOverlay(page, scaleFactor = 2) {
  const overlay = document.createElement('canvas');
  overlay.width = Math.max(1, Math.round(page.width * scaleFactor));
  overlay.height = Math.max(1, Math.round(page.height * scaleFactor));
  const context = overlay.getContext('2d');
  if (!context) throw new Error('Could not create the transparent annotation layer.');

  // Paint the same annotation geometry that the user sees in the live page view.
  // Render at 2x resolution for smoother output, and omit selection outlines.
  const scaledAnnotations = state.annotations
    .filter(annotation => annotation.pageIndex === page.index)
    .map(annotation => ({
      ...annotation,
      thickness: (annotation.thickness ?? 3) * scaleFactor,
      fontSize: annotation.fontSize ? annotation.fontSize * scaleFactor : annotation.fontSize,
      points: (annotation.points ?? []).map(point => ({
        x: point.x * scaleFactor,
        y: point.y * scaleFactor,
      })),
    }));

  renderAnnotationLayer(
    context,
    overlay.width,
    overlay.height,
    scaledAnnotations,
    page.index,
    null,
    { selectionEnabled: false },
  );
  return overlay;
}

function rotateOverlayToPdfPage(overlay, page) {
  const rotation = ((Number(page.viewport.rotation) || 0) % 360 + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new Error(`Page rotation ${rotation}° is not supported for annotation export yet.`);
  }
  if (rotation === 0) return overlay;

  const output = document.createElement('canvas');
  output.width = rotation === 90 || rotation === 270 ? overlay.height : overlay.width;
  output.height = rotation === 90 || rotation === 270 ? overlay.width : overlay.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Could not orient the transparent annotation layer.');

  if (rotation === 90) {
    context.translate(0, output.height);
    context.rotate(-Math.PI / 2);
  } else if (rotation === 180) {
    context.translate(output.width, output.height);
    context.rotate(Math.PI);
  } else if (rotation === 270) {
    context.translate(output.width, 0);
    context.rotate(Math.PI / 2);
  }
  context.drawImage(overlay, 0, 0);
  return output;
}

async function canvasToPngBytes(canvas) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not encode the transparent annotation layer.')), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

async function exportPdf() {
  if (!state.bytes || !state.annotations.length) {
    notify('Open a PDF and add an annotation before exporting.');
    return;
  }

  const buttonText = els.download.textContent;
  els.download.disabled = true;
  els.download.textContent = 'Preparing…';

  try {
    // Keep the input PDF untouched except for embedding one transparent PNG
    // overlay per annotated page. The image is generated from the same canvas
    // coordinate space used by the live editor, avoiding a second text layout.
    const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
    const document = await PDFDocument.load(state.bytes.slice());

    for (const pageState of state.pages) {
      const pageAnnotations = state.annotations.filter(annotation => annotation.pageIndex === pageState.index);
      if (!pageAnnotations.length) continue;

      const overlay = createTransparentAnnotationOverlay(pageState, 2);
      const pdfOrientedOverlay = rotateOverlayToPdfPage(overlay, pageState);
      const pngBytes = await canvasToPngBytes(pdfOrientedOverlay);
      const image = await document.embedPng(pngBytes);
      const pdfPage = document.getPage(pageState.index);
      const [left, bottom, right, top] = pageState.pdfPage.view;

      // PDF.js's page view box gives the actual displayed/cropped PDF region.
      // Draw the transparent image over that exact region in native PDF units.
      pdfPage.drawImage(image, {
        x: left,
        y: bottom,
        width: right - left,
        height: top - bottom,
      });
    }

    const bytes = await document.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.fileName.replace(/\.pdf$/i, '') + '-luxraj-edited.pdf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    notify('PDF exported with the transparent annotation layer.');
  } catch (error) {
    console.error(error);
    notify(`Export failed: ${error.message || 'unknown error'}`);
  } finally {
    els.download.disabled = false;
    els.download.textContent = buttonText;
  }
}

els.openButton.addEventListener('click', () => els.fileInput.click());
els.changeButton.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', event => openFile(event.target.files?.[0]));
els.download.addEventListener('click', exportPdf); els.undo.addEventListener('click', undo); els.redo.addEventListener('click', redo); els.deleteSelected.addEventListener('click', deleteSelected);
document.querySelectorAll('.tool-button').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
els.color.addEventListener('input', () => { state.color=els.color.value; els.hex.value=state.color; });
els.hex.addEventListener('change', () => { const value=normalizeColor(els.hex.value); if (!value) { els.hex.value=state.color; notify('Enter a valid hex color.'); return; } state.color=value; els.color.value=value; els.hex.value=value; });
els.thickness.addEventListener('input', () => { state.thickness=Number(els.thickness.value); els.thicknessValue.textContent=String(state.thickness); });
els.fill.addEventListener('change', () => { state.fill=els.fill.checked; });
$('#about-btn').addEventListener('click', () => els.about.showModal()); $('#close-about-btn').addEventListener('click', () => els.about.close()); $('#about-ok-btn').addEventListener('click', () => els.about.close());

window.addEventListener('keydown', event => {
  const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='y') { event.preventDefault(); redo(); return; }
  if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
  const shortcuts = { v:'select',p:'pen',h:'highlight',r:'rect',o:'ellipse',l:'line',a:'arrow',t:'text',e:'eraser' };
  if (shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
  if (event.key==='Delete' || event.key==='Backspace') deleteSelected();
  if (event.key==='Escape' && els.about.open) els.about.close();
});

window.addEventListener('dragover', event => { event.preventDefault(); els.dropOverlay.hidden=false; });
window.addEventListener('dragleave', event => { if (event.relatedTarget===null) els.dropOverlay.hidden=true; });
window.addEventListener('drop', event => { event.preventDefault(); els.dropOverlay.hidden=true; const file=event.dataTransfer?.files?.[0]; if (file) openFile(file); });

window.addEventListener('resize', () => {
  // Rendering stays at the initial page scale so pointer coordinates remain aligned with each overlay.
});
setTool('select');
