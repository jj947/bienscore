const crypto = require('crypto');

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'bienscore_secret_change_me';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { token } = req.body || {};
  if (!token) return res.status(200).json({ valid: false });

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { invoiceId, plan, expiry, sig } = decoded;

    // Vérifier signature
    const payload = `${invoiceId}:${plan}:${expiry}`;
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    if (sig !== expected) return res.status(200).json({ valid: false, reason: 'signature invalide' });

    // Vérifier expiration
    if (Date.now() > expiry) return res.status(200).json({ valid: false, reason: 'expiré', expiredAt: expiry });

    const daysLeft = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24));
    return res.status(200).json({ valid: true, plan, daysLeft, expiry });
  } catch (e) {
    return res.status(200).json({ valid: false, reason: 'token malformé' });
  }
};
