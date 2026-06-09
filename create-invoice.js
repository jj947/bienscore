const fetch = require('node-fetch');

const BTCPAY_URL = process.env.BTCPAY_URL || 'https://mainnet.demo.btcpayserver.org';
const BTCPAY_STORE_ID = process.env.BTCPAY_STORE_ID;
const BTCPAY_API_KEY = process.env.BTCPAY_API_KEY;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { plan, email } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'Plan requis' });

  const plans = {
    monthly: { amount: 9.99, currency: 'EUR', label: 'BienScore — Accès mensuel' },
  };

  const selected = plans[plan];
  if (!selected) return res.status(400).json({ error: 'Plan invalide' });

  try {
    const appUrl = process.env.APP_URL || 'https://bienscore.vercel.app';

    const body = {
      amount: selected.amount,
      currency: selected.currency,
      metadata: {
        orderId: 'bienscore_' + Date.now(),
        buyerEmail: email || '',
        plan,
      },
      checkout: {
        speedPolicy: 'MediumSpeed',
        redirectURL: appUrl + '?payment=success',
        redirectAutomatically: true,
        requiresRefundEmail: false,
        defaultPaymentMethod: 'BTC-LightningNetwork',
        paymentMethods: ['BTC', 'BTC-LightningNetwork'],
      },
      receipt: {
        enabled: true,
        showQR: true,
      },
    };

    const response = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `token ${BTCPAY_API_KEY}`,
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || JSON.stringify(data));

    return res.status(200).json({
      invoiceId: data.id,
      checkoutUrl: data.checkoutLink,
      amount: selected.amount,
      currency: selected.currency,
    });
  } catch (e) {
    console.error('BTCPay error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
