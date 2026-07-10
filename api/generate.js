// Serverless function (Vercel) — generates a UNIQUE Portuguese objection to the
// PSZAER inclusion of the Serra da Gardunha / Beira Baixa, via OpenAI gpt-mini.
// Each visitor gets a distinct text so no two submitted contributions are identical
// (identical mass copy-paste carries far less weight than individual objections).

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const SYSTEM = `És um assistente que ajuda cidadãos da Beira Baixa (Portugal) a escrever um contributo ÚNICO e sincero para a consulta pública do PSZAER (Programa Setorial das Zonas de Aceleração da Implantação de Energias Renováveis), opondo-se à inclusão da Serra da Gardunha e da Beira Baixa nas zonas de aceleração para megacentrais solares e eólicas.

Regras:
- Português de Portugal, na primeira pessoa, tom sincero e respeitoso (nunca agressivo nem robótico).
- 90 a 140 palavras, um ou dois parágrafos curtos.
- CADA texto tem de ser DIFERENTE: varia a estrutura, o vocabulário, a ordem e os argumentos. Nunca repitas frases feitas.
- Usa 2 a 3 destes argumentos (combina-os de forma variada): ausência de avaliação de impacte ambiental (AIA); impacte na paisagem protegida da serra; ocupação de solo agrícola e florestal; linhas de água e abastecimento; espécies ameaçadas (aves de rapina, cegonha-preta, morcegos, lince, lobo); proximidade a habitações; recusa de tratar o interior como território "sobrante"; preferência por telhados e áreas já artificializadas em vez da serra.
- Termina com um pedido claro: excluir a Serra da Gardunha / Beira Baixa das zonas de aceleração.
- Devolve APENAS o texto do contributo — sem título, sem aspas, sem notas.`;

const FALLBACK = 'Venho manifestar a minha oposição à inclusão da Serra da Gardunha e da Beira Baixa nas Zonas de Aceleração de Energias Renováveis do PSZAER. Oponho-me à instalação de megacentrais solares e eólicas nesta região sem avaliação de impacte ambiental, pelos impactes na paisagem protegida, na água, no solo agrícola e florestal e nas espécies ameaçadas. Peço a exclusão desta área do programa e que se privilegiem telhados e áreas já artificializadas em vez da serra.';

const ANGLES = ['a paisagem protegida', 'a água e o abastecimento', 'as espécies ameaçadas', 'a ausência de avaliação de impacte ambiental', 'o solo agrícola e florestal', 'a recusa do rótulo de território "sobrante"', 'telhados em vez da serra', 'a proximidade às habitações'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const key = process.env.OPENAI_API_KEY;
  if (!key) { res.status(200).json({ text: FALLBACK, source: 'fallback' }); return; }

  // pick a few random emphases to force variety across visitors
  const pick = [...ANGLES].sort(() => 0.5 - Math.random()).slice(0, 3).join('; ');

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 1.05,
        max_tokens: 340,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Escreve agora um contributo único e original. Dá especial ênfase a: ${pick}.` },
        ],
      }),
    });
    if (!r.ok) { res.status(200).json({ text: FALLBACK, source: 'fallback' }); return; }
    const j = await r.json();
    const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text || !text.trim()) { res.status(200).json({ text: FALLBACK, source: 'fallback' }); return; }
    res.status(200).json({ text: text.trim(), source: 'ai' });
  } catch (e) {
    res.status(200).json({ text: FALLBACK, source: 'fallback' });
  }
};
