/**
 * 01-config.js
 * ------------------------------------------------------------------
 * Responsibility: all tunable constants for the app in one place.
 * Depends on: nothing (must load first).
 * Exposes: PB.CONFIG, PB.STATES, PB.FILTER_PREVIEW, PB.FILTER_EMOJI
 *
 * Nothing in this file should ever be a "magic number" duplicated
 * elsewhere in the codebase — if a value needs tuning, it lives here.
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.CONFIG = {
  // ---- Gesture thresholds (normalized 0–1 MediaPipe coordinates) ----
  L_SHAPE_THUMB_MIN_DIST: 0.08,   // min thumb-to-palm spread to count as "thumb out". Safe range 0.06–0.10.
  OK_PINCH_MAX_DIST: 0.055,       // max thumb-index distance to count as the strict OK-sign pinch. Safe range 0.04–0.07.
  MENU_PINCH_MAX_DIST: 0.08,      // looser pinch distance used only for the filter-menu cursor (easier to hold). Safe range 0.06–0.10.

  // ---- Debounce / timing (frames @ ~30fps unless noted) ----
  GESTURE_DEBOUNCE_FRAMES: 10,    // consecutive frames a gesture must hold before it triggers a state change. Higher = fewer false triggers, slower to respond.
  PINCH_SELECT_FRAMES: 18,        // consecutive pinching frames on a hovered filter before it's selected (~0.3s @ 60fps). Prevents accidental selection.
  HAND_LOST_TIMEOUT_MS: 1500,     // how long a locked hand can go untracked before the app gives up and resets to IDLE.

  // ---- Capture sequence ----
  PHOTO_COUNT: 3,
  COUNTDOWN_SECONDS: 3,
  COUNTDOWN_TICK_MS: 880,         // how long each countdown number stays on screen.
  GAP_BETWEEN_SHOTS_MS: 1300,     // pause between the 3 shots so the user can reset their pose.
  OUTPUT_PHOTO_WIDTH: 640,        // every captured photo is normalized to this width before filtering/compositing, regardless of how big the user's locked frame was.

  // ---- Branding / filmstrip ----
  BRAND_NAME: 'WebCraft Studio',
  FILMSTRIP_BG_TOP: '#ffffff',
  FILMSTRIP_BG_BOTTOM: '#ffffff',
  // ---- Filters ----
  // Most filters below are pure color grades (see PB.FILTER_PREVIEW for
  // the cheap live-preview CSS, and 08-filters.js for the real baked
  // effect if one exists — check PB.filters.PIXEL_FILTER_NAMES).
  // 'Cyberpunk', 'Noir', 'Dog Ears', and 'Flower Crown' are AR LENS
  // filters instead: selecting/hovering them draws a live overlay onto
  // the tracked face via PB.render.drawARProps() in 06-render.js, which
  // gets baked into the photo automatically since it's drawn straight
  // onto the canvas before capture.
  FILTERS: ['Original', 'Aden', 'Earlybird', 'Hudson', 'Inkwell', 'Lofi', 'Reyes', 'Toaster', 'Willow', 'Sepia', 'Hue Rotate', 'Noir', 'Cyberpunk', 'Dog Ears', 'Flower Crown', 'Duotone', 'Vintage VHS', 'Cinematic'],
  // ---- MediaPipe / camera ----
  MEDIAPIPE_MAX_HANDS: 2,
  MEDIAPIPE_MODEL_COMPLEXITY: 1,
  MEDIAPIPE_MIN_DETECTION_CONFIDENCE: 0.7, // higher = fewer false-positive hand detections, may miss hands at odd angles. Safe range 0.5–0.8.
  MEDIAPIPE_MIN_TRACKING_CONFIDENCE: 0.6,
  CAMERA_WIDTH: 1280,
  CAMERA_HEIGHT: 720,
};

/** Named states for the app's single state machine. */
PB.STATES = {
  LOADING: 'LOADING', IDLE: 'IDLE', FRAMING: 'FRAMING', LOCKED: 'LOCKED',
  FILTER_SELECT: 'FILTER_SELECT', COUNTDOWN: 'COUNTDOWN', CAPTURING: 'CAPTURING',
  COMPOSITING: 'COMPOSITING', RESULT: 'RESULT',
};

/**
 * Cheap CSS `filter` approximations used ONLY for the live hover preview
 * in the filter menu. The real per-pixel effect (see 08-filters.js) is
 * what actually gets baked into the final photos for filters listed in
 * PB.filters.PIXEL_FILTER_NAMES — this is just a fast visual hint so the
 * user knows roughly what they're about to pick. AR lens filters
 * ('Cyberpunk', 'Noir', 'Dog Ears', 'Flower Crown') use 'none' here
 * since their live preview IS the AR overlay drawn on the canvas, not a
 * color wash.
 */
PB.FILTER_PREVIEW = {
  'Original': 'none',
  'Aden': 'brightness(110%) contrast(110%) saturate(130%)',
  'Earlybird': 'contrast(90%) sepia(20%)',
  'Hudson': 'brightness(120%) contrast(90%) saturate(110%)',
  'Inkwell': 'brightness(110%) contrast(110%) grayscale(100%) sepia(30%)',
  'Lofi': 'contrast(150%) saturate(110%)',
  'Reyes': 'brightness(110%) contrast(85%) saturate(75%) sepia(22%)',
  'Toaster': 'brightness(90%) contrast(150%)',
  'Willow': 'brightness(90%) contrast(95%) grayscale(50%)',
  'Sepia': 'sepia(100%)',
  'Hue Rotate': 'hue-rotate(90deg)',
  'Noir': 'grayscale(100%) contrast(115%) brightness(95%)',
  'Cyberpunk': 'none',
  'Dog Ears': 'none',
  'Flower Crown': 'none',
  'Duotone': 'grayscale(100%) contrast(120%) sepia(40%) hue-rotate(220deg) saturate(280%)',
  'Vintage VHS': 'contrast(110%) saturate(60%) sepia(15%) brightness(105%)',
  'Cinematic': 'contrast(105%) saturate(85%) brightness(103%) sepia(8%)',
};

/** Small emoji glyphs shown next to each filter name in the menu. */
PB.FILTER_EMOJI = {
  'Original': '🎨',
  'Aden': '🌸',
  'Earlybird': '🌅',
  'Hudson': '🧊',
  'Inkwell': '✒️',
  'Lofi': '📻',
  'Reyes': '🍂',
  'Toaster': '🍞',
  'Willow': '🌿',
  'Sepia': '🟤',
  'Hue Rotate': '🔮',
  'Noir': '🕶️',
  'Cyberpunk': '⚡',
  'Dog Ears': '🐶',
  'Flower Crown': '💐',
  'Duotone': '🌀',
  'Vintage VHS': '📼',
  'Cinematic': '🎬',
};