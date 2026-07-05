/**
 * 07-audio.js
 * ------------------------------------------------------------------
 * Responsibility: synthesized sound effects via the Web Audio API.
 * Deliberately does NOT depend on any external mp3/wav asset — every
 * sound is generated in code, so there's nothing that can 404 or go
 * missing when this project is moved/renamed/deployed.
 * Depends on: nothing.
 * Exposes: PB.audio
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.audio = (function () {
  let audioCtx = null;

  /** Lazily creates (and reuses) a single AudioContext. Browsers require this to happen after a user gesture, which is fine here since it's only ever called from within gesture-triggered flows. */
  function getContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  /** Camera shutter sound: a short filtered noise burst + a descending tone, layered for a mechanical "click" feel. */
  function playShutter() {
    try {
      const ac = getContext();
      const t = ac.currentTime;

      // Noise burst (the "click")
      const bufLen = Math.floor(ac.sampleRate * 0.045);
      const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.12));
      }
      const noiseSource = ac.createBufferSource();
      noiseSource.buffer = buf;
      const noiseGain = ac.createGain();
      noiseGain.gain.setValueAtTime(0.6, t);
      noiseGain.gain.linearRampToValueAtTime(0, t + 0.05);
      noiseSource.connect(noiseGain).connect(ac.destination);
      noiseSource.start(t);

      // Descending tone (adds body to the click)
      const osc = ac.createOscillator();
      const oscGain = ac.createGain();
      osc.frequency.setValueAtTime(1300, t);
      osc.frequency.exponentialRampToValueAtTime(500, t + 0.07);
      oscGain.gain.setValueAtTime(0.25, t);
      oscGain.gain.linearRampToValueAtTime(0, t + 0.09);
      osc.connect(oscGain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    } catch (e) {
      // Audio is a nice-to-have; never let a failure here break the capture flow.
    }
  }

  /** Ascending 3-note confirm chime, played once when the frame locks. */
  function playConfirmChime() {
    try {
      const ac = getContext();
      [880, 1100, 1400].forEach((freq, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const startTime = ac.currentTime + i * 0.08;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.22, startTime + 0.018);
        gain.gain.linearRampToValueAtTime(0, startTime + 0.09);
        osc.connect(gain).connect(ac.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.1);
      });
    } catch (e) {
      // Same as above — non-fatal.
    }
  }

  return { playShutter, playConfirmChime };
})();
