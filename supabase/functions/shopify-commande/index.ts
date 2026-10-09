// Close-Pro — Webhook Shopify « Création de commande » -> table shopify_attributions.
// Récupère l'identifiant de clic Meta (fbclid) et l'IP du client que le formulaire EasySell range dans
// les attributs de la commande (full_url, IP Address), pour que l'événement « CommandeLivree » envoyé
// à la livraison soit relié à la pub cliquée (voir supabase/meta_capi.sql et shopify_attribution.sql).
//
// Sécurité : l'URL du webhook contient un jeton secret (?k=…) comparé à app_config.shopify_webhook_token.
// La fonction ne fait qu'enregistrer ces quelques champs ; elle répond toujours 200 à Shopify quand le
// jeton est bon (sinon Shopify réessaie puis désactive le webhook).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

async function config(key: string): Promise<string | null> {
  const { data } = await db.from('app_config').select('value').eq('key', key).maybeSingle()
  return (data as { value?: string } | null)?.value ?? null
}

function egalConstant(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

const court = (v: unknown, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')

  const attendu = await config('shopify_webhook_token')
  const recu = new URL(req.url).searchParams.get('k') || ''
  if (!attendu || !egalConstant(recu, attendu)) return new Response('forbidden', { status: 403 })

  let o: Record<string, any>
  try { o = await req.json() } catch { return new Response('bad json', { status: 400 }) }

  const boutique = (req.headers.get('x-shopify-shop-domain') || '').toLowerCase()
  const pays = await config('shopify_pays_' + boutique)
  const numero = String(o.name ?? o.order_number ?? '').replace(/\D/g, '')
  if (!pays || !numero) return new Response('ignored') // boutique inconnue : rien à faire

  const attrs: Record<string, string> = {}
  for (const a of (o.note_attributes ?? []) as { name?: string; value?: string }[]) {
    if (a?.name) attrs[a.name] = String(a.value ?? '')
  }

  const fullUrl = attrs['full_url'] || (o.landing_site ? `https://${boutique}${o.landing_site}` : '')
  let fbclid: string | null = null, adId: string | null = null, url: string | null = null
  try {
    const u = new URL(fullUrl)
    fbclid = court(u.searchParams.get('fbclid'))
    adId = court(u.searchParams.get('ad_id') || u.searchParams.get('utm_content'), 64)
    url = court(u.origin + u.pathname)
  } catch { /* pas d'URL exploitable */ }

  const ligne = {
    pays, numero, fbclid, ad_id: adId, url,
    ip: court(attrs['IP Address'] || o.browser_ip || o.client_details?.browser_ip, 64),
    user_agent: court(o.client_details?.user_agent),
    commande_at: o.created_at ?? null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await db.from('shopify_attributions').upsert(ligne, { onConflict: 'pays,numero' })
  if (error) console.error('upsert', numero, error.message)
  return new Response('ok')
})
