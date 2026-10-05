/* ===================================================
   TICKET GENERATOR — script.js
   Single source of truth: ticket.png (1536 x 1024, RGB)
   =================================================== */

// ─── OVERLAY ZONE CONFIG (ratios of FULL source image) ───
const ZONES = {
  // Name zone: between the two gold rules on the right stub
  name: {
    xLeft:    0.6999,   // left edge of lower gold rule
    xRight:   0.9368,   // right edge of lower gold rule
    yTop:     0.4980,   // just below PARTICIPANT NAME label bottom
    yBottom:  0.5440,   // just above the lower gold line
    baseline: 0.5380,   // text baseline
  },
  // Photo zone: the inner grey avatar circle.
  // Least-squares fit of the disc boundary in ticket.png (720 boundary rays,
  // rX=106.98 / rY=107.00 → perfect circle): centre (1256.98, 707), r=106.99.
  photo: {
    cx:     0.8183461,   // centre x (1256.98 / 1536)
    cy:     0.69043,     // centre y (707 / 1024)
    radius: 0.0696521,   // disc radius (106.99 / 1536)
  },
};

// ─── DEFAULT TYPOGRAPHY STATE ───
const DEFAULT_STYLE = {
  fontFamily:     'Montserrat',
  fontWeight:     '700',
  textCase:       'none',      // none | uppercase | capitalize
  letterSpacing:  0,
  textAlign:      'left',      // left | center
  fontSize:       36,
  autoFit:        true,
  color:          '#0B2447',
};

// ─── APP STATE ───
const state = {
  name:         '',
  photo:        null,       // HTMLImageElement or null
  photoOffsetX: 0,          // pan offset in px (at zoom=1)
  photoOffsetY: 0,
  photoZoom:    1,
  style:        { ...DEFAULT_STYLE },
  format:       'png',
  jpegQuality:  0.92,
};

// ─── GLOBALS ───
let ticketImg    = null;   // the full source Image
let cropBox      = null;   // { x, y, w, h } bounding box in source px
let calibrateMode = false;
let renderPending = false;

const DPR = window.devicePixelRatio || 1;

// ─── DOM REFS ───
const $ = id => document.getElementById(id);
const canvas        = $('preview-canvas');
const ctx           = canvas.getContext('2d');
const introOverlay  = $('intro-overlay');
const appEl         = $('app');
const nameInput     = $('name-input');
const charCounter   = $('char-counter');
const photoDropZone = $('photo-drop-zone');
const photoFileInput= $('photo-file-input');
const photoEditor   = $('photo-editor');
const photoCircle   = $('photo-circle');
const photoCircleMask = $('photo-circle-mask') || photoCircle;
const photoCircleImg= $('photo-circle-img');
const photoZoomSlider = $('photo-zoom');
const photoError    = $('photo-error');
const photoErrorText= $('photo-error-text');
const downloadBtn   = $('download-btn');
const downloadStatus= $('download-status');
const qualityWrap   = $('quality-wrap');
const qualitySlider = $('quality-slider');
const qualityValue  = $('quality-value');
const sizeSlider    = $('size-slider');
const sizeValue     = $('size-value');
const spacingSlider = $('letter-spacing-slider');
const spacingValue  = $('spacing-value');
const autofitToggle = $('autofit-toggle');
const ticketError   = $('ticket-error');
const ticketErrorText = $('ticket-error-text');
const ticketRetryBtn  = $('ticket-retry-btn');

// ===================================================
//  INTRO ANIMATION
// ===================================================
function initIntro() {
  const skipBtn   = $('intro-skip-btn');
  const replayBtn = $('replay-intro-btn');
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Replay must work even when the intro was already played this session
  replayBtn.addEventListener('click', () => {
    sessionStorage.removeItem('btb-intro-played');
    location.reload();
  });

  // Already played this session — show the app immediately
  if (sessionStorage.getItem('btb-intro-played')) {
    introOverlay.classList.add('hidden');
    appEl.classList.add('visible');
    return;
  }

  skipBtn.addEventListener('click', finishIntro);

  // Gold dust particles (DPR-aware canvas, CSS-px coordinates)
  const DPR_INTRO = Math.min(window.devicePixelRatio || 1, 2);
  const particleCanvas = $('intro-particles');
  const pCtx = particleCanvas.getContext('2d');
  let particles = [];
  let introAnimating = true;

  function resizeParticles() {
    particleCanvas.width = Math.round(window.innerWidth * DPR_INTRO);
    particleCanvas.height = Math.round(window.innerHeight * DPR_INTRO);
    pCtx.setTransform(DPR_INTRO, 0, 0, DPR_INTRO, 0, 0);
  }
  resizeParticles();
  window.addEventListener('resize', resizeParticles);

  // Create particles (none for reduced motion — static frame instead)
  for (let i = 0; i < (REDUCED ? 0 : 46); i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: 1 + Math.random() * 2,
      speed: 0.15 + Math.random() * 0.4,
      opacity: 0.15 + Math.random() * 0.35,
      blur: Math.random() > 0.6 ? 1 : 0,
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.4 + Math.random() * 1.2,
    });
  }

  function animateParticles(now) {
    if (!introAnimating) return;
    pCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.y -= p.speed;
      p.x += Math.sin(p.y * 0.008) * 0.3;
      if (p.y < -10) { p.y = window.innerHeight + 10; p.x = Math.random() * window.innerWidth; }
      const twinkle = 0.55 + 0.45 * Math.sin(now * 0.001 * p.twSpeed + p.tw);
      pCtx.globalAlpha = p.opacity * twinkle;
      pCtx.fillStyle = '#D9B15A';
      if (p.blur) { pCtx.filter = 'blur(1px)'; }
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.filter = 'none';
    }
    pCtx.globalAlpha = 1;
    requestAnimationFrame(animateParticles);
  }
  requestAnimationFrame(animateParticles);

  // Auto-dismiss once the choreography has played through
  // (fast path for reduced motion: static frame, then straight to the app)
  const introDuration = REDUCED ? 500 : 3600;
  let introFinished = false;
  const introTimer = setTimeout(finishIntro, introDuration);

  function finishIntro() {
    if (introFinished) return;
    introFinished = true;
    clearTimeout(introTimer);
    introOverlay.classList.add('intro-exit');
    sessionStorage.setItem('btb-intro-played', '1');
    setTimeout(() => {
      introAnimating = false;
      introOverlay.classList.add('hidden');
      appEl.classList.add('visible');
    }, REDUCED ? 450 : 950);
  }
}

// ===================================================
//  TICKET IMAGE LOADING & CROP DETECTION
// ===================================================
function loadTicketImage() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ticketImg = img;
      cropBox = detectCropBox(img);
      ticketError.style.display = 'none';
      resolve();
    };
    img.onerror = () => {
      ticketError.classList.add('visible');
      ticketError.style.display = 'flex';
      ticketErrorText.textContent = 'Failed to load ticket image.';
      reject(new Error('Ticket image load failed'));
    };
    img.src = 'ticket.png';
  });
}

function detectCropBox(img) {
  const offscreen = document.createElement('canvas');
  offscreen.width = img.width;
  offscreen.height = img.height;
  const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
  offCtx.drawImage(img, 0, 0);

  const w = img.width, h = img.height;
  const data = offCtx.getImageData(0, 0, w, h).data;

  // Sample corner pixels for background color
  const corners = [[5,5],[w-6,5],[5,h-6],[w-6,h-6],[15,15],[w-16,15],[15,h-16],[w-16,h-16]];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [cx, cy] of corners) {
    const i = (cy * w + cx) * 4;
    bgR += data[i]; bgG += data[i+1]; bgB += data[i+2];
  }
  bgR /= corners.length; bgG /= corners.length; bgB /= corners.length;

  const threshold = 1200; // squared color distance
  let minX = w, maxX = 0, minY = h, maxY = 0;
  // Scan edges for speed
  // Top
  outer_top:
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const dr = data[i] - bgR, dg = data[i+1] - bgG, db = data[i+2] - bgB;
      if (dr*dr + dg*dg + db*db > threshold) { minY = y; break outer_top; }
    }
  }
  // Bottom
  outer_bottom:
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const dr = data[i] - bgR, dg = data[i+1] - bgG, db = data[i+2] - bgB;
      if (dr*dr + dg*dg + db*db > threshold) { maxY = y; break outer_bottom; }
    }
  }
  // Left
  outer_left:
  for (let x = 0; x < w; x++) {
    for (let y = minY; y <= maxY; y += 2) {
      const i = (y * w + x) * 4;
      const dr = data[i] - bgR, dg = data[i+1] - bgG, db = data[i+2] - bgB;
      if (dr*dr + dg*dg + db*db > threshold) { minX = x; break outer_left; }
    }
  }
  // Right
  outer_right:
  for (let x = w - 1; x >= 0; x--) {
    for (let y = minY; y <= maxY; y += 2) {
      const i = (y * w + x) * 4;
      const dr = data[i] - bgR, dg = data[i+1] - bgG, db = data[i+2] - bgB;
      if (dr*dr + dg*dg + db*db > threshold) { maxX = x; break outer_right; }
    }
  }

  if (minX >= maxX || minY >= maxY) {
    // Fallback to full image
    return { x: 0, y: 0, w, h };
  }

  // Add 1px padding
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(w - 1, maxX + 1);
  maxY = Math.min(h - 1, maxY + 1);

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ===================================================
//  SINGLE RENDER FUNCTION (preview + export)
// ===================================================
function renderTicket(targetCtx, targetW, targetH, st, bgColor) {
  if (!ticketImg || !cropBox) return;

  const fullW = ticketImg.width;
  const fullH = ticketImg.height;

  // Draw cropped ticket artwork (optionally over an opaque backdrop for JPEG/PDF)
  targetCtx.clearRect(0, 0, targetW, targetH);
  if (bgColor) {
    targetCtx.fillStyle = bgColor;
    targetCtx.fillRect(0, 0, targetW, targetH);
  }
  targetCtx.drawImage(
    ticketImg,
    cropBox.x, cropBox.y, cropBox.w, cropBox.h,
    0, 0, targetW, targetH
  );

  // Scale factor from full source coords to targetCanvas coords
  const scaleX = targetW / cropBox.w;
  const scaleY = targetH / cropBox.h;

  // Convert full-image ratio to target-canvas coords
  function toCanvasX(ratioX) { return (ratioX * fullW - cropBox.x) * scaleX; }
  function toCanvasY(ratioY) { return (ratioY * fullH - cropBox.y) * scaleY; }

  // ─── Draw PHOTO (under the artwork rings) ───
  if (st.photo) {
    const pcx = toCanvasX(ZONES.photo.cx);
    const pcy = toCanvasY(ZONES.photo.cy);
    // Strict circular clip: photo can never leave the artwork's avatar frame
    const pr = ZONES.photo.radius * fullW * scaleX;

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.arc(pcx, pcy, pr, 0, Math.PI * 2);
    targetCtx.closePath();
    targetCtx.clip();

    // Cover-fit the photo into the circle
    const img = st.photo;
    const imgAspect = img.width / img.height;
    const circDiam = pr * 2;
    let drawW, drawH;
    if (imgAspect > 1) {
      drawH = circDiam * st.photoZoom;
      drawW = drawH * imgAspect;
    } else {
      drawW = circDiam * st.photoZoom;
      drawH = drawW / imgAspect;
    }
    const drawX = pcx - drawW / 2 + st.photoOffsetX * scaleX;
    const drawY = pcy - drawH / 2 + st.photoOffsetY * scaleY;

    targetCtx.drawImage(img, drawX, drawY, drawW, drawH);
    targetCtx.restore();
  }

  // ─── Draw NAME ───
  if (st.name && st.name.trim()) {
    const zoneLeft   = toCanvasX(ZONES.name.xLeft);
    const zoneRight  = toCanvasX(ZONES.name.xRight);
    const zoneTop    = toCanvasY(ZONES.name.yTop);
    const zoneBottom = toCanvasY(ZONES.name.yBottom);
    const zoneW      = zoneRight - zoneLeft;
    const zoneH      = zoneBottom - zoneTop;
    const baseline   = toCanvasY(ZONES.name.baseline);

    let displayName = st.name;
    if (st.style.textCase === 'uppercase') displayName = displayName.toUpperCase();
    else if (st.style.textCase === 'capitalize') {
      displayName = displayName.replace(/\b\w/g, c => c.toUpperCase());
    }

    // Scale font size relative to source 1536px width
    const fontScale = (fullW * scaleX) / 1536;
    let fontSize = st.style.fontSize * fontScale;
    const minFontSize = 12 * fontScale;

    // Letter spacing
    const letterSpacing = st.style.letterSpacing * fontScale;

    // Build font string
    const fontStr = (weight, size) =>
      `${weight} ${size}px '${st.style.fontFamily}', sans-serif`;

    // Measure with letter spacing
    function measureText(fCtx, text, spacing) {
      if (spacing <= 0) return fCtx.measureText(text).width;
      let w = 0;
      for (let i = 0; i < text.length; i++) {
        w += fCtx.measureText(text[i]).width;
        if (i < text.length - 1) w += spacing;
      }
      return w;
    }

    // Auto-fit: reduce font size until text fits
    if (st.style.autoFit) {
      targetCtx.font = fontStr(st.style.fontWeight, fontSize);
      let textW = measureText(targetCtx, displayName, letterSpacing);
      while (textW > zoneW && fontSize > minFontSize) {
        fontSize -= fontScale;
        targetCtx.font = fontStr(st.style.fontWeight, fontSize);
        textW = measureText(targetCtx, displayName, letterSpacing);
      }
    }

    targetCtx.font = fontStr(st.style.fontWeight, fontSize);
    targetCtx.fillStyle = st.style.color;
    targetCtx.textBaseline = 'middle';

    const textW = measureText(targetCtx, displayName, letterSpacing);
    let startX;
    if (st.style.textAlign === 'center') {
      startX = zoneLeft + (zoneW - textW) / 2;
    } else {
      startX = zoneLeft + 4 * fontScale; // small padding
    }

    const textY = zoneTop + zoneH / 2;

    // Draw with letter spacing
    if (letterSpacing > 0.01) {
      let x = startX;
      for (let i = 0; i < displayName.length; i++) {
        targetCtx.fillText(displayName[i], x, textY);
        x += targetCtx.measureText(displayName[i]).width + letterSpacing;
      }
    } else {
      targetCtx.fillText(displayName, startX, textY);
    }
  }

  // ─── Calibration mode ───
  if (calibrateMode) {
    // Name zone
    const nL = toCanvasX(ZONES.name.xLeft);
    const nR = toCanvasX(ZONES.name.xRight);
    const nT = toCanvasY(ZONES.name.yTop);
    const nB = toCanvasY(ZONES.name.yBottom);
    targetCtx.strokeStyle = 'rgba(255,0,0,0.8)';
    targetCtx.lineWidth = 1;
    targetCtx.strokeRect(nL, nT, nR - nL, nB - nT);
    // Baseline
    targetCtx.strokeStyle = 'rgba(0,255,0,0.8)';
    const bl = toCanvasY(ZONES.name.baseline);
    targetCtx.beginPath(); targetCtx.moveTo(nL, bl); targetCtx.lineTo(nR, bl); targetCtx.stroke();

    // Photo zone
    const pcx = toCanvasX(ZONES.photo.cx);
    const pcy = toCanvasY(ZONES.photo.cy);
    const pr  = ZONES.photo.radius * fullW * scaleX;
    targetCtx.strokeStyle = 'rgba(0,100,255,0.8)';
    targetCtx.lineWidth = 1;
    targetCtx.beginPath();
    targetCtx.arc(pcx, pcy, pr, 0, Math.PI * 2);
    targetCtx.stroke();
    // Center cross
    targetCtx.beginPath(); targetCtx.moveTo(pcx - 6, pcy); targetCtx.lineTo(pcx + 6, pcy); targetCtx.stroke();
    targetCtx.beginPath(); targetCtx.moveTo(pcx, pcy - 6); targetCtx.lineTo(pcx, pcy + 6); targetCtx.stroke();
  }
}

// ===================================================
//  PREVIEW
// ===================================================
function updatePreview() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    if (!cropBox) return;

    const aspect = cropBox.w / cropBox.h;

    // Measure the stage (NOT preview-wrap, whose width depends on the canvas)
    const stage = document.querySelector('.preview-stage');
    const stageStyle = getComputedStyle(stage);
    const padX = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
    const padY = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
    const isMobile = window.matchMedia('(max-width: 860px)').matches;
    const topbarH = document.querySelector('.topbar').offsetHeight;

    const maxW = Math.max(stage.clientWidth - padX, 260);
    const maxH = isMobile
      ? window.innerHeight * 0.5
      : Math.max(window.innerHeight - topbarH - padY, 220);

    let dispW, dispH;
    if (maxW / maxH > aspect) {
      dispH = Math.min(maxH, cropBox.h);
      dispW = dispH * aspect;
    } else {
      dispW = Math.min(maxW, cropBox.w);
      dispH = dispW / aspect;
    }

    canvas.style.width  = dispW + 'px';
    canvas.style.height = dispH + 'px';
    canvas.width  = Math.round(dispW * DPR);
    canvas.height = Math.round(dispH * DPR);

    renderTicket(ctx, canvas.width, canvas.height, state);
  });
}

// ===================================================
//  PHOTO HANDLING
// ===================================================
function handlePhotoFile(file) {
  hidePhotoError();
  if (!file) return;
  if (!file.type.match(/^image\/(jpeg|png|webp|heic)$/i)) {
    showPhotoError('Unsupported format. Use JPG, PNG, or WebP.');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showPhotoError('File too large (max 25MB).');
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      // Downscale if too large
      let targetImg = img;
      if (img.width > 2048 || img.height > 2048) {
        const scale = 2048 / Math.max(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const smallImg = new Image();
        smallImg.onload = () => {
          setPhoto(smallImg);
        };
        smallImg.src = c.toDataURL('image/jpeg', 0.92);
        return;
      }
      setPhoto(targetImg);
    };
    img.onerror = () => showPhotoError('Could not read the image file.');
    img.src = e.target.result;
  };
  reader.onerror = () => showPhotoError('Failed to read the file.');
  reader.readAsDataURL(file);
}

function setPhoto(img) {
  state.photo = img;
  state.photoOffsetX = 0;
  state.photoOffsetY = 0;
  state.photoZoom = 1;
  photoZoomSlider.value = 100;
  photoDropZone.style.display = 'none';
  photoEditor.classList.add('active');
  updatePhotoCircle();
  updatePreview();
}

function removePhoto() {
  state.photo = null;
  state.photoOffsetX = 0;
  state.photoOffsetY = 0;
  state.photoZoom = 1;
  photoZoomSlider.value = 100;
  photoEditor.classList.remove('active');
  photoDropZone.style.display = '';
  photoFileInput.value = '';
  updatePreview();
}

function updatePhotoCircle() {
  if (!state.photo) return;
  const img = photoCircleImg;
  const circle = photoCircleMask || photoCircle;   // the clipped container
  const circSize = circle.clientWidth || photoCircle.clientWidth || 120;
  const fullW = ticketImg ? ticketImg.width : 1536;
  // source-px -> circle-px scale
  const srcDiameter = ZONES.photo.radius * 2 * fullW;
  const pxScale = circSize / srcDiameter;
  const aspect = state.photo.width / state.photo.height;
  let w, h;
  if (aspect > 1) {
    h = circSize * state.photoZoom;
    w = h * aspect;
  } else {
    w = circSize * state.photoZoom;
    h = w / aspect;
  }
  img.src = state.photo.src;
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  img.style.left = (circSize / 2 - w / 2 + state.photoOffsetX * pxScale) + 'px';
  img.style.top  = (circSize / 2 - h / 2 + state.photoOffsetY * pxScale) + 'px';
}

function showPhotoError(msg) {
  photoErrorText.textContent = msg;
  photoError.classList.add('visible');
}
function hidePhotoError() {
  photoError.classList.remove('visible');
}

// Photo drag
let photoDragging = false, photoDragStartX, photoDragStartY, photoStartOX, photoStartOY;
photoCircle.addEventListener('pointerdown', e => {
  e.preventDefault();
  photoDragging = true;
  photoDragStartX = e.clientX;
  photoDragStartY = e.clientY;
  photoStartOX = state.photoOffsetX;
  photoStartOY = state.photoOffsetY;
  photoCircle.setPointerCapture(e.pointerId);
});
photoCircle.addEventListener('pointermove', e => {
  if (!photoDragging) return;
  const circSize = (photoCircleMask || photoCircle).clientWidth || photoCircle.clientWidth || 120;
  const fullW = ticketImg ? ticketImg.width : 1536;
  const scale = (ZONES.photo.radius * 2 * fullW) / circSize;
  state.photoOffsetX = photoStartOX + (e.clientX - photoDragStartX) * scale;
  state.photoOffsetY = photoStartOY + (e.clientY - photoDragStartY) * scale;
  updatePhotoCircle();
  updatePreview();
});
photoCircle.addEventListener('pointerup', () => { photoDragging = false; });
photoCircle.addEventListener('pointercancel', () => { photoDragging = false; });

// ===================================================
//  EVENT LISTENERS
// ===================================================
function initEvents() {
  // Name input
  nameInput.addEventListener('input', () => {
    state.name = nameInput.value;
    const len = nameInput.value.length;
    charCounter.textContent = `${len}/40`;
    charCounter.className = 'char-counter' +
      (len >= 38 ? ' at-limit' : len >= 30 ? ' near-limit' : '');
    downloadBtn.disabled = !state.name.trim();
    updatePreview();
  });

  // Photo file input
  photoFileInput.addEventListener('change', e => {
    if (e.target.files[0]) handlePhotoFile(e.target.files[0]);
  });

  // Drop zone click
  photoDropZone.addEventListener('click', () => photoFileInput.click());

  // Drag & drop
  photoDropZone.addEventListener('dragover', e => { e.preventDefault(); photoDropZone.classList.add('drag-over'); });
  photoDropZone.addEventListener('dragleave', () => photoDropZone.classList.remove('drag-over'));
  photoDropZone.addEventListener('drop', e => {
    e.preventDefault();
    photoDropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handlePhotoFile(e.dataTransfer.files[0]);
  });

  // Photo zoom
  photoZoomSlider.addEventListener('input', () => {
    state.photoZoom = photoZoomSlider.value / 100;
    updatePhotoCircle();
    updatePreview();
  });

  // Photo replace/remove
  $('photo-replace-btn').addEventListener('click', () => photoFileInput.click());
  $('photo-remove-btn').addEventListener('click', removePhoto);

  // Photo retry
  $('photo-retry-btn').addEventListener('click', () => {
    hidePhotoError();
    photoFileInput.click();
  });

  // Font chips
  document.querySelectorAll('.font-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.font-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.style.fontFamily = chip.dataset.font;
      updatePreview();
    });
  });

  // Weight toggles
  document.querySelectorAll('#weight-toggles .toggle-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#weight-toggles .toggle-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.style.fontWeight = btn.dataset.weight;
      updatePreview();
    });
  });

  // Case toggles
  document.querySelectorAll('#case-toggles .toggle-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#case-toggles .toggle-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.style.textCase = btn.dataset.case;
      updatePreview();
    });
  });

  // Alignment toggles
  document.querySelectorAll('#align-toggles .toggle-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#align-toggles .toggle-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.style.textAlign = btn.dataset.align;
      updatePreview();
    });
  });

  // Letter spacing slider
  spacingSlider.addEventListener('input', () => {
    state.style.letterSpacing = parseFloat(spacingSlider.value);
    spacingValue.textContent = spacingSlider.value;
    updatePreview();
  });

  // Size slider
  sizeSlider.addEventListener('input', () => {
    state.style.fontSize = parseInt(sizeSlider.value);
    sizeValue.textContent = sizeSlider.value;
    updatePreview();
  });

  // Auto-fit toggle
  autofitToggle.addEventListener('change', () => {
    state.style.autoFit = autofitToggle.checked;
    updatePreview();
  });

  // Color swatches
  document.querySelectorAll('#color-swatches .swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('#color-swatches .swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      state.style.color = sw.dataset.color;
      updatePreview();
    });
  });

  // Custom color picker
  $('custom-color-input').addEventListener('input', e => {
    state.style.color = e.target.value;
    document.querySelectorAll('#color-swatches .swatch').forEach(s => s.classList.remove('active'));
    $('custom-color-input').parentElement.style.background = e.target.value;
    updatePreview();
  });

  // Reset style
  $('reset-style-btn').addEventListener('click', () => {
    state.style = { ...DEFAULT_STYLE };
    // Reset UI
    document.querySelectorAll('.font-chip').forEach(c => c.classList.toggle('active', c.dataset.font === 'Montserrat'));
    document.querySelectorAll('#weight-toggles .toggle-chip').forEach(b => b.classList.toggle('active', b.dataset.weight === '700'));
    document.querySelectorAll('#case-toggles .toggle-chip').forEach(b => b.classList.toggle('active', b.dataset.case === 'none'));
    document.querySelectorAll('#align-toggles .toggle-chip').forEach(b => b.classList.toggle('active', b.dataset.align === 'left'));
    document.querySelectorAll('#color-swatches .swatch').forEach(s => s.classList.toggle('active', s.dataset.color === '#0B2447'));
    spacingSlider.value = 0; spacingValue.textContent = '0';
    sizeSlider.value = 36; sizeValue.textContent = '36';
    autofitToggle.checked = true;
    updatePreview();
  });

  // Format buttons
  document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.format = btn.dataset.format;
      qualityWrap.classList.toggle('visible', state.format === 'jpeg');
    });
  });

  // Quality slider
  qualitySlider.addEventListener('input', () => {
    state.jpegQuality = qualitySlider.value / 100;
    qualityValue.textContent = qualitySlider.value + '%';
  });

  // Download
  downloadBtn.addEventListener('click', downloadTicket);

  // Ticket retry
  ticketRetryBtn.addEventListener('click', () => {
    ticketError.style.display = 'none';
    loadTicketImage().then(() => updatePreview());
  });

  // Window resize
  window.addEventListener('resize', () => updatePreview());
}

// ===================================================
//  DOWNLOAD
// ===================================================
function downloadTicket() {
  if (!state.name.trim() || !cropBox) return;

  const exportScale = 2;
  const exportW = cropBox.w * exportScale;
  const exportH = cropBox.h * exportScale;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = exportW;
  exportCanvas.height = exportH;
  const exportCtx = exportCanvas.getContext('2d');

  // JPEG/PDF have no transparency — render over the ticket's cream backdrop
  const bg = (state.format === 'jpeg' || state.format === 'pdf') ? '#F4EDD8' : null;

  renderTicket(exportCtx, exportW, exportH, state, bg);

  const safeName = state.name.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
  const filename = `${safeName}-FoundersConnect-Ticket`;

  if (state.format === 'pdf') {
    exportPDF(exportCanvas, filename);
  } else {
    let mimeType, ext;
    if (state.format === 'png')  { mimeType = 'image/png'; ext = 'png'; }
    else if (state.format === 'jpeg') { mimeType = 'image/jpeg'; ext = 'jpg'; }
    else { mimeType = 'image/webp'; ext = 'webp'; }

    const quality = state.format === 'jpeg' ? state.jpegQuality : undefined;
    const dataUrl = exportCanvas.toDataURL(mimeType, quality);

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${filename}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  downloadStatus.textContent = 'Ticket downloaded';
  setTimeout(() => { downloadStatus.textContent = ''; }, 3000);
}

function exportPDF(canvas, filename) {
  const { jsPDF } = window.jspdf;
  const aspect = canvas.width / canvas.height;
  // Landscape page sized to ticket aspect ratio
  const pageW = 297; // mm (A4-ish width)
  const pageH = pageW / aspect;
  const pdf = new jsPDF({
    orientation: aspect > 1 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pageW, pageH],
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
  pdf.save(`${filename}.pdf`);
}

// ===================================================
//  FONT PRELOAD (canvas can only draw loaded fonts)
// ===================================================
async function preloadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const families = [
    'Montserrat',
    'Playfair Display',
    'Poppins',
    'DM Serif Display',
    'Caveat',
    'Cormorant Garamond',
  ];
  const weights = [400, 500, 700];
  await Promise.allSettled(
    families.flatMap(family =>
      weights.map(weight =>
        document.fonts.load(`${weight} 36px "${family}"`, 'AaBbGg 0123')
      )
    )
  );
}

// ===================================================
//  INIT
// ===================================================
async function init() {
  // Check calibrate mode
  calibrateMode = new URLSearchParams(window.location.search).get('calibrate') === '1';

  // Hide ticket error initially
  ticketError.style.display = 'none';

  initIntro();
  initEvents();

  try {
    await preloadFonts();
    await document.fonts.ready;
    await loadTicketImage();
    updatePreview();
  } catch (e) {
    console.error('Init failed:', e);
  }
}

init();
