const admin = require('firebase-admin');

let app;
try {
  const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (!app && cred.project_id) {
    app = admin.initializeApp({ credential: admin.credential.cert(cred) });
  }
} catch(e) {}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  
  const { title, body, spaceCode, exclude } = req.body;
  if (!title || !spaceCode) return res.status(400).json({ error: 'Missing title or spaceCode' });

  try {
    const db = admin.firestore();
    const tokensSnap = await db.collection('spaces').doc(spaceCode).collection('fcm_tokens').get();
    const tokens = [];
    tokensSnap.forEach(doc => {
      const d = doc.data();
      if (d.token && d.token !== exclude) tokens.push(d.token);
    });

    if (tokens.length === 0) return res.json({ sent: 0 });

    const results = await Promise.allSettled(
      tokens.map(token =>
        admin.messaging().send({
          token,
          data: { title: title || '', body: body || '', tag: 'closepro-' + Date.now() },
          android: {
            priority: 'high',
            notification: {
              title: title || 'ClosePro',
              body: body || '',
              sound: 'default',
              channelId: 'closepro_alerts',
              defaultVibrateTimings: false,
              vibrateTimingsMillis: [0, 300, 150, 300, 150, 300]
            }
          },
          webpush: {
            headers: { Urgency: 'high', TTL: '86400' },
            notification: {
              title: title || 'ClosePro',
              body: body || '',
              requireInteraction: true,
              vibrate: [300, 150, 300, 150, 300],
              tag: 'closepro-' + Date.now(),
              renotify: true
            }
          }
        }).catch(() => null)
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value).length;
    return res.json({ sent, total: tokens.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
