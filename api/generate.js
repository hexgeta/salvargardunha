// Serverless function (Vercel) — generates a UNIQUE objection to the PSZAER
// inclusion of the Serra da Gardunha / Beira Baixa, via OpenAI gpt-mini, in the
// language selected on the page (pt | en | de | fr). Each visitor gets a distinct text.

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const LANG_NAME = { pt: 'português de Portugal', en: 'English', de: 'Deutsch', fr: 'français' };

const FALLBACK = {
  pt: 'Venho manifestar a minha oposição à inclusão da Serra da Gardunha e da Beira Baixa nas Zonas de Aceleração de Energias Renováveis do PSZAER. Oponho-me à instalação de megacentrais solares e eólicas nesta região sem avaliação de impacte ambiental, pelos impactes na paisagem protegida, na água, no solo agrícola e florestal e nas espécies ameaçadas. Peço a exclusão desta área do programa.',
  de: 'Hiermit erhebe ich Einspruch gegen die Aufnahme der Serra da Gardunha und der Beira Baixa in die Beschleunigungszonen für erneuerbare Energien des PSZAER. Ich lehne den Bau von Solar- und Windgroßkraftwerken in dieser Region ohne Umweltverträglichkeitsprüfung ab — wegen der Auswirkungen auf die geschützte Landschaft, das Wasser, den land- und forstwirtschaftlichen Boden und die bedrohten Arten. Ich fordere den Ausschluss dieses Gebiets aus dem Programm.',
  fr: 'Je manifeste mon opposition à l’inclusion de la Serra da Gardunha et de la Beira Baixa dans les zones d’accélération des énergies renouvelables du PSZAER. Je m’oppose à l’installation de méga-centrales solaires et éoliennes dans cette région sans évaluation d’impact environnemental, en raison des impacts sur le paysage protégé, l’eau, les sols agricoles et forestiers et les espèces menacées. Je demande l’exclusion de cette zone du programme.',
  en: 'I wish to express my opposition to the inclusion of the Serra da Gardunha and the Beira Baixa in the PSZAER renewable-energy acceleration zones. I oppose the installation of mega solar and wind power plants in this region without an environmental impact assessment, given the impacts on the protected landscape, water, agricultural and forest land, and threatened species. I ask that this area be excluded from the programme.',
};

const ANGLES = ['the protected mountain landscape', 'water courses and supply', 'threatened species', 'the absence of an environmental impact assessment', 'agricultural and forest land', 'refusing the "leftover land" framing', 'rooftops instead of the mountain', 'proximity to homes'];

function systemPrompt(langName) {
  return `You help citizens write a UNIQUE, sincere contribution to Portugal's public consultation "PSZAER" (renewable-energy acceleration zones), OPPOSING the inclusion of the Serra da Gardunha / Beira Baixa region as zones for large solar and wind power plants.

Write the entire contribution in ${langName}.

Rules:
- First person, sincere and respectful tone (never aggressive or robotic).
- 90 to 140 words, one or two short paragraphs.
- Each text MUST be different: vary structure, vocabulary, order and emphasis. Never reuse stock phrases.
- Use 2-3 of these arguments, combined in varied ways: no environmental impact assessment (AIA/EIA); impact on the protected mountain landscape; loss of agricultural and forest land; water courses and supply; threatened species (birds of prey, black stork, bats, Iberian lynx, Iberian wolf); proximity to homes; refusing to treat the interior as "leftover" land; preferring rooftops and already-built-up areas instead of the mountain.
- End with a clear request: exclude the Serra da Gardunha / Beira Baixa from the acceleration zones.
- Keep the proper names "Serra da Gardunha", "Beira Baixa" and "PSZAER" as they are.
- Return ONLY the contribution text — no title, no quotes, no notes.`;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let lang = (req.body && req.body.lang) || 'pt';
  if (!LANG_NAME[lang]) lang = 'pt';

  const key = process.env.OPENAI_API_KEY;
  if (!key) { res.status(200).json({ text: FALLBACK[lang], source: 'fallback' }); return; }

  const pick = [...ANGLES].sort(() => 0.5 - Math.random()).slice(0, 3).join('; ');

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
          { role: 'user', content: `Write a unique, original contribution now, in ${LANG_NAME[lang]}. Give special emphasis to: ${pick}.` },
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
