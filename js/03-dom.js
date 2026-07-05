/**
 * 03-dom.js
 * ------------------------------------------------------------------
 * Responsibility: grab every DOM element the app touches, once, in
 * one place. No rendering logic lives here — just references.
 * Depends on: index.html (elements must exist in the markup already).
 * Exposes: PB.dom
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.dom = {
  video: document.getElementById('video'),
  canvas: document.getElementById('canvas'),
  ctx: document.getElementById('canvas').getContext('2d'),

  stateBadge: document.getElementById('stateBadge'),
  toast: document.getElementById('toast'),
  photoCounter: document.getElementById('photoCounter'),
  countdownOverlay: document.getElementById('countdownOverlay'),
  filterMenu: document.getElementById('filterMenu'),
  pinchCursor: document.getElementById('pinchCursor'),
  handLostBar: document.getElementById('handLostBar'),
  flashOverlay: document.getElementById('flashOverlay'),

  loadingScreen: document.getElementById('loadingScreen'),
  loadingText: document.getElementById('loadingText'),
  retryBtn: document.getElementById('retryBtn'),
  errorMsg: document.getElementById('errorMsg'),

  resultOverlay: document.getElementById('resultOverlay'),
  stripPreview: document.getElementById('stripPreview'),
  downloadBtn: document.getElementById('downloadBtn'),
  shareBtn: document.getElementById('shareBtn'),
  newPhotoBtn: document.getElementById('newPhotoBtn'),
};
