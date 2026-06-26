// Envoi d'alertes Telegram au proprietaire (Patrick).
// Canal MAITRE : gratuit, instantane, pas de fenetre 24h (contrairement a WhatsApp API).
// Variables d'env requises : TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.

export async function sendTelegram(text: string, chatId?: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat = chatId || process.env.TELEGRAM_CHAT_ID
  if (!token || !chat) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant')
    return false
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  })
  if (!res.ok) {
    console.error('[telegram] echec', res.status, await res.text())
    return false
  }
  return true
}

// Endpoint de test manuel : GET /api/telegram?text=bonjour
export default async function handler(req: any, res: any) {
  const text = req.query?.text || 'Test Close-Pro ✅'
  const ok = await sendTelegram(String(text))
  res.status(ok ? 200 : 500).json({ ok })
}
