const fetch = require('node-fetch');
const crypto = require('crypto');

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'bienscore_secret_change_me';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function generateAccessToken(invoiceId, plan) {
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${invoiceId}:${plan}:${expiry}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ invoiceId, plan, expiry, sig })).toString('base64');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { invoiceId } = req.body || {};
  if (!invoiceId) return res.status(400).json({ error: 'invoiceId requis' });

  try {
    // GET /checkout/{id} — pas besoin de clé API pour lire
    const r = await fetch(`https://api.swiss-bitcoin-pay.ch/checkout/${invoiceId}`);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch(e) { throw new Error('Réponse inattendue: ' + text.substring(0, 200)); }

    if (!r.ok) throw new Error(data.message || JSON.stringify(data));

    const paid = data.isPaid === true;
    const plan = data.extra?.plan || 'monthly';

    if (paid) {
      const token = generateAccessToken(invoiceId, plan);
      return res.status(200).json({ paid: true, token, status: data.status });
    }

    const expired = data.isExpired === true;
    return res.status(200).json({
      paid: false,
      status: expired ? 'Expired' : (data.isPending ? 'Pending' : data.status || 'Unpaid')
    });
  } catch (e) {
    console.error('check-invoice error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
