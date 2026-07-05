/**
 * 10-capture.js
 * ------------------------------------------------------------------
 * Responsibility: the 3-shot countdown/flash/capture loop.
 * Depends on: 01-config.js, 02-store.js, 03-dom.js, 07-audio.js,
 *             09-compositor.js, 11-ui.js.
 * Exposes: PB.capture
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.capture = (function () {
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Crops the locked frame region directly out of the main canvas.
   * Because the canvas already contains the mirrored video (see the
   * mirroring note in 04-geometry.js), this is a plain pixel copy —
   * no separate "un-mirror the source" math is needed here, which
   * removes a whole class of off-by-one/flip bugs.
   * @param {{x,y,width,height}} frame - canvas-pixel rect to crop
   * @returns {HTMLCanvasElement} an offscreen canvas containing just that region
   */
  function capturePhoto(frame) {
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.round(frame.width);
    offscreen.height = Math.round(frame.height);
    offscreen
      .getContext('2d')
      .drawImage(PB.dom.canvas, frame.x, frame.y, frame.width, frame.height, 0, 0, offscreen.width, offscreen.height);
    return offscreen;
  }

  /**
   * Runs the full countdown → flash → capture loop CONFIG.PHOTO_COUNT
   * times, then hands off to the compositor and result screen. Guarded
   * by `captureRunning` so a stray pinch can't start a second sequence
   * while one is already in progress.
   */
  async function runCaptureSequence() {
    const store = PB.store;
    if (store.captureRunning) return;
    store.captureRunning = true;
    store.capturedPhotos = [];

    PB.ui.setState(PB.STATES.COUNTDOWN);
    PB.ui.updatePhotoDots(0);

    for (let shot = 0; shot < PB.CONFIG.PHOTO_COUNT; shot++) {
      for (let n = PB.CONFIG.COUNTDOWN_SECONDS; n >= 1; n--) {
        PB.ui.setCountdownText(String(n));
        await wait(PB.CONFIG.COUNTDOWN_TICK_MS);
      }
      PB.ui.setCountdownText('');
      PB.ui.setState(PB.STATES.CAPTURING);
      await wait(80);

      PB.audio.playShutter();
      PB.ui.triggerFlash();
      await wait(60);

      const photo = capturePhoto(store.frozenFrame);
      store.capturedPhotos.push(photo);
      PB.ui.updatePhotoDots(store.capturedPhotos.length);

      if (shot < PB.CONFIG.PHOTO_COUNT - 1) {
        PB.ui.setState(PB.STATES.COUNTDOWN);
        await wait(PB.CONFIG.GAP_BETWEEN_SHOTS_MS);
      }
    }

    PB.ui.setCountdownText('');
    PB.ui.setState(PB.STATES.COMPOSITING);
    await wait(150);

    const dataUrl = await PB.compositor.compositeFilmstrip(store.capturedPhotos, store.selectedFilter);
    store.resultDataUrl = dataUrl;
    await PB.ui.showResult(dataUrl);

    store.captureRunning = false;
  }

  return { capturePhoto, runCaptureSequence, wait };
})();
