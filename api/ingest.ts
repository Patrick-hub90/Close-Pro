// Ingestion des commandes depuis Google Sheet (pousse par Apps Script).
// POST /api/ingest  { secret, pays, rows: [ {colonnes du sheet} ] }
//
// - Normalise le telephone en E.164 (par pays)
// - Upsert idempotent sur (pays, numero) -> un re-push ne duplique pas
// - Arme le compteur 10 min UNIQUEMENT pour les nouvelles lignes (pas le backfill)
// - L'historique initial arrive avec ?backfill=1 -> aucun timer (anti-inondation)

import { createClient } from '@supabase/supabase-js'

const INDICATIFS: Record<string, { ind: string; len: number }> = {
  CM: { ind: '237', len: 9 }, CI: { ind: '225', len: 10 }, SN: { ind: '221', len: 9 },
}

function normalizePhone(raw: unknown, pays: string): string {
  const cfg = INDICATIFS[pays] ?? INDICATIFS.CM
  let d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00' + cfg.ind)) d = d.slice(2)
  if (!d.startsWith(cfg.ind) && d.length === cfg.len) d = cfg.ind + d
  return '+' + d
}

function pick(row: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    const hit = Object.keys(row).find((c) => c.trim().toLowerCase() === k.toLowerCase())
    if (hit != null && row[hit] !== '') return row[hit]
  }
  return undefined
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if ((req.body?.secret || req.query?.secret) !== process.env.INGEST_SECRET) {
    return res.status(401).json({ error: 'bad secret' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const pays: string = req.body?.pays || 'CM'
  const backfill: boolean = String(req.body?.backfill ?? req.query?.backfill ?? '') === '1'
  const rows: Record<string, any>[] = req.body?.rows || []
  const now = Date.now()

  const records = rows.map((row) => {
    const tel = normalizePhone(pick(row, ['Phone']), pays)
    const known = new Set(['Order Number', 'Product Name', 'Product Quantity', 'Product Price', 'Total Price', 'Full Name', 'Phone', '* Whatsapp', 'Whatsapp', 'Address 1', 'City', 'Date', 'Commentaire'])
    const extra: Record<string, any> = {}
    for (const k of Object.keys(row)) if (!known.has(k.trim())) extra[k] = row[k]
    return {
      pays,
      numero: String(pick(row, ['Order Number']) ?? '').trim(),
      source: backfill ? 'sheet' : 'sheet',
      produit_nom: String(pick(row, ['Product Name']) ?? '').trim(),
      quantite: Number(pick(row, ['Product Quantity'])) || 1,
      prix_unitaire: Math.round(Number(pick(row, ['Product Price'])) || 0),
      total: Math.round(Number(pick(row, ['Total Price'])) || 0),
      nom_complet: String(pick(row, ['Full Name']) ?? '').trim(),
      telephone: String(pick(row, ['Phone']) ?? '').trim(),
      telephone_e164: tel,
      whatsapp: String(pick(row, ['* Whatsapp', 'Whatsapp']) ?? '').replace(/\D/g, ''),
      adresse: String(pick(row, ['Address 1']) ?? '').trim(),
      region: String(pick(row, ['City']) ?? '').trim(),  // "City" = region dans EasySell
      statut: 'a_appeler',
      is_backfill: backfill,
      appel_deadline: backfill ? null : new Date(now + 10 * 60_000).toISOString(),
      appel_deadline_type: backfill ? null : 'nouvelle_10min',
      dernier_commentaire: String(pick(row, ['Commentaire']) ?? '').trim() || null,
      extra,
    }
  }).filter((r) => r.numero)

  if (records.length === 0) return res.status(200).json({ upserted: 0 })

  const { error, count } = await supabase
    .from('orders')
    .upsert(records, { onConflict: 'pays,numero', ignoreDuplicates: false, count: 'exact' })

  if (error) {
    console.error('[ingest]', error)
    return res.status(500).json({ error: error.message })
  }
  return res.status(200).json({ upserted: count ?? records.length })
}
