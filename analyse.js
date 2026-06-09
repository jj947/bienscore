const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Headers CORS pour autoriser le frontend
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
        'Cache-Control': 'no-cache',
      },
      timeout: 10000,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    // Supprimer scripts, styles, nav, footer
    $('script, style, nav, footer, header, iframe, noscript, [class*="cookie"], [class*="banner"], [id*="cookie"]').remove();

    // Extraire le texte principal
    let text = '';

    // Titre de la page
    const title = $('title').text().trim();
    if (title) text += 'TITRE: ' + title + '\n\n';

    // Méta description
    const metaDesc = $('meta[name="description"]').attr('content');
    if (metaDesc) text += 'DESCRIPTION: ' + metaDesc + '\n\n';

    // Contenu principal (essayer plusieurs sélecteurs courants)
    const selectors = [
      'main', 'article', '[class*="description"]', '[class*="annonce"]',
      '[class*="detail"]', '[class*="listing"]', '[data-qa-id]',
      '.classified', '#classified', '[class*="property"]', '[class*="bien"]'
    ];

    let mainContent = '';
    for (const sel of selectors) {
      const found = $(sel).text().trim();
      if (found && found.length > mainContent.length) {
        mainContent = found;
      }
    }

    // Fallback: body complet nettoyé
    if (!mainContent || mainContent.length < 100) {
      mainContent = $('body').text();
    }

    // Nettoyer whitespace
    mainContent = mainContent.replace(/\s+/g, ' ').trim().substring(0, 4000);
    text += mainContent;

    return text;
  } catch (e) {
    return null;
  }
}

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Clé API manquante');

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
  return `Tu es un assistant expert en immobilier français. Voici le contenu d'une annonce immobilière${sourceUrl ? ' (URL: ' + sourceUrl + ')' : ''} :

---
${content}
---

Extrait toutes les informations disponibles pour une analyse d'investissement locatif. 
Réponds UNIQUEMENT en JSON valide, sans markdown, sans explication, sans backticks :

{
  "nom": "nom court descriptif du bien (ex: T2 Lyon Guillotière 45m²)",
  "ville": "ville et quartier si disponible",
  "prix": null ou nombre entier en euros,
  "surface": null ou nombre entier en m²,
  "loyer": null ou nombre entier (loyer mensuel HC estimé ou indiqué),
  "charges": null ou nombre entier (charges copropriété mensuelles),
  "taxe": null ou nombre entier (taxe foncière annuelle estimée),
  "travaux": 0 ou nombre entier estimé,
  "marche": null ou nombre entier (prix/m² moyen du secteur que tu estimes),
  "assurance": null ou nombre entier (assurance PNO annuelle estimée),
  "nb_pieces": null ou nombre entier,
  "type_bien": "appartement|maison|studio|autre",
  "confiance": "haute|moyenne|faible",
  "note": "courte explication de ce qui a été extrait et de ce qui a été estimé"
}

Pour les valeurs non présentes dans l'annonce, estime-les intelligemment selon la ville et le type de bien (loyer moyen du secteur, taxe foncière typique, etc.). Indique dans "note" ce qui est extrait vs estimé.`;
}

module.exports = async function handler(req, res) {
  setCors(res);

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { url, text } = req.body || {};

  if (!url && !text) {
    return res.status(400).json({ error: 'URL ou texte requis' });
  }

  try {
    let content = '';
    let sourceUrl = url || '';

    if (url && url.trim()) {
      // Tenter de scraper l'URL côté serveur
      const scraped = await scrapeUrl(url.trim());
      if (scraped && scraped.length > 50) {
        content = scraped;
      } else {
        // Le scraping a échoué (site anti-bot), utiliser l'URL comme indice uniquement
        content = `URL de l'annonce : ${url}\n\nLe contenu de la page n'a pas pu être extrait (protection anti-bot). Utilise l'URL pour déduire le site (leboncoin, seloger, pap, etc.) et extraire ce que tu peux.`;
      }
    }

    // Si texte fourni en plus (ou à la place), l'ajouter
    if (text && text.trim()) {
      content = text.trim() + (content ? '\n\n---\n\n' + content : '');
    }

    if (!content) {
      return res.status(400).json({ error: 'Impossible d\'extraire le contenu' });
    }

    const prompt = buildPrompt(content.substring(0, 5000), sourceUrl);
    const raw = await callClaude(prompt);

    // Parser le JSON retourné
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Ajouter le lien source
    if (sourceUrl) parsed.lien = sourceUrl;

    return res.status(200).json(parsed);
  } catch (e) {
    console.error('Erreur analyse:', e.message);
    return res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
};
