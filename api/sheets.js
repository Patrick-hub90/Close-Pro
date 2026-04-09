const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } 
        catch(e) { reject(new Error('Reponse invalide')); }
      });
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
    const apiKey = 'AIzaSyBPkWFyfZacTKggPdCq0_EwJq4eq82XbXc';

    // Use Google Sheets API v4 (works with "anyone with link" sharing)
    const apiUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/A1:Z5000?key=' + apiKey;
    const data = await fetchJSON(apiUrl);

    if (data.error) {
      if (data.error.code === 403) return res.status(400).json({ error: 'Active l\'API Google Sheets dans console.cloud.google.com' });
      if (data.error.code === 404) return res.status(400).json({ error: 'Sheet introuvable. Verifie le lien.' });
      return res.status(400).json({ error: data.error.message || 'Erreur Google' });
    }

    if (!data.values || data.values.length < 2) {
      return res.status(400).json({ error: 'Sheet vide ou une seule ligne' });
    }

    const headers = data.values[0].map(h => (h || '').trim().toLowerCase());
    const rows = data.values.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = (r[i] || '').trim();
      });
      return obj;
    }).filter(r => Object.values(r).some(v => v));

    return res.json({ headers, rows, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: 'Erreur: ' + e.message });
  }
};
