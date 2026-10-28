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
 * Patch P-2: relay WebSocket observer.
 *
 * The official console page owns its relay WebSocket. This patch wraps the
 * WebSocket constructor (document-start, before page scripts run) and
 * passively reports connection lifecycle + interesting payload signals to
 * the host app via the WebView message bridge:
 *   ws-open / ws-connected / ws-closed / ws-error  — connection lifecycle
 *   pair-status {waiting|matched}                  — desktop pairing state
 *   kicked                                         — another terminal took over
 *   approval-waiting                               — permission/elicitation request seen
 *   network-online / network-offline               — device connectivity
 *
 * It only reads traffic the page already receives; it never sends anything.
 * Fully self-guarding: any error aborts without touching page behavior.
 */
export const WS_OBSERVER_PATCH_SOURCE = String.raw`(function () {
  'use strict';
  var FLAG = '__zshellWsObserver';
  try {
    if (typeof window === 'undefined' || window[FLAG]) { return; }
    var NativeWS = window.WebSocket;
    if (typeof NativeWS !== 'function') { return; }
    var post = function (type, detail) {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            source: 'zshell', type: type, detail: detail || null
          }));
        }
      } catch (e) { /* never break the page */ }
    };
    // Signals must come from actual JSON frames: chat text that merely
    // contains a word like KICKED must never flip the console status.
    function isJsonObject(data) {
      if (typeof data !== 'string' || data.length === 0) { return false; }
      try {
        var parsed = JSON.parse(data);
        return typeof parsed === 'object' && parsed !== null;
      } catch (e) { return false; }
    }
    function signalFromMessage(data) {
      try {
        if (!isJsonObject(data)) { return; }
        if (data.indexOf('"KICKED"') !== -1) {
          post('kicked', {});
          return;
        }
        var m = /"pair_status"\s*:\s*"([^"]+)"/.exec(data);
        if (m) { post('pair-status', { status: m[1] }); }
        if (data.indexOf('"permission_request"') !== -1 ||
            data.indexOf('"elicitation_request"') !== -1) {
          post('approval-waiting', {});
        }
      } catch (e) { /* ignore malformed frames */ }
    }
    function WrappedWS(url, protocols) {
      var ws = (protocols === undefined)
        ? new NativeWS(url)
        : new NativeWS(url, protocols);
      // Relay candidates: ZCode relay sockets carry /ws in the path; Kimi Code
      // remote-control pages tunnel through wss://code-rc.kimi.com|ai hosts.
      // Read-only observer — widening the match has no page-visible effect.
      var isRelay = typeof url === 'string' &&
        (url.indexOf('/ws') !== -1 ||
          /^wss?:\/\/code-rc\.kimi\.(com|ai)\//i.test(url));
      if (isRelay) {
        post('ws-open', {});
        ws.addEventListener('open', function () { post('ws-connected', {}); });
        ws.addEventListener('close', function (ev) {
          post('ws-closed', { code: ev.code });
        });
        ws.addEventListener('error', function () { post('ws-error', {}); });
        ws.addEventListener('message', function (ev) {
          signalFromMessage(ev.data);
        });
      }
      return ws;
    }
    try {
      WrappedWS.prototype = NativeWS.prototype;
      WrappedWS.CONNECTING = NativeWS.CONNECTING;
      WrappedWS.OPEN = NativeWS.OPEN;
      WrappedWS.CLOSING = NativeWS.CLOSING;
      WrappedWS.CLOSED = NativeWS.CLOSED;
    } catch (e) { /* constants are best-effort */ }
    window.WebSocket = WrappedWS;
    window[FLAG] = 'ws-observer:v2';
    window.addEventListener('online', function () { post('network-online', {}); });
    window.addEventListener('offline', function () { post('network-offline', {}); });
  } catch (e) { /* patches must never break the page */ }
})();`;

/**
 * Patch P-3: polyfill AbortSignal.any for older WebView runtimes.
 *
 * Observed: the Kimi Code login page's OAuth transport composes request
 * timeouts with AbortSignal.any(), which shipped in Chrome 116. Emulators
 * and containers often carry a frozen older system WebView (e.g. Chrome
 * 110 without store updates), where that call throws synchronously and the
 * login start dies with a generic "check your connection" error before any
 * request leaves the page.
 *
 * Patch: standard-semantics polyfill — the composite signal aborts with the
 * reason of the first aborted input. Probes (self-retiring):
 *  - AbortSignal.any already present (native or prior polyfill) -> no-op;
 *  - any thrown error -> patch aborts silently (never break the page).
 */
export const ABORT_SIGNAL_PATCH_SOURCE = String.raw`(function () {
  'use strict';
  var FLAG = '__zshellAbortAny';
  try {
    if (typeof window === 'undefined' || typeof AbortSignal === 'undefined') { return; }
    if (typeof AbortSignal.any === 'function' || window[FLAG]) { return; }
    AbortSignal.any = function (signals) {
      var controller = new AbortController();
      for (var i = 0; i < signals.length; i++) {
        (function (s) {
          if (s == null || typeof s.addEventListener !== 'function') { return; }
          if (s.aborted) { controller.abort(s.reason); return; }
          s.addEventListener('abort', function () { controller.abort(s.reason); }, { once: true });
        })(signals[i]);
      }
      return controller.signal;
    };
    window[FLAG] = 'abort-any:v1';
  } catch (e) { /* patches must never break the page */ }
})();`;

/**
 * Full document-start payload for the WebView host.
 * Each entry is self-guarding; combine defensively.
 */
/**
 * Patch P-4: polyfill Promise.withResolvers for older WebView runtimes.
 *
 * Observed: the DSH web console's session controller ("control stream") and
 * several dependent modules (model settings, onboarding slots) build their
 * first promise with Promise.withResolvers(), which shipped in Chrome 119.
 * Emulators, containers and unupdated OEM system WebViews often carry an
 * older frozen engine (observed: Chrome 110 on MuMu/Android 15), where the
 * call throws synchronously — the workspace picker stays empty and
 * conversations never open even though every RPC on the wire succeeds.
 *
 * Patch: standard-semantics polyfill (per the TC39 proposal). Probes
 * (self-retiring):
 *  - Promise.withResolvers already present (native or prior polyfill) -> no-op;
 *  - any thrown error -> patch aborts silently (never break the page).
 */
export const PROMISE_WITHRESOLVERS_PATCH_SOURCE = String.raw`(function () {
  'use strict';
  var FLAG = '__zshellPromiseWithResolvers';
  try {
    if (typeof window === 'undefined' || typeof Promise === 'undefined') { return; }
    if (typeof Promise.withResolvers === 'function' || window[FLAG]) { return; }
    Promise.withResolvers = function () {
      var out = {};
      out.promise = new Promise(function (resolve, reject) {
        out.resolve = resolve;
        out.reject = reject;
      });
      return out;
    };
    window[FLAG] = 'promise-withresolvers:v1';
  } catch (e) { /* patches must never break the page */ }
})();`;

export function buildPatchSource(): string {
  return (
    MATCHMEDIA_PATCH_SOURCE +
    '\n' +
    WS_OBSERVER_PATCH_SOURCE +
    '\n' +
    ABORT_SIGNAL_PATCH_SOURCE +
    '\n' +
    PROMISE_WITHRESOLVERS_PATCH_SOURCE
  );
}
