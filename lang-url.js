// Shared language<->URL glue for the sub-pages (index.html has its own copy of this logic).
// Loaded synchronously in <head>, BEFORE each page's inline language switcher runs, so that
// a direct hit on /en/<page> seeds nf_lang=en and the inline switcher initialises to English.
// Also rewrites the address bar when the visitor toggles language, so shares reflect the choice.
(function () {
  var LANGS = ['en', 'de', 'fr'];
  var segs = location.pathname.split('/').filter(Boolean);
  var urlLang = (LANGS.indexOf(segs[0]) >= 0) ? segs[0] : null;
  var base = '/' + (urlLang ? segs.slice(1) : segs).join('/'); // path without the locale prefix

  // A /en/<page> (or /de, /fr) URL wins over any stored preference.
  if (urlLang) { try { localStorage.setItem('nf_lang', urlLang); } catch (e) {} }

  // Keep the URL in sync when the visitor clicks the PT/EN/DE/FR toggle.
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('#langsw button') : null;
    if (!b) return;
    var l = b.getAttribute('data-lang') || b.getAttribute('data-l');
    if (!l) return;
    var np = (l === 'pt') ? base : ('/' + l + (base === '/' ? '' : base));
    try { history.replaceState(null, '', np + location.hash); } catch (_) {}
  });
})();
