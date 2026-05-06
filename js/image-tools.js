/**
 * image-tools.js
 * All processing is done on an off-screen <canvas> — no server uploads.
 *
 * Operations:
 *  • Remove background  – replaces near-white pixels with transparency (PNG output)
 *  • Resize             – scale by percentage or to exact dimensions
 *  • Compress           – lower JPEG/WebP quality
 *  • Convert format     – PNG, JPEG, WebP, BMP (via canvas.toDataURL)
 */

(function () {
  'use strict';

  /* ── Shared state ────────────────────────────────────────────── */
  let sourceImage   = null;   // HTMLImageElement of the uploaded file
  let sourceFile    = null;   // original File object
  let resultDataUrl = null;   // last processed result
  let resultMime    = 'image/png';
  let resultExt     = 'png';

  /* ── Tab logic ───────────────────────────────────────────────── */
  const tabBtns  = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  /* ── Drop zone / file input ──────────────────────────────────── */
  const dropZone    = document.getElementById('drop-zone');
  const fileInput   = document.getElementById('file-input');
  const srcPreview  = document.getElementById('src-preview');
  const srcImg      = document.getElementById('src-img');
  const srcMeta     = document.getElementById('src-meta');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
  });

  function loadFile(file) {
    if (!file.type.startsWith('image/')) {
      showStatus('Please upload an image file.', 'error');
      return;
    }
    sourceFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        sourceImage = img;
        srcImg.src = ev.target.result;
        srcPreview.style.display = 'block';
        srcMeta.textContent =
          `${img.naturalWidth} × ${img.naturalHeight} px  •  ${formatBytes(file.size)}  •  ${file.type}`;
        const p = dropZone.querySelector('p');
        p.textContent = '';
        const strong = document.createElement('strong');
        strong.textContent = file.name;
        p.appendChild(strong);
        p.appendChild(document.createTextNode(' loaded — choose a tab below to process it.'));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    resetResult();
  }

  /* ── Result area ─────────────────────────────────────────────── */
  const resultBox     = document.getElementById('result-box');
  const resultCanvas  = document.getElementById('result-canvas');
  const resultMeta    = document.getElementById('result-meta');
  const downloadBtn   = document.getElementById('download-result');
  const statusBar     = document.getElementById('img-status');

  function showResult(canvas, mime, ext) {
    resultMime    = mime;
    resultExt     = ext;
    const quality = mime === 'image/png' ? undefined : 0.92;
    resultDataUrl = canvas.toDataURL(mime, quality);

    /* copy to display canvas */
    resultCanvas.width  = canvas.width;
    resultCanvas.height = canvas.height;
    resultCanvas.getContext('2d').drawImage(canvas, 0, 0);

    /* size of the data URL encoded output (approx file size) */
    /* Approximate byte size: base64 encodes 3 bytes as 4 chars, so multiply by 0.75 */
    const bytes = Math.round((resultDataUrl.length - resultDataUrl.indexOf(',') - 1) * 0.75);
    resultMeta.textContent =
      `${canvas.width} × ${canvas.height} px  •  ~${formatBytes(bytes)}  •  ${mime}`;

    resultBox.style.display = 'block';
    downloadBtn.disabled = false;
    showStatus('Done! ✓', 'ok');
  }

  function resetResult() {
    resultBox.style.display = 'none';
    resultDataUrl = null;
    downloadBtn.disabled = true;
    statusBar.className = 'status-bar';
  }

  downloadBtn.addEventListener('click', () => {
    if (!resultDataUrl) return;
    const link = document.createElement('a');
    link.download = buildFileName(sourceFile ? sourceFile.name : 'image', resultExt);
    link.href = resultDataUrl;
    link.click();
  });

  /* ── Background Removal ──────────────────────────────────────── */
  const bgThreshSl  = document.getElementById('bg-thresh');
  const bgThreshVal = document.getElementById('bg-thresh-val');
  const bgRemoveBtn = document.getElementById('bg-remove-btn');

  bgThreshSl.addEventListener('input', () => {
    bgThreshVal.textContent = bgThreshSl.value;
  });

  bgRemoveBtn.addEventListener('click', () => {
    if (!requireImage()) return;
    showStatus('Removing background…', 'info');

    const threshold = parseInt(bgThreshSl.value, 10);
    const { canvas, ctx } = toCanvas(sourceImage);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      /* near-white check */
      if (r >= threshold && g >= threshold && b >= threshold) {
        data[i + 3] = 0; // fully transparent
      }
    }
    ctx.putImageData(imageData, 0, 0);
    showResult(canvas, 'image/png', 'png');
  });

  /* ── Resize ──────────────────────────────────────────────────── */
  const resizeMode   = document.getElementById('resize-mode');
  const resizePctWrap= document.getElementById('resize-pct-wrap');
  const resizeDimWrap= document.getElementById('resize-dim-wrap');
  const resizePct    = document.getElementById('resize-pct');
  const resizePctVal = document.getElementById('resize-pct-val');
  const resizeW      = document.getElementById('resize-w');
  const resizeH      = document.getElementById('resize-h');
  const keepAspect   = document.getElementById('keep-aspect');
  const resizeBtn    = document.getElementById('resize-btn');

  resizeMode.addEventListener('change', () => {
    resizePctWrap.style.display = resizeMode.value === 'percent'  ? 'block' : 'none';
    resizeDimWrap.style.display = resizeMode.value === 'pixels'   ? 'block' : 'none';
  });

  resizePct.addEventListener('input', () => {
    resizePctVal.textContent = resizePct.value + '%';
  });

  /* live aspect ratio on width change */
  resizeW.addEventListener('input', () => {
    if (!sourceImage || !keepAspect.checked) return;
    const ratio = sourceImage.naturalHeight / sourceImage.naturalWidth;
    resizeH.value = Math.round(parseInt(resizeW.value || 0, 10) * ratio) || '';
  });

  resizeH.addEventListener('input', () => {
    if (!sourceImage || !keepAspect.checked) return;
    const ratio = sourceImage.naturalWidth / sourceImage.naturalHeight;
    resizeW.value = Math.round(parseInt(resizeH.value || 0, 10) * ratio) || '';
  });

  resizeBtn.addEventListener('click', () => {
    if (!requireImage()) return;
    showStatus('Resizing…', 'info');

    let targetW, targetH;
    if (resizeMode.value === 'percent') {
      const pct = parseInt(resizePct.value, 10) / 100;
      targetW = Math.round(sourceImage.naturalWidth  * pct);
      targetH = Math.round(sourceImage.naturalHeight * pct);
    } else {
      targetW = parseInt(resizeW.value, 10) || sourceImage.naturalWidth;
      targetH = parseInt(resizeH.value, 10) || sourceImage.naturalHeight;
    }

    const canvas = document.createElement('canvas');
    canvas.width  = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceImage, 0, 0, targetW, targetH);

    const mime = getMimeForFormat(document.getElementById('resize-fmt').value);
    const ext  = document.getElementById('resize-fmt').value;
    showResult(canvas, mime, ext);
  });

  /* ── Compress ────────────────────────────────────────────────── */
  const compressQuality  = document.getElementById('compress-quality');
  const compressQualVal  = document.getElementById('compress-qual-val');
  const compressFmt      = document.getElementById('compress-fmt');
  const compressBtn      = document.getElementById('compress-btn');

  compressQuality.addEventListener('input', () => {
    compressQualVal.textContent = compressQuality.value + '%';
  });

  compressBtn.addEventListener('click', () => {
    if (!requireImage()) return;
    showStatus('Compressing…', 'info');

    const { canvas } = toCanvas(sourceImage);
    const quality = parseInt(compressQuality.value, 10) / 100;
    const fmt  = compressFmt.value;
    const mime = getMimeForFormat(fmt);

    /* Use explicit quality for lossy formats */
    resultMime    = mime;
    resultExt     = fmt;
    const dataUrl = canvas.toDataURL(mime, quality);
    resultDataUrl = dataUrl;

    resultCanvas.width  = canvas.width;
    resultCanvas.height = canvas.height;
    resultCanvas.getContext('2d').drawImage(canvas, 0, 0);

    const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    resultMeta.textContent =
      `${canvas.width} × ${canvas.height} px  •  ~${formatBytes(bytes)}  •  ${mime} @ ${compressQuality.value}%`;

    resultBox.style.display = 'block';
    downloadBtn.disabled = false;
    showStatus('Done! ✓', 'ok');
  });

  /* ── Convert Format ──────────────────────────────────────────── */
  const convertFmt = document.getElementById('convert-fmt');
  const convertBtn = document.getElementById('convert-btn');

  convertBtn.addEventListener('click', () => {
    if (!requireImage()) return;
    showStatus('Converting…', 'info');

    const fmt  = convertFmt.value;
    const mime = getMimeForFormat(fmt);
    const { canvas } = toCanvas(sourceImage);

    showResult(canvas, mime, fmt);
  });

  /* ── Helpers ─────────────────────────────────────────────────── */
  function requireImage() {
    if (!sourceImage) {
      showStatus('Please upload an image first.', 'error');
      return false;
    }
    return true;
  }

  function toCanvas(img) {
    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { canvas, ctx };
  }

  function getMimeForFormat(ext) {
    const map = {
      png:  'image/png',
      jpg:  'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      bmp:  'image/bmp',
    };
    return map[ext] || 'image/png';
  }

  function buildFileName(original, ext) {
    const base = original.replace(/\.[^.]+$/, '');
    return `${base}_processed.${ext}`;
  }

  function formatBytes(bytes) {
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function showStatus(msg, type) {
    statusBar.textContent = msg;
    statusBar.className   = 'status-bar ' + type;
  }
})();
