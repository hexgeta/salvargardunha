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

  // Hide the page until the page's inline switcher has translated it (it runs before
  // DOMContentLoaded), so non-PT visitors never see the Portuguese markup flash first.
  try {
    var want = urlLang || localStorage.getItem('nf_lang');
    if (LANGS.indexOf(want) >= 0) {
      var st = document.createElement('style');
      st.textContent = 'html.i18n-wait body{visibility:hidden}';
      document.head.appendChild(st);
      var d = document.documentElement, show = function () { d.classList.remove('i18n-wait'); };
      d.classList.add('i18n-wait');
      document.addEventListener('DOMContentLoaded', show);
      setTimeout(show, 2000);
    }
  } catch (e) {}

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
