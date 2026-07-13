// Serves index.html for /en /de /fr with language-specific OG/meta tags.
// Social crawlers don't execute JS, so the share image/title must be swapped server-side.
const fs = require('fs');
const path = require('path');

const META = {
  en: {
    title: 'The Serra da Gardunha is not for sale',
    desc: 'Large-scale solar and wind farms threaten to ruin our countryside — fast-tracked, with no environmental impact assessment. The public consultation closes on 15 July 2026. Object now.',
    img: 'https://salvargardunha.com/img/og-en.jpg',
    url: 'https://salvargardunha.com/en'
  },
  de: {
    title: 'Die Serra da Gardunha ist nicht käuflich',
    desc: 'Solar- und Windparks im großen Maßstab drohen unsere Landschaft zu ruinieren — im Schnellverfahren, ohne Umweltverträglichkeitsprüfung. Die öffentliche Konsultation endet am 15. Juli 2026. Jetzt Einspruch erheben.',
    img: 'https://salvargardunha.com/img/og-de.jpg',
    url: 'https://salvargardunha.com/de'
  },
  fr: {
    title: 'La Serra da Gardunha n’est pas à vendre',
    desc: 'Des centrales solaires et éoliennes à grande échelle menacent de défigurer nos paysages — à la hâte, sans évaluation d’impact environnemental. La consultation publique se termine le 15 juillet 2026. Objectez maintenant.',
    img: 'https://salvargardunha.com/img/og-fr.jpg',
    url: 'https://salvargardunha.com/fr'
  }
};

module.exports = (req, res) => {
  const lang = String(req.query.lang || 'en');
  const m = META[lang] || META.en;
  let html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  html = html
    .replace('<html lang="pt">', '<html lang="' + lang + '">')
    .replace(/(<title>)[^<]*(<\/title>)/, '$1' + m.title + '$2')
    .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + m.desc + '$2')
    .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + m.title + '$2')
    .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + m.desc + '$2')
    .replace(/(<meta property="og:image" content=")[^"]*(")/, '$1' + m.img + '$2')
    .replace(/(<meta property="og:url" content=")[^"]*(")/, '$1' + m.url + '$2')
    .replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + m.url + '$2');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(html);
};
