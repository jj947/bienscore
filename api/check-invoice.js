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

async function checkSBP(invoiceId) {
  const key = process.env.SWISS_BITCOIN_PAY_KEY;
  const r = await fetch(`https://api.swiss-bitcoin-pay.ch/invoice/${invoiceId}`, {
    headers: { 'api-key': key },
  });
  const data = await r.json();
  // Statuts SBP: "open", "settled", "expired"
  return { paid: data.status === 'settled', status: data.status, plan: data.metadata ? JSON.parse(data.metadata || '{}').plan : 'monthly' };
}

async function checkBTCPay(invoiceId) {
  const url = process.env.BTCPAY_URL;
  const store = process.env.BTCPAY_STORE_ID;
  const key = process.env.BTCPAY_API_KEY;
  const r = await fetch(`${url}/api/v1/stores/${store}/invoices/${invoiceId}`, {
    headers: { Authorization: `token ${key}` },
  });
  const data = await r.json();
  return { paid: ['Settled', 'Processing'].includes(data.status), status: data.status, plan: data.metadata?.plan || 'monthly' };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { invoiceId, provider } = req.body || {};
  if (!invoiceId) return res.status(400).json({ error: 'invoiceId requis' });

  try {
    let result;
    if (provider === 'sbp' || process.env.SWISS_BITCOIN_PAY_KEY) {
      result = await checkSBP(invoiceId);
    } else {
      result = await checkBTCPay(invoiceId);
    }

    if (result.paid) {
      const token = generateAccessToken(invoiceId, result.plan || 'monthly');
      return res.status(200).json({ paid: true, token, status: result.status });
    }
    return res.status(200).json({ paid: false, status: result.status });
  } catch (e) {
    console.error('check-invoice error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
