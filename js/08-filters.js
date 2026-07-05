/**
 * 08-filters.js
 * ------------------------------------------------------------------
 * Responsibility: the real per-pixel filter math. This is intentionally
 * only ever run on the 3 final captured photos (once each), never on
 * every live video frame — per-pixel ImageData manipulation at 30-60fps
 * would be far too slow for a live preview. The filter menu shows a
 * cheap CSS-approximation instead (see PB.FILTER_PREVIEW in 01-config.js).
 * Depends on: 01-config.js (not directly, but callers pass filter names from CONFIG.FILTERS).
 * Exposes: PB.filters
 *
 * How to add a new filter:
 *   1. Add its name to CONFIG.FILTERS in 01-config.js.
 *   2. Add a matching preview string to PB.FILTER_PREVIEW in 01-config.js.
 *   3. Add an `else if (filterName === 'YourFilter') { ... }` branch below.
 *   4. Add its name to PIXEL_FILTER_NAMES below, so 09-compositor.js
 *      knows to bake in this real effect instead of falling back to the
 *      cheap CSS approximation from step 2.
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.filters = (function () {
  /**
   * Mutates `imageData.data` in place to apply the named filter.
   * @param {ImageData} imageData
   * @param {string} filterName - one of CONFIG.FILTERS
   * @returns {ImageData} the same object, for convenient chaining
   */
  function applyPixelFilter(imageData, filterName) {
    const pixels = imageData.data;
    const length = pixels.length;

    if (filterName === 'Noir') {
      for (let i = 0; i < length; i += 4) {
        const gray = Math.min(255, (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) * 1.08 - 8);
        pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
      }
    } else if (filterName === 'Sepia') {
      for (let i = 0; i < length; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        pixels[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        pixels[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        pixels[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }
    } else if (filterName === 'Duotone') {
      // Maps luminance onto a violet-shadow → cyan-highlight gradient.
      const shadow = [109, 40, 217];
      const highlight = [6, 182, 212];
      for (let i = 0; i < length; i += 4) {
        const luminance = (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255;
        pixels[i] = Math.round(shadow[0] + (highlight[0] - shadow[0]) * luminance);
        pixels[i + 1] = Math.round(shadow[1] + (highlight[1] - shadow[1]) * luminance);
        pixels[i + 2] = Math.round(shadow[2] + (highlight[2] - shadow[2]) * luminance);
      }
    } else if (filterName === 'Vintage VHS') {
      // Per-scanline chromatic aberration (with slight sinusoidal wobble) + film grain + desaturation.
      const width = imageData.width;
      const height = imageData.height;
      const original = new Uint8ClampedArray(pixels);
      for (let y = 0; y < height; y++) {
        const rowOffset = y * width * 4;
        const shiftRed = 3 + Math.floor(Math.sin(y * 0.18) * 2);
        const shiftBlue = 3 + Math.floor(Math.cos(y * 0.22) * 2);
        for (let x = 0; x < width; x++) {
          const i = rowOffset + x * 4;
          const xRed = Math.min(width - 1, x + shiftRed);
          const xBlue = Math.max(0, x - shiftBlue);
          pixels[i] = original[rowOffset + xRed * 4];         // red channel shifted right
          pixels[i + 1] = original[i + 1];                     // green channel unchanged
          pixels[i + 2] = original[rowOffset + xBlue * 4 + 2]; // blue channel shifted left

          const grain = (Math.random() - 0.5) * 38;
          pixels[i] = Math.min(255, Math.max(0, pixels[i] + grain));
          pixels[i + 1] = Math.min(255, Math.max(0, pixels[i + 1] + grain * 0.4 + 6));
          pixels[i + 2] = Math.min(255, Math.max(0, pixels[i + 2] + grain));

          const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          pixels[i] = Math.round(pixels[i] * 0.78 + gray * 0.22);
          pixels[i + 1] = Math.round(pixels[i + 1] * 0.78 + gray * 0.22);
          pixels[i + 2] = Math.round(pixels[i + 2] * 0.78 + gray * 0.22);
        }
      }
    } else if (filterName === 'Cinematic') {
      // Lifted blacks + teal shadows / orange highlights split-tone.
      for (let i = 0; i < length; i += 4) {
        let r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
        r = r * 0.87 + 0.05;
        g = g * 0.87 + 0.04;
        b = b * 0.87 + 0.04;
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        r += 0.14 * luminance;
        g += 0.01 * luminance - 0.01;
        b -= 0.08 * luminance - 0.06;
        pixels[i] = Math.min(255, Math.max(0, Math.round(r * 255)));
        pixels[i + 1] = Math.min(255, Math.max(0, Math.round(g * 255)));
        pixels[i + 2] = Math.min(255, Math.max(0, Math.round(b * 255)));
      }
    }
    // 'Original' → no-op, pixels pass through unchanged.
    // AR lens filters ('Cyberpunk', 'Noir' overlay, 'Dog Ears', 'Flower
    // Crown') don't need pixel math here — their effect is the live
    // overlay drawARProps() already drew onto the canvas before capture.

    return imageData;
  }

  // Filters with a real per-pixel implementation above (as opposed to
  // filters that only ever get the cheap CSS approximation from
  // PB.FILTER_PREVIEW). 09-compositor.js checks this list to decide
  // whether to bake in the real effect or fall back to the CSS filter.
  const PIXEL_FILTER_NAMES = ['Noir', 'Sepia', 'Duotone', 'Vintage VHS', 'Cinematic'];

  return { applyPixelFilter, PIXEL_FILTER_NAMES };
})();