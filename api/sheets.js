const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ClosePro/1.0' } }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      lines.push(current); current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (current || lines.length > 0) { lines.push(current); }
      if (lines.length > 0) {
        if (!parseCSV._rows) parseCSV._rows = [];
        parseCSV._rows.push([...lines]);
      }
      lines.length = 0; current = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current || lines.length > 0) {
    lines.push(current);
    if (!parseCSV._rows) parseCSV._rows = [];
    parseCSV._rows.push([...lines]);
  }
  const result = parseCSV._rows || [];
  parseCSV._rows = null;
  return result;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  
  const { sheetUrl } = req.body;
  if (!sheetUrl) return res.status(400).json({ error: 'Missing sheetUrl' });

  try {
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: 'URL Google Sheet invalide' });
    const sheetId = match[1];

    // Try CSV export (works for "anyone with link" shared sheets)
    const csvUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/export?format=csv&gid=0';
    const csvText = await fetchUrl(csvUrl);
    
    if (!csvText || csvText.includes('<!DOCTYPE html>') || csvText.length < 10) {
      return res.status(400).json({ error: 'Impossible de lire le Sheet. Verifie le partage.' });
    }

    const allRows = parseCSV(csvText);
    if (allRows.length < 2) return res.status(400).json({ error: 'Sheet vide ou une seule ligne' });

    const headers = allRows[0].map(h => h.trim().toLowerCase());
    const rows = allRows.slice(1).map(r => {
      const obj = {};
      r.forEach((cell, i) => {
        if (headers[i]) obj[headers[i]] = (cell || '').trim();
      });
      return obj;
    }).filter(r => Object.values(r).some(v => v));

    return res.json({ headers, rows, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: 'Erreur: ' + e.message });
  }
};
