export const PATCH_VERSION = '0.1.0';

/**
 * Patch P-1: enter inserts newline instead of submitting.
 *
 * Symptom: on some mobile browsers the Enter key submits the composer instead
 * of inserting a newline on the official remote console. The console treats a
 * viewport as "mobile text input" only when this exact media query matches:
 *   (max-width: 767px) and (hover: none) and (pointer: coarse)
 * Browsers that mis-report hover/pointer (or run in desktop mode, or have an
 * external mouse attached) fail the query, which turns Enter into Submit.
 *
 * Patch: wrap window.matchMedia so that EXACT query string reports
 * matches=true. The wrapper only affects this precise query string, so the
 * blast radius is limited to the mobile-viewport check. Side benefit: with
 * the submit shortcut disabled, IME composition Enter (compositionend-before-
 * keydown edge) can no longer accidentally submit either.
 *
 * Probes (self-retiring):
 *  - if the environment already reports the query as matching -> patch inactive;
 *  - any thrown error -> patch aborts silently (never break the page).
 */
export const MATCHMEDIA_PATCH_SOURCE = String.raw`(function () {
  'use strict';
  var FLAG = '__zshellPatchApplied';
  var TARGET_QUERY = '(max-width: 767px) and (hover: none) and (pointer: coarse)';
  try {
    if (typeof window === 'undefined' || window[FLAG]) { return; }
    var nativeMatchMedia = window.matchMedia;
    if (typeof nativeMatchMedia !== 'function') { return; }
    if (nativeMatchMedia.call(window, TARGET_QUERY).matches) {
      window[FLAG] = 'probe:no-op';
      return;
    }
    function ShimMediaQueryList(media, matches) {
      this.media = media;
      this.matches = matches;
      this.onchange = null;
    }
    ShimMediaQueryList.prototype.addListener = function () {};
    ShimMediaQueryList.prototype.removeListener = function () {};
    ShimMediaQueryList.prototype.addEventListener = function () {};
    ShimMediaQueryList.prototype.removeEventListener = function () {};
    ShimMediaQueryList.prototype.dispatchEvent = function () { return false; };
    window.matchMedia = function (query) {
      if (query === TARGET_QUERY) {
        return new ShimMediaQueryList(TARGET_QUERY, true);
      }
      return nativeMatchMedia.call(window, query);
    };
    window[FLAG] = 'matchmedia:v1';
  } catch (e) { /* patches must never break the page */ }
})();`;

/**
 * Full document-start payload for the WebView host.
 * Each entry is self-guarding; combine defensively.
 */
export function buildPatchSource(): string {
  return MATCHMEDIA_PATCH_SOURCE;
}
