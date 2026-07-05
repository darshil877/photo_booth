/**
 * 06-render.js
 * ------------------------------------------------------------------
 * Responsibility: all canvas-drawing primitives (the video feed, hand
 * skeleton, viewfinder brackets, progress rings, AR face props).
 * Nothing here reads or writes PB.store — these are pure "given this
 * data, draw it" functions, called by 12-state-machine.js / 13-camera.js.
 * Depends on: 03-dom.js (ctx), 04-geometry.js (toPx).
 * Exposes: PB.render
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.render = (function () {
  const { toPx } = PB.geometry;

  // Standard MediaPipe hand connections, used as a fallback if the
  // official HAND_CONNECTIONS global (from @mediapipe/drawing_utils)
  // isn't available for some reason — landmark lines should never
  // just silently disappear because a CDN script didn't expose what
  // we expected.
  const FALLBACK_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];

  // Filter names that trigger a live AR overlay in drawARProps() below,
  // rather than (or in addition to) a color grade. Add a name here the
  // same moment you add its `else if` branch in drawARProps.
  const AR_PROP_FILTERS = new Set(['Cyberpunk', 'Noir', 'Dog Ears', 'Flower Crown']);

  /**
   * Draws the skeleton (dots + connecting lines) for every tracked hand.
   * Always called regardless of app state — this is the "it's working"
   * feedback layer that should never disappear.
   * @param {Array} hands - array of { landmarks } objects
   */
  function drawLandmarks(hands) {
    const ctx = PB.dom.ctx;
    const connections = typeof HAND_CONNECTIONS !== 'undefined' ? HAND_CONNECTIONS : FALLBACK_CONNECTIONS;

    ctx.save();
    for (const hand of hands) {
      const lm = hand.landmarks;

      ctx.strokeStyle = 'rgba(167,139,250,0.55)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [a, b] of connections) {
        const pa = toPx(lm[a]);
        const pb = toPx(lm[b]);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      for (let i = 0; i < lm.length; i++) {
        const p = toPx(lm[i]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = i === 8 || i === 4 ? 'rgba(56,189,248,0.95)' : 'rgba(167,139,250,0.8)';
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Draws the viewfinder as 4 corner L-brackets (not a full rectangle —
   * reads as a camera viewfinder rather than a plain box).
   * @param {{x,y,width,height}} rect - canvas-pixel rect
   * @param {string} color - any valid CSS color/rgba string
   * @param {boolean} locked - true once the frame is frozen (thicker line + stronger glow)
   */
  function drawViewfinder(rect, color, locked) {
    if (!rect || rect.width < 20 || rect.height < 20) return;
    const { x, y, width: w, height: h } = rect;
    const arm = Math.min(w, h) * 0.2;
    const ctx = PB.dom.ctx;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = locked ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = locked ? 20 : 10;

    const corners = [
      [x, y, arm, 0, 0, arm],
      [x + w, y, -arm, 0, 0, arm],
      [x, y + h, arm, 0, 0, -arm],
      [x + w, y + h, -arm, 0, 0, -arm],
    ];
    for (const [cx, cy, hx, hy, vx, vy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + hx, cy + hy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + vx, cy + vy);
      ctx.stroke();
    }

    if (!locked) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Draws a circular progress ring — reused for both the L-shape
   * build-up ring (on a fingertip) and the OK-lock ring (at frame center).
   * @param {number} cx - canvas-pixel center x
   * @param {number} cy - canvas-pixel center y
   * @param {number} radius
   * @param {number} pct - 0..1 progress
   * @param {string} color
   * @param {number} lineWidth
   */
  function drawProgressRing(cx, cy, radius, pct, color, lineWidth) {
    const ctx = PB.dom.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws a simple 5-petal flower centered at (x, y) in ABSOLUTE canvas
   * pixel coordinates, optionally rotated to match head tilt. Used only
   * by the 'Flower Crown' AR prop below.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - absolute canvas-pixel x
   * @param {number} y - absolute canvas-pixel y
   * @param {number} size - overall flower radius
   * @param {string} petalColor
   * @param {number} [angle=0] - head-tilt rotation, radians
   */
  function drawFlower(ctx, x, y, size, petalColor, angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = petalColor;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * size * 0.6, Math.sin(a) * size * 0.6, size * 0.5, size * 0.32, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Combines a point with steps along two perpendicular direction
   * vectors (both unit-length, both in absolute canvas-pixel space) to
   * get a new absolute canvas-pixel point. This is the core of how Dog
   * Ears / Flower Crown position themselves — see the big comment in
   * drawARProps for why this replaced a ctx.rotate()-based approach.
   * @param {{x:number,y:number}} origin
   * @param {{x:number,y:number}} up - unit vector, screen "up" for this face
   * @param {{x:number,y:number}} right - unit vector, screen "right" for this face
   * @param {number} alongUp - distance to move along `up` (+ = further up)
   * @param {number} alongRight - distance to move along `right` (+ = further right)
   * @returns {{x:number,y:number}}
   */
  function worldOffset(origin, up, right, alongUp, alongRight) {
    return {
      x: origin.x + up.x * alongUp + right.x * alongRight,
      y: origin.y + up.y * alongUp + right.y * alongRight,
    };
  }

  /**
   * Draws AR props directly onto tracked faces, tied to specific filters
   * to turn them into Snapchat-style AR lenses.
   *
   * ── Why Dog Ears / Flower Crown use a different technique than
   * Cyberpunk / Noir ──────────────────────────────────────────────
   * Cyberpunk and Noir draw inside a `ctx.translate(center) + ctx.rotate(angle)`
   * block, treating "negative local Y" as "up on screen." That's fine for
   * shapes centered right at the origin (eye line), but for Dog Ears and
   * Flower Crown — which need to reach up to the forehead/hairline — a
   * rotation-sign convention is easy to get subtly wrong. Instead, these
   * two compute their own "up" and "right" directions straight from two
   * real, independent landmarks:
   * up    = normalize(forehead[10] − chin[152])
   * right = perpendicular to up
   * "Up" is defined as "the direction from your chin to your forehead,"
   * so it's up by construction. worldOffset() below then places every
   * point as "so far up, so far right" from a landmark, in absolute
   * canvas pixels.
   *
   * ── How to add a new lens ────────────────────────────────────────────
   * 1. Add the filter's name to PB.CONFIG.FILTERS in 01-config.js (plus a
   * FILTER_PREVIEW entry — usually 'none' — and a FILTER_EMOJI entry).
   * 2. Add the name to AR_PROP_FILTERS above.
   * 3. Add a branch below. For anything anchored near eye level, the
   * Cyberpunk/Noir style (ctx.translate/rotate, draw at/near origin)
   * is fine. For anything that needs to reach further up or down the
   * face (hats, crowns, ears, chins), prefer the worldOffset()/up/right
   * style Dog Ears and Flower Crown use below.
   *
   * Handy MediaPipe Face Mesh (468-point) landmark indices:
   * 1   — nose tip
   * 10  — forehead (topmost point of the face-skin mesh — NOT quite
   * the visual hairline; Dog Ears/Flower Crown push further up
   * from here via their LIFT constant to approximate it)
   * 152 — chin
   * 168 — nose bridge / between the eyes (Cyberpunk/Noir's local origin,
   * and the anchor for the Dog Ears nose accent below)
   * 127 / 356 — left / right temple
   * 234 / 454 — left / right face edge (used below for `width`/`angle`)
   * ------------------------------------------------------------------
   */
  function drawARProps(faces, filterName) {
    if (!AR_PROP_FILTERS.has(filterName)) return;

    const ctx = PB.dom.ctx;
    ctx.save();

    for (const face of faces) {
      const leftEdge = PB.geometry.toPx(face[234]);
      const rightEdge = PB.geometry.toPx(face[454]);
      const center = PB.geometry.toPx(face[168]);
      const chinPx = PB.geometry.toPx(face[152]);
      const foreheadPx = PB.geometry.toPx(face[10]);

      const width = PB.geometry.dist(face[234], face[454]) * PB.dom.canvas.width * 1.1;
      const angle = Math.atan2(rightEdge.y - leftEdge.y, rightEdge.x - leftEdge.x);

      if (filterName === 'Cyberpunk' || filterName === 'Noir') {
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(angle);

        if (filterName === 'Cyberpunk') {
          // Draw a glowing Neon Visor
          ctx.fillStyle = 'rgba(6, 182, 212, 0.85)'; // Cyan glass
          ctx.shadowColor = '#a78bfa'; // Purple glow
          ctx.shadowBlur = 20;
          ctx.fillRect(-width / 2, -width * 0.1, width, width * 0.25);

          ctx.strokeStyle = '#a78bfa';
          ctx.lineWidth = 3;
          ctx.strokeRect(-width / 2, -width * 0.1, width, width * 0.25);
        }
        else {
          // Noir — classic round sunglasses: two full-circle lenses +
          // bridge + arms toward the temples + a soft glossy highlight.
          ctx.shadowBlur = 0;
          const lensRadius = width * 0.16;
          const lensX = width * 0.24;
          const lensY = 0;

          ctx.fillStyle = '#111111';
          ctx.beginPath();
          ctx.arc(-lensX, lensY, lensRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(lensX, lensY, lensRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#111111';
          ctx.lineWidth = width * 0.025;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-lensX + lensRadius * 0.75, lensY);
          ctx.lineTo(lensX - lensRadius * 0.75, lensY);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(-lensX - lensRadius * 0.85, lensY);
          ctx.lineTo(-width * 0.55, lensY - width * 0.03);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(lensX + lensRadius * 0.85, lensY);
          ctx.lineTo(width * 0.55, lensY - width * 0.03);
          ctx.stroke();

          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          ctx.beginPath();
          ctx.ellipse(-lensX - lensRadius * 0.3, lensY - lensRadius * 0.3, lensRadius * 0.35, lensRadius * 0.18, -0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(lensX - lensRadius * 0.3, lensY - lensRadius * 0.3, lensRadius * 0.35, lensRadius * 0.18, -0.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
      else {
        // Dog Ears / Flower Crown — world-space vector approach (see
        // the big comment above this function for why).
        const upDx = foreheadPx.x - chinPx.x;
        const upDy = foreheadPx.y - chinPx.y;
        const upLen = Math.hypot(upDx, upDy) || 1;
        const up = { x: upDx / upLen, y: upDy / upLen };
        const right = { x: -up.y, y: up.x };

        ctx.shadowBlur = 0;

        if (filterName === 'Dog Ears') {
          // LIFT: how far above the raw landmark-10 forehead point to
          // anchor the base of the ears. Lowered further to sit directly
          // against the head without a floating gap.
          const LIFT = width * 0.12; 
          const earWidth = width * 0.32;
          const earHeight = width * 0.5;
          const earAnchor = worldOffset(foreheadPx, up, right, LIFT, 0);

          for (const side of [-1, 1]) {
            const base = worldOffset(earAnchor, up, right, 0, side * width * 0.42);
            const bulge = worldOffset(base, up, right, earHeight * 0.4, side * earWidth);
            const tip = worldOffset(base, up, right, earHeight, side * earWidth * 0.5);
            const innerCtl = worldOffset(base, up, right, earHeight * 0.6, 0);

            ctx.fillStyle = '#8b5a2b';
            ctx.strokeStyle = '#5c3a1a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.quadraticCurveTo(bulge.x, bulge.y, tip.x, tip.y);
            ctx.quadraticCurveTo(innerCtl.x, innerCtl.y, base.x, base.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Inner ear
            const innerCenter = worldOffset(base, up, right, earHeight * 0.45, side * earWidth * 0.22);
            ctx.fillStyle = '#e8a0b0';
            ctx.beginPath();
            ctx.ellipse(innerCenter.x, innerCenter.y, earWidth * 0.28, earHeight * 0.3, angle + side * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }

          // Small nose accent — Anchor to landmark 1 (nose tip) instead
          // of 168 (between the eyes) so it sits correctly on the user's actual nose.
          const noseTipPx = PB.geometry.toPx(face[1]);
          const noseAccent = worldOffset(noseTipPx, up, right, 0, 0);
          
          ctx.fillStyle = '#3b2a1a';
          ctx.beginPath();
          ctx.ellipse(noseAccent.x, noseAccent.y, width * 0.06, width * 0.045, angle, 0, Math.PI * 2);
          ctx.fill();
        }
        else if (filterName === 'Flower Crown') {
          // LIFT: same idea as Dog Ears — how far above landmark 10 to
          // place the row of flowers, so it sits at the hairline instead
          // of across the eyebrows. (Unchanged — this one already looked
          // correct in your last screenshot.)
          const LIFT = width * 0.5;
          const crownAnchor = worldOffset(foreheadPx, up, right, LIFT, 0);
          const spread = width * 0.9;
          const petalColors = ['#f472b6', '#fbbf24', '#f472b6', '#fbbf24', '#f472b6'];

          for (let i = 0; i < 5; i++) {
            const t = i / 4; // 0..1 across the row
            const alongRight = -spread / 2 + spread * t;
            const arc = Math.sin(t * Math.PI) * width * 0.08; // gentle upward arc at center
            const flowerPos = worldOffset(crownAnchor, up, right, arc, alongRight);
            drawFlower(ctx, flowerPos.x, flowerPos.y, width * 0.09, petalColors[i], angle);
          }
        }
      }
    }
    ctx.restore();
  }

  return { drawLandmarks, drawViewfinder, drawProgressRing, drawARProps };
})();