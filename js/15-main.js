/**
 * 15-main.js
 * ------------------------------------------------------------------
 * Responsibility: the only file that runs on page load. Wires up the
 * few static button listeners and starts the camera. Must be loaded
 * LAST, after every other js/ file.
 * Depends on: everything.
 * Exposes: nothing — this is the entry point, not a library.
 * ------------------------------------------------------------------
 */
(function () {
  PB.dom.newPhotoBtn.addEventListener('click', () => PB.resetToIdle());

  PB.dom.retryBtn.addEventListener('click', () => {
    PB.dom.errorMsg.textContent = '';
    PB.dom.retryBtn.style.display = 'none';
    PB.dom.loadingText.style.display = 'block';
    document.querySelector('#loadingScreen .spinner').style.display = 'block';
    PB.dom.loadingScreen.style.display = 'flex';
    PB.camera.init();
  });

  PB.ui.setState(PB.STATES.LOADING);

  // Small delay so the loading screen actually paints before the
  // (synchronous, slightly heavy) MediaPipe setup begins.
  window.addEventListener('load', () => setTimeout(PB.camera.init, 300));
})();
