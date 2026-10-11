import { addAnnotationsToPdf, parsePdfDocument } from './luxraj-pdf-engine.js';
import { renderPdfPage } from './luxraj-pdf-renderer.js';
import {
  AnnotationHistory, cloneAnnotationList as cloneAnnotations, createAnnotation,
  findAnnotationAt, translateAnnotation, renderAnnotationLayer
} from './luxraj-annotation-core.js';

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
  bytes: null, pdf: null, renderMode: 'first-party', fileName: '', pages: [], annotations: [], selectedId: null,
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
    notify('Opening PDF with the Luxraj renderer…');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsedDocument = await parsePdfDocument(bytes);
    const firstPartyPages = await renderFirstPartyPages(parsedDocument);

    state.bytes = bytes;
    state.pdf = parsedDocument;
    state.renderMode = 'first-party';
    state.fileName = file.name;
    state.pages = firstPartyPages.pages;
    state.annotations = [];
    state.selectedId = null;
    state.history.clear();
    state.nextId = 1;
    els.pagesContainer.replaceChildren();
    els.pagesContainer.append(firstPartyPages.fragment);
    els.welcome.hidden = true;
    els.pagesContainer.hidden = false;
    els.docName.textContent = file.name;
    els.propDocName.textContent = file.name;
    els.propDocPages.textContent = parsedDocument.pages.length + ' page' +
      (parsedDocument.pages.length === 1 ? '' : 's');
    els.pageStatus.textContent = els.propDocPages.textContent;
    els.download.disabled = false;

    renderAllAnnotations();
    updateAnnotationList();
    updateHistoryButtons();
    notify('Opened with the Luxraj PDF renderer.');
  } catch (error) {
    console.error(error);
    notify('Luxraj cannot open this PDF yet: ' + (error.message || 'unsupported PDF format'));
  }
}

async function renderFirstPartyPages(parsedDocument) {
  if (!parsedDocument.pages.length) throw new Error('The first-party reader found no pages.');

  const fragment = document.createDocumentFragment();
  const pages = [];
  for (let index = 0; index < parsedDocument.pages.length; index += 1) {
    const parsedPage = parsedDocument.pages[index];
    const desiredScale = Math.min(1.55, Math.max(0.75,
      (els.scroll.clientWidth - 80) / parsedPage.width));
    const width = Math.ceil(parsedPage.width * desiredScale);
    const height = Math.ceil(parsedPage.height * desiredScale);
    const wrapper = document.createElement('article');
    wrapper.className = 'page-wrap';
    wrapper.dataset.page = String(index);
    wrapper.style.width = width + 'px';
    wrapper.style.height = height + 'px';

    const base = document.createElement('canvas');
    base.className = 'page-base';
    base.width = width;
    base.height = height;
    base.style.width = width + 'px';
    base.style.height = height + 'px';

    const ink = document.createElement('canvas');
    ink.className = 'page-ink';
    ink.width = width;
    ink.height = height;
    ink.style.width = width + 'px';
    ink.style.height = height + 'px';
    ink.setAttribute('aria-label', 'Annotation layer for page ' + (index + 1));

    const result = await renderPdfPage(base.getContext('2d'), parsedDocument, index, {
      scale: desiredScale,
      resizeCanvas: false,
    });
    if (result.warnings.length) {
      throw new Error('The first-party renderer does not yet support all content on page ' +
        (index + 1) + ': ' + result.warnings.join(' '));
    }

    wrapper.append(base, ink);
    const pageState = {
      index,
      pdfPage: { rotate: 0, view: parsedPage.mediaBox },
      viewport: { width, height, scale: desiredScale },
      base,
      ink,
      ctx: ink.getContext('2d'),
      width,
      height,
      pdfWidth: parsedPage.width,
      pdfHeight: parsedPage.height,
      scale: desiredScale,
    };
    ink.addEventListener('pointerdown', event => pointerDown(event, pageState));
    ink.addEventListener('pointermove', event => pointerMove(event, pageState));
    ink.addEventListener('pointerup', event => pointerUp(event, pageState));
    ink.addEventListener('pointercancel', event => pointerUp(event, pageState));
    ink.addEventListener('pointerleave', event => {
      if (state.interaction && state.interaction.pointerId === event.pointerId) pointerUp(event, pageState);
    });
    fragment.append(wrapper);
    pages.push(pageState);
  }
  return { fragment, pages };
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
async function exportPdf() {
  if (!state.bytes || !state.annotations.length) {
    notify(state.annotations.length ? 'Open a PDF before exporting.' : 'Add an annotation before exporting.');
    return;
  }
  const buttonText = els.download.textContent;
  els.download.disabled = true;
  els.download.textContent = 'Preparing…';

  try {
    const sourceDocument = await parsePdfDocument(state.bytes);
    if (sourceDocument.pages.length !== state.pages.length) {
      throw new Error('The page count changed between opening and export.');
    }
    const pageMetrics = state.pages.map((page, index) => {
      if ((Number(page.pdfPage.rotate) || 0) % 360 !== 0) {
        throw new Error('Rotated pages are not yet supported by the Luxraj export engine.');
      }
      const parsedPage = sourceDocument.pages[index];
      if (Math.abs(parsedPage.width - page.pdfWidth) > 1 || Math.abs(parsedPage.height - page.pdfHeight) > 1) {
        throw new Error('The page crop or dimensions changed after opening the PDF.');
      }
      return { canvasWidth: page.width, canvasHeight: page.height };
    });
    // Use only the first-party writer; unsupported features fail explicitly.
    const bytes = await addAnnotationsToPdf(state.bytes, state.annotations, { pageMetrics });
    const verification = await parsePdfDocument(bytes);
    if (verification.pages.length !== sourceDocument.pages.length) {
      throw new Error('The Luxraj writer produced a different page count.');
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.fileName.replace(/\.pdf$/i, '') + '-luxraj-edited.pdf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    notify('PDF exported with the Luxraj PDF Engine.');
  } catch (error) {
    console.error(error);
    notify(`Export failed: ${error.message || 'unsupported PDF feature'}`);
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
