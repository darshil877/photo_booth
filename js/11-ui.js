/**
 * 11-ui.js
 * ------------------------------------------------------------------
 * Responsibility: every DOM-manipulation-only concern — the state
 * badge, toast hint text, photo-progress dots, hand-lost progress bar,
 * flash overlay, filter menu (build + hover state), and the result
 * screen (preview image + download/share/new-photo wiring). This file
 * never touches the canvas — that's 06-render.js's job.
 * Depends on: 01-config.js, 02-store.js, 03-dom.js, 14-supabase-client.js.
 * Exposes: PB.ui
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.ui = (function () {
  const TOAST_TEXT = {
    LOADING: '⏳ Loading camera &amp; hand tracking…',
    IDLE:
      "Make an <b>L-shape</b> with <b>both hands</b> to open the viewfinder" +
      "<br><span style=\"opacity:0.65;font-size:0.85em\">📷 A copy of your final photo is saved to our gallery to help improve the app</span>",
    FRAMING: '🖼️ Move your hands to resize the frame • Make an <b>OK sign</b> with <b>both hands</b> to lock',
    LOCKED: '✅ Locked! Choosing filter…',
    FILTER_SELECT: '☝️ Point at a filter with your index finger • <b>Pinch and hold</b> to select',
    COUNTDOWN: '📸 Get ready…',
    CAPTURING: '😄 Say cheese!',
    COMPOSITING: '✨ Developing your filmstrip…',
    RESULT: '🎉 Done! Hold an <b>open palm</b> or tap New Photo to start over',
  };

  /**
   * Updates PB.store.appState and re-renders every piece of the HUD
   * that depends on the current state. This is the ONLY function that
   * should assign PB.store.appState directly.
   * @param {string} state - one of PB.STATES
   */
  function setState(state) {
    PB.store.appState = state;

    PB.dom.stateBadge.textContent = state.replace('_', ' ');
    PB.dom.toast.innerHTML = TOAST_TEXT[state] || '';

    // The moment we leave IDLE, the disclosure in the toast above has
    // been shown at least once — that's the consent event. See the
    // "Why the consent line is non-negotiable" note in 14-supabase-client.js.
    if (state !== PB.STATES.LOADING && state !== PB.STATES.IDLE) {
      PB.store.consentGiven = true;
    }

    const isFilterSelect = state === PB.STATES.FILTER_SELECT;
    PB.dom.filterMenu.style.opacity = isFilterSelect ? '1' : '0';
    PB.dom.filterMenu.style.pointerEvents = isFilterSelect ? 'auto' : 'none';
    PB.dom.pinchCursor.style.display = isFilterSelect ? 'block' : 'none';

    const showDots = [PB.STATES.COUNTDOWN, PB.STATES.CAPTURING, PB.STATES.COMPOSITING].includes(state);
    PB.dom.photoCounter.style.opacity = showDots ? '1' : '0';

    PB.dom.resultOverlay.style.display = state === PB.STATES.RESULT ? 'flex' : 'none';

    if (![PB.STATES.COUNTDOWN, PB.STATES.CAPTURING].includes(state)) {
      PB.dom.countdownOverlay.style.opacity = '0';
    }
  }

  function setCountdownText(text) {
    PB.dom.countdownOverlay.textContent = text;
    PB.dom.countdownOverlay.style.opacity = text ? '1' : '0';
  }

  function triggerFlash() {
    const el = PB.dom.flashOverlay;
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.18s ease';
        el.style.opacity = '0';
      });
    });
  }

  function updatePhotoDots(filledCount) {
    PB.dom.photoCounter.innerHTML = '';
    for (let i = 0; i < PB.CONFIG.PHOTO_COUNT; i++) {
      const dot = document.createElement('div');
      dot.className = 'photo-dot' + (i < filledCount ? ' filled' : '');
      PB.dom.photoCounter.appendChild(dot);
    }
  }

  /** Shows/hides and fills the visual hand-lost countdown bar. `pct` is 0-100, or pass null to hide it. */
  function updateHandLostBar(pct) {
    if (pct === null) {
      PB.dom.handLostBar.style.display = 'none';
      return;
    }
    PB.dom.handLostBar.style.display = 'block';
    PB.dom.handLostBar.style.width = pct + '%';
  }

  function buildFilterMenu() {
    PB.dom.filterMenu.innerHTML = '<h3>☞ Pinch to Select</h3>';
    for (const name of PB.CONFIG.FILTERS) {
      const item = document.createElement('div');
      item.className = 'filter-item';
      item.dataset.filter = name;
      item.textContent = `${PB.FILTER_EMOJI[name] || '✨'}  ${name}`;
      PB.dom.filterMenu.appendChild(item);
    }
  }

  /**
   * Updates the filter menu's visual hover/progress state and applies
   * the cheap CSS live-preview filter to the frozen frame region.
   * @param {string|null} hoveredName
   * @param {number} progress - 0..1, how far through the pinch-hold-to-select the user is
   */
  function updateFilterHover(hoveredName, progress) {
    PB.dom.filterMenu.querySelectorAll('.filter-item').forEach((el) => {
      const isHovered = el.dataset.filter === hoveredName;
      el.className = 'filter-item' + (isHovered ? ' hovered' : '') + (isHovered && progress > 0 ? ' pinch-progress' : '');
      if (isHovered && progress > 0) {
        el.style.setProperty('--prog', Math.round(progress * 100) + '%');
      }
    });
  }

  /** Applies (or clears) the cheap CSS preview filter on the canvas element itself, used only while hovering a filter option. */
  function setLivePreviewFilter(filterName) {
    PB.dom.canvas.style.filter = filterName ? PB.FILTER_PREVIEW[filterName] || 'none' : 'none';
  }

  function showLoadingError(message) {
    PB.dom.loadingText.style.display = 'none';
    document.querySelector('#loadingScreen .spinner').style.display = 'none';
    PB.dom.errorMsg.textContent = message;
    PB.dom.retryBtn.style.display = 'inline-block';
  }

  function hideLoadingScreen() {
    PB.dom.loadingScreen.style.display = 'none';
  }

  /**
   * Populates the result screen with the finished filmstrip, wires up
   * Download/Share, and fires the (consent-gated, non-blocking) capture
   * log upload. Never lets the cloud upload delay or affect what the
   * user sees or is able to do with their own copy.
   * @param {string} dataUrl - JPEG data URL of the final filmstrip
   */
  async function showResult(dataUrl) {
    PB.dom.stripPreview.src = dataUrl;

    PB.dom.downloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `photobooth-strip-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    PB.dom.shareBtn.style.display = 'none';
    if (navigator.canShare) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'photo-strip.jpg', { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          PB.dom.shareBtn.style.display = 'inline-block';
          PB.dom.shareBtn.onclick = async () => {
            try {
              await navigator.share({ files: [file], title: PB.CONFIG.BRAND_NAME });
            } catch (e) {
              // user cancelled the share sheet — not an error
            }
          };
        }
      } catch (e) {
        // share unsupported/unavailable — download button remains the primary path
      }
    }

    setState(PB.STATES.RESULT);

    // Fire-and-forget: never awaited, never blocks the user's own save.
    PB.cloud.uploadCapture(dataUrl, PB.store.selectedFilter);
  }

  return {
    setState,
    setCountdownText,
    triggerFlash,
    updatePhotoDots,
    updateHandLostBar,
    buildFilterMenu,
    updateFilterHover,
    setLivePreviewFilter,
    showLoadingError,
    hideLoadingScreen,
    showResult,
  };
})();
