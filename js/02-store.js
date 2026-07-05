/**
 * 02-store.js
 * ------------------------------------------------------------------
 * Responsibility: the single source of truth for all mutable app state.
 * Depends on: 01-config.js (for PB.STATES).
 * Exposes: PB.store
 *
 * Every other file reads/writes fields on this object instead of
 * declaring its own top-level `let` variables. Because these are plain
 * (non-module) scripts, two files declaring their own `let frame` would
 * silently create two unrelated variables — this object is what keeps
 * everyone looking at the same state.
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.store = {
  appState: PB.STATES.LOADING,

  // gesture debounce counters
  lShapeFrames: 0,
  okFrames: 0,

  // hand identity, set once both hands are confirmed making the L-shape.
  // shape: { handA: { label, lastWrist }, handB: { label, lastWrist } }
  lockedHandIds: null,
  handLostStart: null, // timestamp (ms) when a locked hand first went untracked, or null

  // live frame rect (canvas pixel space) while framing, and the frozen copy once locked
  frame: { x: 0, y: 0, width: 0, height: 0 },
  frozenFrame: null,
  lockFlashFrames: 0,

  // filter selection
  selectedFilter: 'Original',
  hoveredFilter: null,
  pinchHoldFrames: 0,

  // capture sequence
  capturedPhotos: [],
  captureRunning: false,

  // result
  resultDataUrl: null,

  // consent — set true the moment the user proceeds past the IDLE disclosure.
  // Nothing is ever uploaded to Supabase before this is true. See 14-supabase-client.js.
  consentGiven: false,

  // reset-via-open-palm-hold (hands-free alternative to the "New Photo" button)
  openPalmFrames: 0,
};

/** Resets every field to its startup value and returns to IDLE. Called by the "New Photo" button and by the open-palm-hold gesture. */
PB.resetToIdle = function resetToIdle() {
  const s = PB.store;
  s.lShapeFrames = 0;
  s.okFrames = 0;
  s.lockedHandIds = null;
  s.handLostStart = null;
  s.frame = { x: 0, y: 0, width: 0, height: 0 };
  s.frozenFrame = null;
  s.lockFlashFrames = 0;
  s.selectedFilter = 'Original';
  s.hoveredFilter = null;
  s.pinchHoldFrames = 0;
  s.capturedPhotos = [];
  s.captureRunning = false;
  s.resultDataUrl = null;
  s.openPalmFrames = 0;
  // consentGiven intentionally NOT reset — once shown and passed, no need to re-disclose
  // again this session; the notice reappears naturally next time IDLE is rendered anyway.
  PB.ui.setState(PB.STATES.IDLE);
};
