// How much wider `100vw` is than the page, as `--scrollbar-width` on <html>.
//
// `100vw` counts the vertical scrollbar, and globals.css reserves that
// scrollbar's room on every page (`scrollbar-gutter: stable`). Where a
// scrollbar takes space (Windows, Linux; a Mac's floats over the page), a
// band `100vw` wide was that much wider than the page: half of it cut off
// on the left, half under the scrollbar, and the page itself that much
// wider than the window, so it could be nudged sideways. On CI's Linux
// browser the page slid 8px left as a listing opened (Nov 20). The
// `bleed-x` and `w-page` utilities in globals.css subtract this.
//
// Measured (a 100vw box against the root's width) rather than taken as
// innerWidth − clientWidth, so it stays right if a browser starts leaving
// the gutter out of `vw` itself.
//
// An inline script at the top of <body> (layout.tsx), so it has run before
// the bands are drawn: they never draw too wide first and then jump.
export const SCROLLBAR_WIDTH_SCRIPT = `(function(){
  var root = document.documentElement;
  // A <style> of its own, not root.style: React owns <html>'s style
  // attribute (the brand colour) and would see the extra property as a
  // mismatch.
  var sheet = document.createElement('style');
  document.head.appendChild(sheet);
  function set() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:0;left:0;width:100vw;height:0;visibility:hidden;pointer-events:none';
    root.appendChild(probe);
    var extra = probe.getBoundingClientRect().width - root.clientWidth;
    probe.remove();
    sheet.textContent = ':root{--scrollbar-width:' + Math.max(0, extra) + 'px}';
  }
  set();
  // Again whenever the root's width changes: zooming changes it (and a
  // scrollbar's width in CSS pixels) without the window resizing, as does a
  // scrollbar arriving where the gutter isn't held. The first call also
  // catches the stylesheets applying, which a script at the top of <body>
  // can run ahead of (it measured 0 there).
  if (window.ResizeObserver) new ResizeObserver(set).observe(root);
  else { document.addEventListener('DOMContentLoaded', set); addEventListener('resize', set); }
})();`
