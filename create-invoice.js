const fetch = require('node-fetch');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { plan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'Plan requis' });

  const plans = {
    monthly: { amount: 9.99, unit: 'EUR', title: 'BienScore — Accès mensuel' },
  };
  const selected = plans[plan];
  if (!selected) return res.status(400).json({ error: 'Plan invalide' });

  const appUrl = process.env.APP_URL || 'https://bienscore.vercel.app';
  const sbpKey = process.env.SWISS_BITCOIN_PAY_KEY;

  try {
    if (!sbpKey) throw new Error('SWISS_BITCOIN_PAY_KEY manquant dans les variables Vercel');

    const body = {
      amount: selected.amount,
      unit: selected.unit,
      title: selected.title,
      onChain: true,
      delay: 30,
      redirectAfterPaid: appUrl + '?payment=success',
      extra: { plan },
    };

    const r = await fetch('https://api.swiss-bitcoin-pay.ch/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': sbpKey,
      },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch(e) { throw new Error('Réponse inattendue SBP: ' + text.substring(0, 200)); }

    if (!r.ok) throw new Error(data.message || JSON.stringify(data));

    return res.status(200).json({
      provider: 'sbp',
      invoiceId: data.id,
      checkoutUrl: data.checkoutUrl,
      amount: selected.amount,
      unit: selected.unit,
    });
  } catch (e) {
    console.error('create-invoice error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
