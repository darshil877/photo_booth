/**
 * 05-gestures.js
 * ------------------------------------------------------------------
 * Responsibility: pure pose-classification functions. Each takes one
 * hand's 21 raw MediaPipe landmarks (normalized, UN-mirrored — mirroring
 * doesn't matter for these since we only compare y-values and distances
 * within the same hand) and returns true/false. No state, no drawing.
 * Depends on: 01-config.js (thresholds), 04-geometry.js (dist).
 * Exposes: PB.gestures
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.gestures = (function () {
  const { dist } = PB.geometry;

  /**
   * "L-shape" viewfinder pose: index finger up, thumb spread out and
   * away from the palm, middle/ring/pinky curled down.
   * @param {Array} lm - 21 landmarks for one hand
   */
  function isLShape(lm) {
    const indexUp = lm[8].y < lm[6].y;
    const thumbOut = dist(lm[4], lm[2]) > PB.CONFIG.L_SHAPE_THUMB_MIN_DIST;
    const middleCurled = lm[12].y > lm[10].y;
    const ringCurled = lm[16].y > lm[14].y;
    const pinkyCurled = lm[20].y > lm[18].y;
    return indexUp && thumbOut && middleCurled && ringCurled && pinkyCurled;
  }

  /**
   * "OK sign" lock pose: thumb and index pinched together, middle/ring/pinky
   * extended upward. Uses the strict OK_PINCH_MAX_DIST threshold since this
   * gesture triggers an irreversible-feeling action (locking the frame).
   * @param {Array} lm - 21 landmarks for one hand
   */
  function isOKSign(lm) {
    const pinched = dist(lm[8], lm[4]) < PB.CONFIG.OK_PINCH_MAX_DIST;
    const middleUp = lm[12].y < lm[10].y;
    const ringUp = lm[16].y < lm[14].y;
    const pinkyUp = lm[20].y < lm[18].y;
    return pinched && middleUp && ringUp && pinkyUp;
  }

  /**
   * Loose pinch used only for the filter-menu cursor. Uses a more generous
   * threshold than the OK sign since this is held for a fraction of a
   * second while pointing, not a deliberate one-shot confirmation.
   * @param {Array} lm - 21 landmarks for one hand
   */
  function isPinching(lm) {
    return dist(lm[8], lm[4]) < PB.CONFIG.MENU_PINCH_MAX_DIST;
  }

  /**
   * Open palm: all four fingers extended upward. Used as a hands-free
   * alternative to tapping "New Photo" on the result screen.
   * @param {Array} lm - 21 landmarks for one hand
   */
  function isOpenPalm(lm) {
    return lm[8].y < lm[6].y && lm[12].y < lm[10].y && lm[16].y < lm[14].y && lm[20].y < lm[18].y;
  }

  return { isLShape, isOKSign, isPinching, isOpenPalm };
})();
