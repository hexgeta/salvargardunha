// Serves any translated page for /en, /de, /fr (and /en/<page> etc.) with the correct
// <html lang>, self-referencing canonical and hreflang alternates — because social crawlers
// and search bots don't execute the client-side i18n. The visible strings are still swapped
// client-side; here we only fix the crawler-visible <head> (+ full OG meta for the home page).
const fs = require('fs');
const path = require('path');

const SITE = 'https://salvargardunha.com';
const LANGS = ['en', 'de', 'fr'];
const ALL = ['pt', 'en', 'de', 'fr'];

// Root pages that have client-side translations.
const ROOT = new Set(['sobre', 'analise-pareceres', 'objecoes', 'mapa', 'social', 'nao-responderam']);

// Resolve a URL slug to a file on disk, or null if it isn't a known translated page.
// Covers the home page, the root campaign pages, and the /read/ document section.
function resolveFile(page) {
  if (page === 'index') return 'index.html';
  if (ROOT.has(page)) return page + '.html';
  if (page === 'read') return 'read/index.html';
  if (/^read\/[a-z0-9-]+$/.test(page)) return page + '.html';
  return null;
}

// Full share/meta for the home page (the most-shared surface).
const HOME_META = {
  en: {
    title: 'The Serra da Gardunha is not for sale',
    desc: 'Large-scale solar and wind farms threaten to ruin our countryside — fast-tracked, with no environmental impact assessment. The public consultation closes on 15 July 2026. Object now.',
    img: SITE + '/img/og-en.jpg'
  },
  de: {
    title: 'Die Serra da Gardunha ist nicht käuflich',
    desc: 'Solar- und Windparks im großen Maßstab drohen unsere Landschaft zu ruinieren — im Schnellverfahren, ohne Umweltverträglichkeitsprüfung. Die öffentliche Konsultation endet am 15. Juli 2026. Jetzt Einspruch erheben.',
    img: SITE + '/img/og-de.jpg'
  },
  fr: {
    title: 'La Serra da Gardunha n’est pas à vendre',
    desc: 'Des centrales solaires et éoliennes à grande échelle menacent de défigurer nos paysages — à la hâte, sans évaluation d’impact environnemental. La consultation publique se termine le 15 juillet 2026. Objectez maintenant.',
    img: SITE + '/img/og-fr.jpg'
  }
};

function langPath(page, lang) {
  const basep = (page === 'index') ? '' : '/' + page;
  if (lang === 'pt') return basep || '/';
  return '/' + lang + basep;
}

module.exports = (req, res) => {
  let lang = String(req.query.lang || 'en');
  if (LANGS.indexOf(lang) < 0) lang = 'en';
  const page = (String(req.query.page || 'index').replace(/^\/+|\/+$/g, '')) || 'index';

  // Unknown / untranslated slug: send crawlers and users to the Portuguese version.
  const file = resolveFile(page);
  if (!file) {
    // Unknown / untranslated slug: send crawlers and users to the Portuguese version.
    res.statusCode = 308;
    res.setHeader('Location', langPath(page, 'pt'));
    res.end();
    return;
  }

  let html;
  try {
    html = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  } catch (e) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const selfUrl = SITE + langPath(page, lang);

  html = html.replace(/<html lang="[^"]*">/, '<html lang="' + lang + '">');

  if (/<link rel="canonical"/.test(html)) {
    html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + selfUrl + '$2');
    // Inject hreflang alternates once (skip if the static file already declares them).
    if (html.indexOf('hreflang') < 0) {
      let alts = ALL.map(function (l) {
        return '<link rel="alternate" hreflang="' + (l === 'pt' ? 'pt-PT' : l) + '" href="' + SITE + langPath(page, l) + '">';
      }).join('');
      alts += '<link rel="alternate" hreflang="x-default" href="' + SITE + langPath(page, 'pt') + '">';
      html = html.replace(/(<link rel="canonical"[^>]*>)/, '$1' + alts);
    }
  }

  if (page === 'index') {
    const m = HOME_META[lang] || HOME_META.en;
    html = html
      .replace(/(<title>)[^<]*(<\/title>)/, '$1' + m.title + '$2')
      .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + m.desc + '$2')
      .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + m.title + '$2')
      .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + m.desc + '$2')
      .replace(/(<meta property="og:image" content=")[^"]*(")/, '$1' + m.img + '$2')
      .replace(/(<meta property="og:url" content=")[^"]*(")/, '$1' + selfUrl + '$2');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(html);
};
