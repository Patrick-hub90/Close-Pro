module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  
  const { sheetUrl } = req.body;
  if (!sheetUrl) return res.status(400).json({ error: 'Missing sheetUrl' });

  try {
    // Extract sheet ID from URL
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: 'URL Google Sheet invalide' });
    const sheetId = match[1];

    // Fetch as JSON via Google Visualization API (works for public/shared sheets)
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
    const response = await fetch(url);
    const text = await response.text();
    
    // Parse the JSONP response
    const jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\)/);
    if (!jsonStr) return res.status(400).json({ error: 'Impossible de lire le Sheet. Verifie qu\'il est partage en "Tout le monde avec le lien"' });
    
    const data = JSON.parse(jsonStr[1]);
    if (!data.table) return res.status(400).json({ error: 'Pas de donnees dans le Sheet' });

    // Extract headers
    const headers = data.table.cols.map(c => (c.label || '').trim().toLowerCase());
    
    // Extract rows
    const rows = data.table.rows.map(r => {
      const obj = {};
      r.c.forEach((cell, i) => {
        if (headers[i]) {
          obj[headers[i]] = cell ? (cell.v !== null && cell.v !== undefined ? String(cell.v) : '') : '';
        }
      });
      return obj;
    }).filter(r => Object.values(r).some(v => v));

    return res.json({ headers, rows, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
