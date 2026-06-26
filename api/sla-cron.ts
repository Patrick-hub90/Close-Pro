// Moteur SLA — execute chaque minute par Vercel Cron (voir vercel.json).
// Detecte les commandes en retard et alerte le proprietaire via Telegram,
// avec fenetre de grace + anti-spam (un evenement par commande).

import { createClient } from '@supabase/supabase-js'
import { sendTelegram } from './telegram'

export default async function handler(_req: any, res: any) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const now = Date.now()

  // Nouvelles commandes : retard > 30 min apres la deadline 10 min, jamais appelees,
  // pas backfill, et pas encore notifiees.
  const seuil = new Date(now - 20 * 60_000).toISOString() // deadline depassee de 20 min (=30 min apres reception)

  const { data: enRetard, error } = await supabase
    .from('orders')
    .select('id, numero, nom_complet, produit_nom, total, region, appel_deadline, closeuse_id, agents:closeuse_id(nom)')
    .eq('statut', 'a_appeler')
    .eq('is_backfill', false)
    .lt('appel_deadline', seuil)
    .limit(50)

  if (error) {
    console.error('[sla-cron]', error)
    return res.status(500).json({ error: error.message })
  }

  let alertes = 0
  for (const o of enRetard ?? []) {
    // anti-spam : un evenement 'deadline_depassee' deja envoye ?
    const { data: deja } = await supabase
      .from('events').select('id')
      .eq('order_id', o.id).eq('type', 'deadline_depassee').eq('notifie', true).limit(1)
    if (deja && deja.length) continue

    const retardMin = (now - new Date(o.appel_deadline as string).getTime()) / 60_000 + 10
    const closeuse = (o as any).agents?.nom ?? 'closeuse'
    const texte = [
      `RETARD APPEL — ${closeuse}`,
      `${o.numero} — ${o.nom_complet} (${o.region || '—'})`,
      `${o.produit_nom} — ${Number(o.total).toLocaleString('fr-FR')} FCFA`,
      `Retard ${Math.round(retardMin)} min · jamais appelée`,
    ].join('\n')

    const ok = await sendTelegram(texte)
    await supabase.from('events').insert({
      order_id: o.id, type: 'deadline_depassee', severite: 'alerte',
      canal_notif: 'telegram', destinataire: 'owner', notifie: ok,
      envoye_at: ok ? new Date().toISOString() : null,
      payload: { retard_min: Math.round(retardMin) },
    })
    if (ok) alertes++
  }

  return res.status(200).json({ scanned: enRetard?.length ?? 0, alertes })
}
