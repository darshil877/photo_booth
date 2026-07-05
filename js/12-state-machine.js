/**
 * 12-state-machine.js
 * ------------------------------------------------------------------
 * Responsibility: one handler function per app state, plus the hand-
 * identity resolution that keeps the "only the two hands that formed
 * the frame can lock it" guarantee. This is the file to read first to
 * understand the app's behavior — see the ASCII map below.
 * Depends on: everything else except 13-camera.js and 15-main.js.
 * Exposes: PB.stateMachine
 *
 *   LOADING → IDLE → FRAMING → LOCKED → FILTER_SELECT
 *                                              │
 *                                        (pinch-hold selects a filter)
 *                                              ▼
 *                              COUNTDOWN ⇄ CAPTURING (loops 3x)
 *                                              │
 *                                              ▼
 *                                        COMPOSITING → RESULT
 *                                              │
 *                              (New Photo button, or open-palm hold)
 *                                              ▼
 *                                            IDLE
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.stateMachine = (function () {
  const { gestures, geometry, render, audio, ui, capture } = PB;

  /**
   * Given the currently detected hands and a previously-stored identity
   * (handedness label + last known wrist position), finds the best
   * matching hand in the current frame. Hands already claimed for the
   * OTHER identity are excluded via `usedIndices` so the two identities
   * can never both resolve to the same physical hand.
   *
   * This — combined with only ever calling isOKSign on the two resolved
   * hands — is what guarantees a third hand entering the shot can never
   * trigger the lock: its landmarks are simply never evaluated.
   *
   * @param {{label:string,lastWrist:object}} identity
   * @param {Array<{landmarks:Array,handedness:string}>} hands
   * @param {Set<number>} usedIndices - indices into `hands` already claimed
   * @returns {number} matched index into `hands`, or -1 if none found
   */
  function resolveHandIndex(identity, hands, usedIndices) {
    let bestIndex = -1;
    let bestScore = Infinity;
    for (let i = 0; i < hands.length; i++) {
      if (usedIndices.has(i)) continue;
      const wristDist = geometry.dist(hands[i].landmarks[0], identity.lastWrist);
      const handednessMismatchPenalty = hands[i].handedness === identity.label ? 0 : 0.5;
      const score = wristDist + handednessMismatchPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    // 1.2 is a generous cutoff in normalized-distance-plus-penalty units —
    // this only needs to reject "wildly implausible" matches (e.g. nothing
    // detected at all), not be a precise threshold.
    return bestScore < 1.2 ? bestIndex : -1;
  }

  /**
   * Resolves both locked hand identities against the current frame's
   * detected hands.
   * @param {Array} hands
   * @returns {{handA:object,handB:object}|null} the two matched hand objects, or null if either is missing
   */
  function resolveLockedHands(hands) {
    const identities = PB.store.lockedHandIds;
    if (!identities) return null;

    const used = new Set();
    const indexA = resolveHandIndex(identities.handA, hands, used);
    if (indexA !== -1) used.add(indexA);
    const indexB = resolveHandIndex(identities.handB, hands, used);

    if (indexA === -1 || indexB === -1) return null;

    // Update stored wrist positions for next-frame continuity.
    identities.handA.lastWrist = { ...hands[indexA].landmarks[0] };
    identities.handB.lastWrist = { ...hands[indexB].landmarks[0] };

    return { handA: hands[indexA], handB: hands[indexB] };
  }

  function handleIdle(hands) {
    const store = PB.store;
    if (hands.length >= 2 && gestures.isLShape(hands[0].landmarks) && gestures.isLShape(hands[1].landmarks)) {
      store.lShapeFrames++;

      const tip = geometry.toPx(hands[0].landmarks[8]);
      const progress = store.lShapeFrames / PB.CONFIG.GESTURE_DEBOUNCE_FRAMES;
      render.drawProgressRing(tip.x, tip.y, 16, progress, 'rgba(167,139,250,0.85)', 3);

      if (store.lShapeFrames >= PB.CONFIG.GESTURE_DEBOUNCE_FRAMES) {
        store.lShapeFrames = 0;
        store.lockedHandIds = {
          handA: { label: hands[0].handedness, lastWrist: { ...hands[0].landmarks[0] } },
          handB: { label: hands[1].handedness, lastWrist: { ...hands[1].landmarks[0] } },
        };
        ui.setState(PB.STATES.FRAMING);
      }
    } else {
      store.lShapeFrames = Math.max(0, store.lShapeFrames - 1);
    }
  }

  function handleFraming(hands) {
    const store = PB.store;
    const matched = resolveLockedHands(hands);

    if (!matched) {
      if (!store.handLostStart) store.handLostStart = Date.now();
      const elapsed = Date.now() - store.handLostStart;
      ui.updateHandLostBar(Math.min(100, (elapsed / PB.CONFIG.HAND_LOST_TIMEOUT_MS) * 100));
      if (elapsed >= PB.CONFIG.HAND_LOST_TIMEOUT_MS) {
        ui.updateHandLostBar(null);
        PB.resetToIdle();
        return;
      }
      if (store.frame.width > 0) render.drawViewfinder(store.frame, 'rgba(167,139,250,0.4)', false);
      return;
    }

    store.handLostStart = null;
    ui.updateHandLostBar(null);

    const { handA, handB } = matched;
    store.frame = geometry.computeFrameRect(handA.landmarks, handB.landmarks);

    const aOK = gestures.isOKSign(handA.landmarks);
    const bOK = gestures.isOKSign(handB.landmarks);
    if (aOK && bOK) {
      store.okFrames++;
      if (store.okFrames >= PB.CONFIG.GESTURE_DEBOUNCE_FRAMES) {
        store.okFrames = 0;
        store.frozenFrame = { ...store.frame };
        store.lockFlashFrames = 24;
        audio.playConfirmChime();
        ui.buildFilterMenu();
        ui.setState(PB.STATES.LOCKED);
        return;
      }
    } else {
      store.okFrames = Math.max(0, store.okFrames - 1);
    }

    // Viewfinder color eases from purple toward cyan as the OK-lock progresses.
    const t = store.okFrames / PB.CONFIG.GESTURE_DEBOUNCE_FRAMES;
    const r = 167 + Math.round((56 - 167) * t);
    const g = 139 + Math.round((189 - 139) * t);
    const b = 250 + Math.round((248 - 250) * t);
    render.drawViewfinder(store.frame, `rgba(${r},${g},${b},0.9)`, false);

    if (store.okFrames > 0) {
      const cx = store.frame.x + store.frame.width / 2;
      const cy = store.frame.y + store.frame.height / 2;
      render.drawProgressRing(cx, cy, 26, t, 'rgba(56,189,248,0.85)', 3.5);
    }
  }

  function handleLocked() {
    const store = PB.store;
    render.drawViewfinder(store.frozenFrame, 'rgba(56,189,248,0.9)', true);

    if (store.lockFlashFrames > 0) {
      store.lockFlashFrames--;
      const alpha = store.lockFlashFrames % 6 < 3 ? 0.35 : 0;
      const ctx = PB.dom.ctx;
      ctx.fillStyle = `rgba(56,189,248,${alpha})`;
      ctx.fillRect(store.frozenFrame.x, store.frozenFrame.y, store.frozenFrame.width, store.frozenFrame.height);
    } else {
      ui.setState(PB.STATES.FILTER_SELECT);
    }
  }

  function handleFilterSelect(hands) {
    const store = PB.store;
    render.drawViewfinder(store.frozenFrame, 'rgba(56,189,248,0.65)', true);

    if (hands.length === 0) {
      store.pinchHoldFrames = Math.max(0, store.pinchHoldFrames - 1);
      return;
    }

    const landmarks = hands[0].landmarks;
    const tip = geometry.toPx(landmarks[8]);
    const pinching = gestures.isPinching(landmarks);
    const { x: screenX, y: screenY } = geometry.canvasToScreen(tip.x, tip.y);

    PB.dom.pinchCursor.style.left = screenX + 'px';
    PB.dom.pinchCursor.style.top = screenY + 'px';
    PB.dom.pinchCursor.className = pinching ? 'pinching' : '';

    let newHover = null;
    PB.dom.filterMenu.querySelectorAll('.filter-item').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (screenX >= r.left && screenX <= r.right && screenY >= r.top && screenY <= r.bottom) {
        newHover = el.dataset.filter;
      }
    });

    if (newHover !== store.hoveredFilter) {
      store.hoveredFilter = newHover;
      store.pinchHoldFrames = 0;
      ui.setLivePreviewFilter(newHover);
    }

    if (store.hoveredFilter && pinching) {
      store.pinchHoldFrames++;
      ui.updateFilterHover(store.hoveredFilter, store.pinchHoldFrames / PB.CONFIG.PINCH_SELECT_FRAMES);
      if (store.pinchHoldFrames >= PB.CONFIG.PINCH_SELECT_FRAMES) {
        store.selectedFilter = store.hoveredFilter;
        store.hoveredFilter = null;
        store.pinchHoldFrames = 0;
        ui.setLivePreviewFilter(null);
        capture.runCaptureSequence();
      }
    } else {
      if (!pinching) store.pinchHoldFrames = Math.max(0, store.pinchHoldFrames - 1);
      ui.updateFilterHover(store.hoveredFilter, store.pinchHoldFrames / PB.CONFIG.PINCH_SELECT_FRAMES);
    }
  }

  function handleCountdownOrCapturing() {
    if (PB.store.frozenFrame) render.drawViewfinder(PB.store.frozenFrame, 'rgba(56,189,248,0.75)', true);
  }

  /**
   * Hands-free reset: holding an open palm for ~2x the normal debounce
   * window resets straight to IDLE, so the app can be used photo-booth
   * style without needing to reach for the "New Photo" button. This is
   * the one state where we deliberately keep sending frames to MediaPipe
   * (see the COMPOSITING-only skip in 13-camera.js) — RESULT can stay on
   * screen indefinitely while the user decides what to do, so hands-free
   * reset is worth the modest ongoing tracking cost.
   */
  function handleResult(hands) {
    const store = PB.store;
    if (hands.length >= 1 && gestures.isOpenPalm(hands[0].landmarks)) {
      store.openPalmFrames++;
      if (store.openPalmFrames > PB.CONFIG.GESTURE_DEBOUNCE_FRAMES * 2) {
        store.openPalmFrames = 0;
        PB.resetToIdle();
      }
    } else {
      store.openPalmFrames = 0;
    }
  }

  return {
    handleIdle,
    handleFraming,
    handleLocked,
    handleFilterSelect,
    handleCountdownOrCapturing,
    handleResult,
  };
})();
