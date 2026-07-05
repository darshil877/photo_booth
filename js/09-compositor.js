/**
 * 09-compositor.js
 * ------------------------------------------------------------------
 * Responsibility: stitches the 3 captured photos into one branded
 * vertical filmstrip image, applying the selected filter once per
 * photo along the way.
 * Depends on: 08-filters.js (applyPixelFilter, PIXEL_FILTER_NAMES), 01-config.js.
 * Exposes: PB.compositor
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.compositor = (function () {
  const PAD = 22;
  const GAP = 14;
  const FOOTER_HEIGHT = 82;

  /**
   * Builds the final filmstrip as a JPEG data URL.
   * Every photo is first normalized to CONFIG.OUTPUT_PHOTO_WIDTH so the
   * output size is consistent regardless of how big or small the user's
   * locked frame happened to be (a tiny locked frame shouldn't produce
   * a blurry upscaled final image, and a huge one shouldn't produce an
   * unnecessarily large file).
   * @param {HTMLCanvasElement[]} capturedPhotos - raw cropped captures, in order
   * @param {string} filterName - one of CONFIG.FILTERS
   * @returns {Promise<string>} JPEG data URL of the finished filmstrip
   */
  async function compositeFilmstrip(capturedPhotos, filterName) {
    const targetWidth = PB.CONFIG.OUTPUT_PHOTO_WIDTH;
    const aspect = capturedPhotos[0].height / capturedPhotos[0].width;
    const targetHeight = Math.round(targetWidth * aspect);

    const stripWidth = targetWidth + PAD * 2;
    const stripHeight =
      targetHeight * capturedPhotos.length +
      GAP * (capturedPhotos.length - 1) +
      PAD * 2 +
      FOOTER_HEIGHT;

    const strip = document.createElement('canvas');
    strip.width = stripWidth;
    strip.height = stripHeight;
    const sctx = strip.getContext('2d');

    // Background gradient
    const bg = sctx.createLinearGradient(0, 0, 0, stripHeight);
    bg.addColorStop(0, PB.CONFIG.FILMSTRIP_BG_TOP);
    bg.addColorStop(1, PB.CONFIG.FILMSTRIP_BG_BOTTOM);
    sctx.fillStyle = bg;
    sctx.fillRect(0, 0, stripWidth, stripHeight);

    // Sprocket holes along both edges, for a genuine "film strip" feel
    sctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 18; y < stripHeight - FOOTER_HEIGHT; y += 28) {
      for (const holeX of [7, stripWidth - 7]) {
        sctx.beginPath();
        sctx.arc(holeX, y, 5, 0, Math.PI * 2);
        sctx.fill();
      }
    }

    // Each photo: normalize size, bake in the filter, draw with a soft shadow + border
    for (let i = 0; i < capturedPhotos.length; i++) {
      const photoY = PAD + i * (targetHeight + GAP);

      const working = document.createElement('canvas');
      working.width = targetWidth;
      working.height = targetHeight;
      const wctx = working.getContext('2d');

      if (PB.filters.PIXEL_FILTER_NAMES.includes(filterName)) {
        // Real per-pixel effect (see 08-filters.js) — draw first, then
        // mutate the actual pixel data. This is what was previously
        // missing: the CSS approximation below was being used for the
        // FINAL bake too, when it's only meant for the live hover preview.
        wctx.drawImage(capturedPhotos[i], 0, 0, targetWidth, targetHeight);
        const imageData = wctx.getImageData(0, 0, targetWidth, targetHeight);
        PB.filters.applyPixelFilter(imageData, filterName);
        wctx.putImageData(imageData, 0, 0);
      } else {
        // No per-pixel implementation for this one (including AR lens
        // filters, whose effect is already baked into the source photo
        // via the live canvas overlay) — CSS filter must be set BEFORE
        // drawing, per canvas semantics.
        wctx.filter = PB.FILTER_PREVIEW[filterName] || 'none';
        wctx.drawImage(capturedPhotos[i], 0, 0, targetWidth, targetHeight);
      }

      sctx.shadowColor = 'rgba(0,0,0,0.7)';
      sctx.shadowBlur = 14;
      sctx.drawImage(working, PAD, photoY, targetWidth, targetHeight);
      sctx.shadowBlur = 0;

      sctx.strokeStyle = 'rgba(0,0,0,0.15)';;
      sctx.lineWidth = 1;
      sctx.strokeRect(PAD, photoY, targetWidth, targetHeight);

      sctx.fillStyle = 'rgba(0,0,0,0.7)';
      sctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
      sctx.textAlign = 'right';
      sctx.fillText(`${i + 1}/${capturedPhotos.length}`, PAD + targetWidth - 5, photoY + targetHeight - 5);
    }

    // Footer: gradient divider + brand name + date + filter used
    const footerY = stripHeight - FOOTER_HEIGHT;
    const dividerGradient = sctx.createLinearGradient(0, footerY, stripWidth, footerY);
    dividerGradient.addColorStop(0, 'rgba(109,40,217,0.6)');
    dividerGradient.addColorStop(1, 'rgba(6,182,212,0.6)');
    sctx.fillStyle = dividerGradient;
    sctx.fillRect(0, footerY, stripWidth, 2);

    sctx.fillStyle = '#000000';
    sctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
    sctx.textAlign = 'center';
    sctx.fillText(PB.CONFIG.BRAND_NAME, stripWidth / 2, footerY + 28);

    sctx.fillStyle = 'rgba(0,0,0,0.6)';
    sctx.font = '11px "Segoe UI", system-ui, sans-serif';
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    sctx.fillText(dateStr, stripWidth / 2, footerY + 46);

    sctx.fillStyle = 'rgba(0,0,0,0.4)';
    sctx.font = '10px "Segoe UI", system-ui, sans-serif';
    sctx.fillText(`${filterName} filter · Gesture Photo Booth`, stripWidth / 2, footerY + 63);

    return strip.toDataURL('image/jpeg', 0.95);
  }

  return { compositeFilmstrip };
})();