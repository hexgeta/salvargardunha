// Serverless function (Vercel) — generates a UNIQUE objection to the reformulated
// Sophia solar plant (+ its 400 kV line), for the participa.pt consultation of
// 8–21 Oct 2026, via OpenAI gpt-mini, in the language selected on the page
// (pt | en | de | fr). Each visitor gets a distinct text.

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const LANG_NAME = { pt: 'português de Portugal', en: 'English', de: 'Deutsch', fr: 'français' };

const FALLBACK = {
  pt: 'Venho manifestar a minha discordância com o projeto reformulado da Central Solar Fotovoltaica de Sophia e da LMAT associada. Mesmo reduzido, continua a ser uma central de 573 MWp com 1 177 hectares vedados em Idanha-a-Nova e Penamacor e uma linha de 400 kV a atravessar o Fundão. A Comissão de Avaliação reconheceu impactes de grande magnitude, em vários casos permanentes e irreversíveis, na paisagem, nos solos, no ordenamento do território e na socioeconomia — e a reformulação não os elimina. Peço a emissão de uma Declaração de Impacte Ambiental desfavorável.',
  de: 'Hiermit erhebe ich Einspruch gegen das überarbeitete Projekt des Photovoltaik-Solarkraftwerks Sophia und der zugehörigen Höchstspannungsleitung (LMAT). Auch verkleinert bleibt es ein Kraftwerk mit 573 MWp und 1 177 eingezäunten Hektar in Idanha-a-Nova und Penamacor sowie einer 400-kV-Leitung quer durch Fundão. Die Bewertungskommission hat Auswirkungen von großem Ausmaß festgestellt, in mehreren Fällen dauerhaft und irreversibel, auf Landschaft, Böden, Raumordnung und Sozioökonomie — die Überarbeitung beseitigt sie nicht. Ich fordere eine ablehnende Umweltverträglichkeitserklärung (DIA).',
  fr: 'Je manifeste mon désaccord avec le projet reformulé de la centrale solaire photovoltaïque de Sophia et de la ligne très haute tension (LMAT) associée. Même réduit, il reste une centrale de 573 MWc avec 1 177 hectares clôturés à Idanha-a-Nova et Penamacor et une ligne de 400 kV traversant Fundão. La Commission d’évaluation a reconnu des impacts de grande ampleur, dans plusieurs cas permanents et irréversibles, sur le paysage, les sols, l’aménagement du territoire et la socio-économie — la reformulation ne les supprime pas. Je demande l’émission d’une Déclaration d’impact environnemental défavorable.',
  en: 'I wish to state my disagreement with the reformulated Sophia Photovoltaic Solar Plant project and its associated very-high-voltage line (LMAT). Even reduced, it is still a 573 MWp plant with 1,177 fenced hectares in Idanha-a-Nova and Penamacor and a 400 kV line crossing Fundão. The Assessment Commission recognised impacts of great magnitude, in several cases permanent and irreversible, on the landscape, soils, spatial planning and the socio-economy — and the reformulation does not remove them. I ask for an unfavourable Environmental Impact Declaration (DIA).',
};

const ANGLES = ['the industrial scale that the reformulation keeps (573 MWp, 1,177 fenced ha)', 'the 400 kV very-high-voltage line across Fundão', 'the Assessment Commission’s unfavourable opinion on the original project', 'the rural landscape of the Beira Baixa', 'farmland and the rural economy', 'tourism and heritage (historic villages, Naturtejo Geopark)', 'wildfire risk and battery storage', 'the record 12,693 participations in the first consultation'];

function systemPrompt(langName) {
  return `You help citizens write a UNIQUE, sincere contribution to a Portuguese public consultation (participa.pt, 8–21 October 2026) on the REFORMULATED "Central Solar Fotovoltaica de Sophia e LMAT associadas", OPPOSING the project.

Write the entire contribution in ${langName}.

Verified facts you may use (do not invent others):
- Reformulated project: 573 MWp (down from 867 MWp), 1,177 fenced hectares in 22 fenced blocks (down from 1,737 ha), 250 ha of panels, a battery storage system (BESS) and a substation, in the municipalities of Idanha-a-Nova and Penamacor (Castelo Branco district).
- One 400 kV very-high-voltage line (LMAT) carries the power to the Fundão substation, crossing the municipality of Fundão.
- The Assessment Commission gave the original project an unfavourable opinion, finding impacts "of great magnitude and, in several cases, permanent and irreversible" on the landscape, soils, spatial planning and the socio-economy. The reformulation is the developer's response under article 16 of the EIA regime.
- The first public consultation (Oct–Nov 2025) had 12,693 participations — the most participated ever.
- The new consultation lasts only 10 working days.

Rules:
- First person, sincere and respectful tone (never aggressive or robotic).
- 90 to 140 words, one or two short paragraphs.
- Each text MUST be different: vary structure, vocabulary, order and emphasis. Never reuse stock phrases.
- Use 2-3 arguments, combined in varied ways. If the citizen chose specific concerns, prioritise those.
- Make clear that a smaller version does not resolve the impacts that led to the unfavourable opinion.
- End with a clear request: an unfavourable Environmental Impact Declaration (DIA desfavorável) / rejection of the project.
- Keep the proper names "Sophia", "Fundão", "Idanha-a-Nova", "Penamacor", "Beira Baixa", "LMAT" and "DIA" as they are.
- Return ONLY the contribution text — no title, no quotes, no notes.`;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let lang = (req.body && req.body.lang) || 'pt';
  if (!LANG_NAME[lang]) lang = 'pt';

  const key = process.env.OPENAI_API_KEY;
  if (!key) { res.status(200).json({ text: FALLBACK[lang], source: 'fallback' }); return; }

  // Optional: specific concerns the visitor picked as chips on the page.
  const chosen = (req.body && Array.isArray(req.body.topics))
    ? req.body.topics.filter((t) => typeof t === 'string' && t.trim()).slice(0, 4)
    : [];

  const userMsg = chosen.length
    ? `Write a unique, original contribution now, in ${LANG_NAME[lang]}. The citizen specifically chose these concerns — build the contribution around them, giving them clear priority: ${chosen.join('; ')}. You may add one supporting argument if it flows naturally.`
    : `Write a unique, original contribution now, in ${LANG_NAME[lang]}. Give special emphasis to: ${[...ANGLES].sort(() => 0.5 - Math.random()).slice(0, 3).join('; ')}.`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 1.05,
        max_tokens: 380,
        messages: [
          { role: 'system', content: systemPrompt(LANG_NAME[lang]) },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!r.ok) { res.status(200).json({ text: FALLBACK[lang], source: 'fallback' }); return; }
    const j = await r.json();
    const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text || !text.trim()) { res.status(200).json({ text: FALLBACK[lang], source: 'fallback' }); return; }
    res.status(200).json({ text: text.trim(), source: 'ai' });
  } catch (e) {
    res.status(200).json({ text: FALLBACK[lang], source: 'fallback' });
  }
};
