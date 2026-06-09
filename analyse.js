const fetch = require('node-fetch');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function scrapeUrl(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      timeout: 10000,
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extraction simple sans cheerio : supprimer les tags HTML
    const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    const noStyles = noScripts.replace(/<style[\s\S]*?<\/style>/gi, '');
    const noTags = noStyles.replace(/<[^>]+>/g, ' ');
    const clean = noTags.replace(/\s+/g, ' ').trim().substring(0, 5000);

    return clean.length > 100 ? clean : null;
  } catch (e) {
    return null;
  }
}

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Clé API manquante — ajoutez ANTHROPIC_API_KEY dans les variables Vercel');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.map(b => b.text || '').join('');
}

function buildPrompt(content, sourceUrl) {
  return `Tu es un assistant expert en immobilier français. Voici le contenu d'une annonce immobilière${sourceUrl ? ' (source : ' + sourceUrl + ')' : ''} :

---
${content}
---

Extrais toutes les informations disponibles pour une analyse d'investissement locatif.
Réponds UNIQUEMENT avec un objet JSON valide, rien d'autre avant ni après, pas de backticks, pas d'explication :

{"nom":"nom court du bien ex T2 Lyon Part-Dieu","ville":"ville et quartier","prix":null,"surface":null,"loyer":null,"charges":null,"taxe":null,"travaux":0,"marche":null,"assurance":null,"lien":"${sourceUrl || ''}","confiance":"haute|moyenne|faible","note":"ce qui a été extrait vs estimé"}

Remplace null par des nombres entiers quand tu peux les extraire ou les estimer depuis le contexte (ville, type de bien, surface). Pour le loyer, estime-le si non indiqué (rendement locatif moyen de la ville). Pour le marché, estime le prix/m² moyen du secteur si tu connais la ville.`;
}

// Extrait le premier objet JSON valide trouvé dans une chaîne
function extractJson(text) {
  // Essai direct
  try { return JSON.parse(text.trim()); } catch(e) {}

  // Chercher entre accolades
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.substring(start, end + 1)); } catch(e) {}
  }

  // Supprimer les backticks markdown
  const clean = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch(e) {}

  throw new Error('Impossible de parser la réponse IA');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { url, text } = req.body || {};
  if (!url && !text) return res.status(400).json({ error: 'URL ou texte requis' });

  try {
    let content = '';
    const sourceUrl = (url || '').trim();

    if (sourceUrl) {
      const scraped = await scrapeUrl(sourceUrl);
      if (scraped) {
        content = scraped;
      } else {
        // Scraping bloqué : on donne juste l'URL à Claude pour qu'il infère
        content = `URL de l'annonce : ${sourceUrl}\n(Le contenu de la page n'a pas pu être extrait. Utilise l'URL pour déduire le site, la ville, et estime les valeurs typiques pour ce type de bien.)`;
      }
    }

    if (text && text.trim()) {
      content = text.trim() + (content ? '\n\n---\n\n' + content : '');
    }

    if (!content) return res.status(400).json({ error: 'Contenu vide' });

    const raw = await callClaude(buildPrompt(content.substring(0, 5000), sourceUrl));
    const parsed = extractJson(raw);

    return res.status(200).json(parsed);
  } catch (e) {
    console.error('Erreur:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
