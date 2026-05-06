/**
 * qr-generator.js
 * Uses qrcode-generator (MIT) loaded via CDN in the HTML page.
 * Renders to a <canvas> so we can:
 *  – apply foreground / background colours
 *  – choose square vs rounded dots
 *  – composite a user-supplied centre logo
 *  – download the final image
 */

(function () {
  'use strict';

  /* ── DOM refs ─────────────────────────────────────────────────── */
  const urlInput        = document.getElementById('qr-url');
  const fgColor         = document.getElementById('fg-color');
  const bgColor         = document.getElementById('bg-color');
  const bgTransparent   = document.getElementById('bg-transparent');
  const sizeSelect      = document.getElementById('qr-size');
  const errorLevelSel   = document.getElementById('error-level');
  const dotStyleBtns    = document.querySelectorAll('.shape-btn[data-dot]');
  const logoUpload      = document.getElementById('logo-upload');
  const logoSizeSl      = document.getElementById('logo-size');
  const logoSizeVal     = document.getElementById('logo-size-val');
  const generateBtn     = document.getElementById('generate-btn');
  const downloadBtn     = document.getElementById('download-btn');
  const previewWrap     = document.getElementById('qr-preview-wrap');
  const canvasContainer = document.getElementById('qr-canvas-container');
  const statusBar       = document.getElementById('qr-status');

  /* ── State ────────────────────────────────────────────────────── */
  let currentDotStyle = 'square';
  let logoImage       = null;   // HTMLImageElement | null
  let canvas          = null;   // live canvas element

  /* ── Shape button selection ───────────────────────────────────── */
  dotStyleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dotStyleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDotStyle = btn.dataset.dot;
    });
  });

  /* ── Logo size label ──────────────────────────────────────────── */
  logoSizeSl.addEventListener('input', () => {
    logoSizeVal.textContent = logoSizeSl.value + '%';
  });

  /* ── Logo upload ──────────────────────────────────────────────── */
  logoUpload.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) { logoImage = null; return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => { logoImage = img; };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  /* ── Transparent BG toggle ────────────────────────────────────── */
  bgTransparent.addEventListener('change', () => {
    bgColor.disabled = bgTransparent.checked;
    bgColor.style.opacity = bgTransparent.checked ? '.35' : '1';
  });

  /* ── Generate ─────────────────────────────────────────────────── */
  generateBtn.addEventListener('click', generate);
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') generate(); });

  function generate() {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      showStatus('Please enter a URL or text to encode.', 'error');
      return;
    }

    const size        = parseInt(sizeSelect.value, 10);   // canvas px
    const errorLevel  = errorLevelSel.value;              // L M Q H
    const fg          = fgColor.value;
    const bg          = bgTransparent.checked ? null : bgColor.value;

    try {
      /* -- build raw QR data matrix via qrcode-generator library -- */
      const qr = window.qrcode(0, errorLevel);
      qr.addData(rawUrl);
      qr.make();

      const moduleCount = qr.getModuleCount();   // e.g. 25-177
      const cellSize    = size / moduleCount;

      /* -- create / reset canvas -- */
      canvasContainer.innerHTML = '';
      canvas = document.createElement('canvas');
      canvas.width  = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      /* background */
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);
      } else {
        ctx.clearRect(0, 0, size, size);
      }

      /* dots */
      ctx.fillStyle = fg;
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (!qr.isDark(row, col)) continue;
          const x = col * cellSize;
          const y = row * cellSize;
          drawDot(ctx, x, y, cellSize, currentDotStyle);
        }
      }

      /* centre logo */
      if (logoImage) {
        const logoFrac  = parseInt(logoSizeSl.value, 10) / 100;
        const logoSize  = size * logoFrac;
        const logoX     = (size - logoSize) / 2;
        const logoY     = (size - logoSize) / 2;
        const padding   = 4;

        /* white backing for readability */
        if (bg) {
          ctx.fillStyle = bg;
        } else {
          ctx.fillStyle = '#ffffff';
        }
        roundRect(ctx, logoX - padding, logoY - padding,
                  logoSize + padding * 2, logoSize + padding * 2, 6);

        ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
      }

      canvasContainer.appendChild(canvas);
      previewWrap.style.display = 'flex';
      downloadBtn.disabled = false;
      showStatus('QR code generated! ✓', 'ok');
    } catch (err) {
      showStatus('Error generating QR code: ' + err.message, 'error');
    }
  }

  /* ── Dot drawing helpers ──────────────────────────────────────── */
  function drawDot(ctx, x, y, size, style) {
    const padding = size * 0.05;
    const s = size - padding * 2;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const r  = s / 2;

    switch (style) {
      case 'rounded':
        roundRect(ctx, x + padding, y + padding, s, s, s * 0.3);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'diamond': {
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
        ctx.fill();
        break;
      }
      default: /* square */
        ctx.fillRect(x + padding, y + padding, s, s);
    }
  }

  function roundRect(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y,     x + w, y + h,     radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x,     y + h,     radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x,     y + h, x,     y,         radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x,     y,     x + w, y,         radius);
    ctx.closePath();
    ctx.fill();
  }

  /* ── Download ─────────────────────────────────────────────────── */
  downloadBtn.addEventListener('click', () => {
    if (!canvas) return;
    const link    = document.createElement('a');
    link.download = 'qrcode.png';
    link.href     = canvas.toDataURL('image/png');
    link.click();
  });

  /* ── Status helper ────────────────────────────────────────────── */
  function showStatus(msg, type) {
    statusBar.textContent = msg;
    statusBar.className   = 'status-bar ' + type;
  }
})();
