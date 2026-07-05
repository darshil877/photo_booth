/**
 * 04-geometry.js
 * ------------------------------------------------------------------
 * Responsibility: coordinate math shared by gesture detection and
 * rendering. This is the one file where getting units wrong causes
 * the most confusing bugs, so every function documents whether it
 * takes/returns normalized (0–1) MediaPipe coords or canvas pixel coords.
 * Depends on: 03-dom.js (for canvas size).
 * Exposes: PB.geometry
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.geometry = (function () {
  // Persistent history cache to keep track of hand coordinates across frames
  const handHistory = { Left: null, Right: null };
  // Smoothing factor (0.35 is the sweet spot: ultra-smooth without noticeable lag)
  const SMOOTHING_FACTOR = 0.35;

  /** Mirrors a normalized landmark's x coordinate (0–1 → 0–1, flipped). */
  function mirrorX(lm) {
    return 1 - lm.x;
  }

  /** Straight-through y (MediaPipe's y is already top-down, same as canvas). */
  function mirrorY(lm) {
    return lm.y;
  }

  /** Converts normalized landmark coordinates into absolute canvas pixel space. */
  function toPx(lm) {
    const canvas = PB.dom.canvas;
    return {
      x: mirrorX(lm) * canvas.width,
      y: mirrorY(lm) * canvas.height,
    };
  }

  /** Calculates Euclidean distance between two normalized points. */
  function dist(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  /** Calculates Euclidean distance between two absolute pixel points. */
  function distPx(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  /**
   * Smoothes out jittery hand coordinates using an Exponential Moving Average (EMA).
   * Processes data at the source so both gestures and rendering feel perfectly fluid.
   */
  function smoothHands(currentHands) {
    if (!currentHands || currentHands.length === 0) {
      handHistory.Left = null;
      handHistory.Right = null;
      return currentHands;
    }

    // Active tracking labels for this frame
    const activeLabels = new Set();

    for (const hand of currentHands) {
      const label = hand.label || (hand.handedness && hand.handedness[0]?.label) || 'Left';
      activeLabels.add(label);

      if (!handHistory[label]) {
        // First frame seeing this hand; clone coordinates directly to prevent snapping lag
        handHistory[label] = hand.landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
      } else {
        // Interpolate between the previous stable frame and the noisy new frame
        for (let i = 0; i < hand.landmarks.length; i++) {
          const prev = handHistory[label][i];
          const curr = hand.landmarks[i];

          curr.x = prev.x + SMOOTHING_FACTOR * (curr.x - prev.x);
          curr.y = prev.y + SMOOTHING_FACTOR * (curr.y - prev.y);
          curr.z = prev.z + SMOOTHING_FACTOR * (curr.z - prev.z);

          // Update the history cache
          prev.x = curr.x;
          prev.y = curr.y;
          prev.z = curr.z;
        }
      }
    }

    // Clear history for hands that left the frame
    if (!activeLabels.has('Left')) handHistory.Left = null;
    if (!activeLabels.has('Right')) handHistory.Right = null;

    return currentHands;
  }

  /**
   * Computes the bounding rectangle around the "viewfinder camera frame" corners.
   */
  function computeFrameRect(lmA, lmB) {
    const pts = [toPx(lmA[8]), toPx(lmA[4]), toPx(lmB[8]), toPx(lmB[4])];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }

  /** Converts a canvas-pixel coordinate to an on-screen viewport coordinate. */
  function canvasToScreen(cx, cy) {
    const canvas = PB.dom.canvas;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (cx / canvas.width) * rect.width,
      y: rect.top + (cy / canvas.height) * rect.height,
    };
  }

  return { mirrorX, mirrorY, toPx, dist, distPx, smoothHands, computeFrameRect, canvasToScreen };
})();