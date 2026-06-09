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
    monthly: { amount: '9.99', currency: 'EUR', label: 'BienScore — Accès mensuel' },
  };
  const selected = plans[plan];
  if (!selected) return res.status(400).json({ error: 'Plan invalide' });

  const appUrl = process.env.APP_URL || 'https://bienscore.vercel.app';

  // Détection provider: Swiss Bitcoin Pay ou BTCPay
  const sbpKey = process.env.SWISS_BITCOIN_PAY_KEY;
  const btcpayUrl = process.env.BTCPAY_URL;
  const btcpayStore = process.env.BTCPAY_STORE_ID;
  const btcpayKey = process.env.BTCPAY_API_KEY;

  try {
    // ── Swiss Bitcoin Pay ──────────────────────────────────────────
    if (sbpKey) {
      const body = {
        title: selected.label,
        amount: parseFloat(selected.amount),
        currency: selected.currency,
        redirectAfterPayment: true,
        redirectUrl: appUrl + '?payment=success',
        webhook: appUrl + '/api/sbp-webhook',
        metadata: JSON.stringify({ plan }),
      };

      const r = await fetch('https://api.swiss-bitcoin-pay.ch/invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': sbpKey,
        },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || JSON.stringify(data));

      return res.status(200).json({
        provider: 'sbp',
        invoiceId: data.id,
        checkoutUrl: data.checkoutUrl || data.url,
        amount: selected.amount,
        currency: selected.currency,
      });
    }

    // ── BTCPay Server (fallback) ────────────────────────────────────
    if (btcpayUrl && btcpayStore && btcpayKey) {
      const body = {
        amount: selected.amount,
        currency: selected.currency,
        metadata: { plan },
        checkout: {
          redirectURL: appUrl + '?payment=success',
          redirectAutomatically: true,
        },
      };
      const r = await fetch(`${btcpayUrl}/api/v1/stores/${btcpayStore}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `token ${btcpayKey}` },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || JSON.stringify(data));

      return res.status(200).json({
        provider: 'btcpay',
        invoiceId: data.id,
        checkoutUrl: data.checkoutLink,
        amount: selected.amount,
        currency: selected.currency,
      });
    }

    throw new Error('Aucun provider de paiement configuré (SWISS_BITCOIN_PAY_KEY ou BTCPAY_*)');
  } catch (e) {
    console.error('create-invoice error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
