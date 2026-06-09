const fetch = require('node-fetch');
const crypto = require('crypto');

const BTCPAY_URL = process.env.BTCPAY_URL || 'https://mainnet.demo.btcpayserver.org';
const BTCPAY_STORE_ID = process.env.BTCPAY_STORE_ID;
const BTCPAY_API_KEY = process.env.BTCPAY_API_KEY;
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'bienscore_secret_change_me';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function generateAccessToken(invoiceId, plan) {
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 jours
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
    const response = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices/${invoiceId}`,
      {
        headers: { Authorization: `token ${BTCPAY_API_KEY}` },
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Erreur BTCPay');

    // Statuts valides : Settled ou Processing (assez confirmé)
    const paid = ['Settled', 'Processing'].includes(data.status);

    if (paid) {
      const plan = data.metadata?.plan || 'monthly';
      const token = generateAccessToken(invoiceId, plan);
      return res.status(200).json({ paid: true, token, status: data.status });
    }

    return res.status(200).json({ paid: false, status: data.status });
  } catch (e) {
    console.error('Check invoice error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
