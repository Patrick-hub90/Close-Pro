const https = require('https');
const crypto = require('crypto');

// Generate JWT from service account
function makeJWT(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(header + '.' + payload);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  return header + '.' + payload + '.' + signature;
}

// Exchange JWT for access token
function getAccessToken(jwt) {
  return new Promise((resolve, reject) => {
    const postData = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt;
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': postData.length }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data).access_token); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Fetch with auth
function fetchSheets(sheetId, token) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets/' + sheetId + '/values/A1:Z5000',
      headers: { 'Authorization': 'Bearer ' + token }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { sheetUrl } = req.body;
  if (!sheetUrl) return res.status(400).json({ error: 'Missing sheetUrl' });

  try {
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: 'URL Google Sheet invalide' });
    const sheetId = match[1];

    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (!sa.private_key) return res.status(500).json({ error: 'Service account non configure sur Vercel' });

    const jwt = makeJWT(sa);
    const token = await getAccessToken(jwt);
    if (!token) return res.status(500).json({ error: 'Impossible d\'obtenir un token Google' });

    const data = await fetchSheets(sheetId, token);

    if (data.error) {
      if (data.error.code === 403) return res.status(400).json({ error: 'API Sheets pas activee. Va sur console.cloud.google.com > close-pro > active Google Sheets API' });
      if (data.error.code === 404) return res.status(400).json({ error: 'Sheet introuvable' });
      return res.status(400).json({ error: data.error.message || 'Erreur Google' });
    }

    if (!data.values || data.values.length < 2) return res.status(400).json({ error: 'Sheet vide' });

    const headers = data.values[0].map(h => (h || '').trim().toLowerCase());
    const rows = data.values.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = (r[i] || '').trim(); });
      return obj;
    }).filter(r => Object.values(r).some(v => v));

    return res.json({ headers, rows, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: 'Erreur: ' + e.message });
  }
};
