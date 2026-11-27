/**
 * One phone-versus-desktop decision for the shell, Voyage Chief and Tank Chief.
 *
 * Touch chrome only when the viewport is narrower than 1366px and the primary
 * pointer is coarse (or the device is a phone/tablet WebView). Window height
 * is not an input. screen.width / screen.height are not an input: a 1920×1080
 * touch laptop used to match because its screen short side is 1080, and a
 * 1366×768 laptop used to match because its window height is 768.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.ChengNav = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var DESKTOP_MIN = 1366;

  function viewOf(view) {
    return view || root;
  }

  function coarsePointer(view) {
    var wdw = viewOf(view);
    try {
      return !!wdw.matchMedia('(hover: none) and (pointer: coarse)').matches;
    } catch (e) {
      return false;
    }
  }

  function nativePhone(view) {
    var wdw = viewOf(view);
    try {
      var cap = wdw.Capacitor;
      var plat = cap && cap.getPlatform ? String(cap.getPlatform()) : '';
      var native = !!(cap && (cap.isNativePlatform
        ? cap.isNativePlatform()
        : (plat && plat !== 'web')));
      var ua = (wdw.navigator && wdw.navigator.userAgent) || '';
      return native || plat === 'android' || plat === 'ios' || /Android|iPhone|iPad|iPod/i.test(ua);
    } catch (e) {
      return false;
    }
  }

  /** True when the touch bottom bar (or its short-landscape chip row) is used. */
  function wantsBottomNav(view) {
    var wdw = viewOf(view);
    var w = wdw.innerWidth || 0;
    if (!(w > 0 && w < DESKTOP_MIN)) return false;
    if (coarsePointer(wdw)) return true;
    /* Some WebViews report a fine pointer. The user-agent still requires a
       narrow viewport, so a desktop window is never classified by height. */
    return nativePhone(wdw);
  }

  /** Four swipe panes: phone portrait up to ~430px, and short landscape. */
  function wantsPhonePanes(view) {
    if (!wantsBottomNav(view)) return false;
    var wdw = viewOf(view);
    var w = wdw.innerWidth || 0;
    var h = wdw.innerHeight || 0;
    return w <= 430 || (h > 0 && h < 500);
  }

  /** Height picks chips instead of a bottom bar. It does not decide "phone". */
  function wantsShortLandscape(view) {
    if (!wantsBottomNav(view)) return false;
    var h = viewOf(view).innerHeight || 0;
    return h > 0 && h < 500;
  }

  function wantsNoonSteps(view) {
    if (!wantsBottomNav(view)) return false;
    var wdw = viewOf(view);
    var w = wdw.innerWidth || 0;
    var h = wdw.innerHeight || 0;
    return w < 700 && h >= w;
  }

  /** Cards below tablet landscape (~1100px). The grid returns from there up. */
  function wantsSoundingCards(view) {
    if (!wantsBottomNav(view)) return false;
    return (viewOf(view).innerWidth || 0) < 1100;
  }

  function apply(doc) {
    var document = doc || (root && root.document);
    if (!document || !document.documentElement) return;
    var html = document.documentElement;
    html.classList.toggle('use-bottom-nav', wantsBottomNav());
    html.classList.toggle('phone-panes', wantsPhonePanes());
    html.classList.toggle('short-landscape', wantsShortLandscape());
    html.classList.toggle('noon-steps', wantsNoonSteps());
    html.classList.toggle('sounding-cards', wantsSoundingCards());
    if (wantsBottomNav() && (coarsePointer() || nativePhone())) {
      html.classList.add('is-mobile-chrome');
    } else if (!wantsBottomNav()) {
      html.classList.remove('is-mobile-chrome');
    }
  }

  return {
    DESKTOP_MIN: DESKTOP_MIN,
    coarsePointer: coarsePointer,
    nativePhone: nativePhone,
    wantsBottomNav: wantsBottomNav,
    wantsPhonePanes: wantsPhonePanes,
    wantsShortLandscape: wantsShortLandscape,
    wantsNoonSteps: wantsNoonSteps,
    wantsSoundingCards: wantsSoundingCards,
    apply: apply,
  };
});
