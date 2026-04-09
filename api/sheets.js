const https = require('https');
const crypto = require('crypto');

function makeJWT(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(header + '.' + payload);
  return header + '.' + payload + '.' + sign.sign(sa.private_key, 'base64url');
}

function getToken(jwt) {
  return new Promise((resolve, reject) => {
    const body = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt;
    const req = https.request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d).access_token) } catch(e) { reject(e) } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function fetchAPI(path, token) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: 'sheets.googleapis.com', path, headers: { 'Authorization': 'Bearer ' + token } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)) } catch(e) { reject(e) } }); }
    ).on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { sheetUrl, sheetName } = req.body;
  if (!sheetUrl) return res.status(400).json({ error: 'Missing sheetUrl' });

  try {
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: 'URL invalide' });
    const sheetId = match[1];
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (!sa.private_key) return res.status(500).json({ error: 'Service account manquant' });

    const token = await getToken(makeJWT(sa));
    if (!token) return res.status(500).json({ error: 'Token impossible' });

    // If no sheetName, return list of tabs
    if (!sheetName) {
      const meta = await fetchAPI('/v4/spreadsheets/' + sheetId + '?fields=sheets.properties', token);
      if (meta.error) return res.status(400).json({ error: meta.error.message });
      const tabs = (meta.sheets || []).map(s => s.properties.title);
      return res.json({ tabs });
    }

    // Fetch data from specific tab
    const range = encodeURIComponent(sheetName + '!A1:Z5000');
    const data = await fetchAPI('/v4/spreadsheets/' + sheetId + '/values/' + range, token);
    if (data.error) return res.status(400).json({ error: data.error.message });
    if (!data.values || data.values.length < 2) return res.status(400).json({ error: 'Onglet vide' });

    const headers = data.values[0].map(h => (h || '').trim().toLowerCase());
    const rows = data.values.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = (r[i] || '').trim(); });
      return obj;
    }).filter(r => Object.values(r).some(v => v));

    return res.json({ headers, rows, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
