/**
 * 14-supabase-client.js
 * ------------------------------------------------------------------
 * Responsibility: uploads a copy of each finished filmstrip to a
 * private Supabase bucket for the developer to review, so real
 * captures can inform future UX improvements.
 * Depends on: 02-store.js (consentGiven flag), the Supabase JS CDN
 *             script (must be loaded in index.html before this file).
 * Exposes: PB.cloud
 *
 * ── Why the consent line is non-negotiable ──────────────────────────
 * The photo contains a real person's face. Saving a copy somewhere
 * they don't know about isn't a technical detail — it's collecting
 * someone's likeness without telling them, which real data-protection
 * law (India's DPDP Act, GDPR for any non-Indian visitor) treats as
 * something that needs consent. The disclosure line lives in the IDLE
 * toast text in 11-ui.js and costs the user nothing to read before the
 * flow starts. Do not remove, hide, or silently disable that line —
 * and this file refuses to upload anything before `PB.store.consentGiven`
 * is true (set the moment the user proceeds past IDLE; see setState()
 * in 11-ui.js).
 *
 * ── Why the anon key below is safe to ship in client code ──────────
 * ONLY because of the Supabase Row Level Security policies described
 * in README.md: the `anon` role can INSERT into the `captures` table
 * and bucket, but cannot SELECT, list, or download anything — so any
 * visitor's browser can write a new capture, but no visitor's browser
 * can browse or read back anyone else's.
 * ------------------------------------------------------------------
 */
window.PB = window.PB || {};

PB.cloud = (function () {
  // Fill these in with your own Supabase project's values. See README.md
  // for how to create the project, bucket, table, and RLS policies.
  const SUPABASE_URL = 'https://qxbbmrndjamkrsgwxnxd.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4YmJtcm5kamFta3JzZ3d4bnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNjUzMDIsImV4cCI6MjA5ODc0MTMwMn0.cOTJ6Ig_0hG-fCNQsiywxSPwBpSXpLC7LynwHD5ck4E';
  const BUCKET_NAME = 'photobooth-captures';

  let client = null;

  function getClient() {
    if (!client) {
      if (typeof supabase === 'undefined') {
        console.warn('Supabase JS SDK not loaded — capture logging is disabled. Check the CDN <script> tag in index.html.');
        return null;
      }
      if (SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_')) {
        console.warn('Supabase not configured — fill in SUPABASE_URL / SUPABASE_ANON_KEY in 14-supabase-client.js to enable capture logging.');
        return null;
      }
      client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return client;
  }

  /**
   * Uploads the final filmstrip image to Supabase Storage and logs a
   * row with its path + filter used. Fire-and-forget by design: never
   * awaited by callers, and any failure is swallowed after a console
   * warning — a slow or failed background analytics upload must never
   * be visible to the user or affect their own download/share.
   * @param {string} dataUrl - JPEG data URL of the finished filmstrip
   * @param {string} filterUsed
   */
  async function uploadCapture(dataUrl, filterUsed) {
    if (!PB.store.consentGiven) return; // never upload before the disclosure has been shown
    const sb = getClient();
    if (!sb) return;

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const path = `captures/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

      const { error: uploadError } = await sb.storage.from(BUCKET_NAME).upload(path, blob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { error: insertError } = await sb.from('captures').insert({ storage_path: path, filter_used: filterUsed });
      if (insertError) throw insertError;
    } catch (e) {
      console.warn('Capture log upload failed (non-fatal — the user\'s own save is unaffected):', e);
    }
  }

  return { uploadCapture };
})();
