/**
 * 13-camera.js
 * ------------------------------------------------------------------
 * Responsibility: MediaPipe Hands + Camera setup, and the top-level
 * onResults() callback that draws the mirrored video + landmark
 * skeleton every frame, then dispatches to the current state's handler.
 * Depends on: everything (this is the orchestrator).
 * Exposes: PB.camera
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.camera = (function () {
  let handsModel = null;
  let faceModel = null;
  let cameraInstance = null;
  let latestFaces = []; // Stores face data between frames

  function drawMirroredVideoFrame(image) {
    const canvas = PB.dom.canvas;
    const ctx = PB.dom.ctx;
    if (canvas.width !== image.width || canvas.height !== image.height) {
      canvas.width = image.width || PB.dom.video.videoWidth || PB.CONFIG.CAMERA_WIDTH;
      canvas.height = image.height || PB.dom.video.videoHeight || PB.CONFIG.CAMERA_HEIGHT;
    }
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Handle incoming Face data
  function onFaceResults(results) {
    if (results.multiFaceLandmarks) {
      latestFaces = results.multiFaceLandmarks;
    } else {
      latestFaces = [];
    }
  }

  // Handle incoming Hand data (this acts as our main loop)
  function onHandResults(results) {
    const store = PB.store;

    if (store.appState === PB.STATES.LOADING) {
      PB.ui.hideLoadingScreen();
      PB.ui.setState(PB.STATES.IDLE);
    }

    drawMirroredVideoFrame(results.image);

    const hands = [];
    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        hands.push({
          landmarks: results.multiHandLandmarks[i],
          handedness: results.multiHandedness[i]?.[0]?.label || results.multiHandedness[i]?.label || 'Unknown',
        });
      }
    }

    // Draw the skeleton
    PB.render.drawLandmarks(hands);

    // Draw AR Props if faces are detected and an AR filter is active
    if (latestFaces.length > 0) {
      PB.render.drawARProps(latestFaces, store.selectedFilter || store.hoveredFilter);
    }

    // State machine dispatch
    switch (store.appState) {
      case PB.STATES.IDLE: PB.stateMachine.handleIdle(hands); break;
      case PB.STATES.FRAMING: PB.stateMachine.handleFraming(hands); break;
      case PB.STATES.LOCKED: PB.stateMachine.handleLocked(); break;
      case PB.STATES.FILTER_SELECT: PB.stateMachine.handleFilterSelect(hands); break;
      case PB.STATES.COUNTDOWN:
      case PB.STATES.CAPTURING: PB.stateMachine.handleCountdownOrCapturing(); break;
      case PB.STATES.RESULT: PB.stateMachine.handleResult(hands); break;
    }
  }

  async function waitForMediaPipe() {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (typeof Hands !== 'undefined' && typeof FaceMesh !== 'undefined') {
          console.log("MediaPipe libraries detected.");
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * ── Why Hands and FaceMesh are initialized sequentially ─────────────
   * Loading two MediaPipe "solutions" at the same time triggers a known
   * race condition in MediaPipe's own WASM loader (see google/mediapipe
   * issue #2823): whichever solution's assets are still in flight when
   * the other starts fetching can get its wasm/asset filenames crossed
   * with the other solution's. That produces 404s (e.g. a `hands_solution`
   * file requested from the `face_mesh/` CDN path) and a fatal,
   * unrecoverable WASM abort that takes down BOTH solutions — which is
   * why the app used to get stuck forever on the loading screen.
   *
   * The fix: call `.initialize()` on each model and AWAIT it before
   * touching the next one. `.initialize()` loads that solution's WASM
   * and model files up front instead of lazily on the first `.send()`,
   * so awaiting it forces the two solutions to load one at a time
   * instead of racing. Hands goes first and is fully loaded — and safe
   * — before FaceMesh's loading even begins.
   * ------------------------------------------------------------------
   */
  async function init() {
    try {
      // 1. Initialize Hands (Required - this must work)
      if (typeof Hands === 'undefined') {
        throw new Error("Hands library not loaded.");
      }

      handsModel = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
      handsModel.setOptions({
        maxNumHands: PB.CONFIG.MEDIAPIPE_MAX_HANDS,
        modelComplexity: PB.CONFIG.MEDIAPIPE_MODEL_COMPLEXITY,
        minDetectionConfidence: PB.CONFIG.MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
        minTrackingConfidence: PB.CONFIG.MEDIAPIPE_MIN_TRACKING_CONFIDENCE,
      });
      handsModel.onResults(onHandResults);

      // Wait for Hands' WASM/model to fully load BEFORE FaceMesh starts
      // fetching anything — this is what prevents the loader race.
      await handsModel.initialize();

      // 2. Initialize Face Mesh (OPTIONAL - check if it exists)
      if (typeof FaceMesh !== 'undefined') {
        try {
          faceModel = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
          faceModel.setOptions({
            maxNumFaces: 2,
            refineLandmarks: false,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
          });
          faceModel.onResults(onFaceResults);
          await faceModel.initialize();
        } catch (faceErr) {
          // AR face filters are a nice-to-have — never let a FaceMesh
          // load failure take down hand tracking, which the app can't
          // function without. Hands already finished loading above, so
          // it's unaffected by anything that goes wrong here.
          console.warn('FaceMesh failed to load — AR face filters disabled:', faceErr);
          faceModel = null;
        }
      } else {
        console.warn("FaceMesh library not found. AR features will be disabled.");
      }

      // 3. Start Camera
      cameraInstance = new Camera(PB.dom.video, {
        onFrame: async () => {
          if (PB.store.appState !== PB.STATES.COMPOSITING) {
            const promises = [handsModel.send({ image: PB.dom.video })];
            if (faceModel) {
              // Safety net: if FaceMesh ever throws on a later frame,
              // disable it instead of letting an unhandled rejection
              // (and possible WASM abort) take hand tracking down too.
              promises.push(
                faceModel.send({ image: PB.dom.video }).catch((e) => {
                  console.warn('FaceMesh frame failed — disabling AR face filters:', e);
                  faceModel = null;
                })
              );
            }
            await Promise.all(promises);
          }
        },
        width: PB.CONFIG.CAMERA_WIDTH,
        height: PB.CONFIG.CAMERA_HEIGHT,
      });

      await cameraInstance.start();
    } catch (e) {
      console.error(e);
      PB.ui.showLoadingError(`Camera failed to start: ${e.message}`);
    }
  }

  return { init };
})();