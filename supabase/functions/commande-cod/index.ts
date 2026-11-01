// Close-Pro — Formulaire de commande « paiement à la livraison » (remplace EasySell).
// Le bloc de thème Shopify `noshop-cod-form` envoie la commande ici ; on crée directement la commande
// dans `orders` (même forme que l'import du Sheet, voir apps-script/Code.gs), on range l'attribution pub
// dans `shopify_attributions` et on envoie l'achat à Meta (CAPI, dédupliqué avec le pixel du navigateur).
//
// Sécurité : fonction publique (le formulaire est sur la boutique). On n'accepte que les boutiques
// déclarées dans app_config (`cod_shop_<domaine>` = pays), le prix est relu côté serveur sur la boutique
// (jamais celui envoyé par le navigateur) et une même commande renvoyée sous 15 min n'est pas recréée.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

// Indicatif et longueur du numéro national, par pays (même règle que apps-script/Code.gs).
const INDICATIFS: Record<string, { ind: string; len: number; prefixes: RegExp }> = {
  SN: { ind: '221', len: 9, prefixes: /^(7[05678]|3[03])/ },
  CM: { ind: '237', len: 9, prefixes: /^[62]/ },
  CI: { ind: '225', len: 10, prefixes: /^(0[157]|2[157])/ },
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

async function config(key: string): Promise<string | null> {
  const { data } = await db.from('app_config').select('value').eq('key', key).maybeSingle()
  return (data as { value?: string } | null)?.value ?? null
}

const court = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** Numéro national -> +E164, ou null s'il n'a pas la forme d'un numéro du pays. */
function normPhone(raw: string, pays: string): string | null {
  const cfg = INDICATIFS[pays]
  if (!cfg) return null
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith(cfg.ind)) d = d.slice(cfg.ind.length)
  if (d.length !== cfg.len || !cfg.prefixes.test(d)) return null
  return '+' + cfg.ind + d
}

async function sha256(v: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v.trim().toLowerCase()))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Prix réel du produit : lu sur la boutique (endpoint public /products/<handle>.js, prix en centimes),
 * sinon dans le catalogue app_config `cod_catalogue_<domaine>` ({handle: {titre, prix}}) — utile quand la
 * boutique est protégée par mot de passe. Jamais le prix envoyé par le navigateur.
 */
async function produitBoutique(shop: string, handle: string) {
  try {
    const r = await fetch(`https://${shop}/products/${encodeURIComponent(handle)}.js`)
    if (r.ok) {
      const p = await r.json() as { title: string; variants: { id: number; price: number }[] }
      const v = p.variants?.[0]
      if (v) return { titre: p.title, variante: v.id as number | null, prix: Math.round(v.price / 100) }
    }
  } catch { /* boutique injoignable : catalogue */ }
  const cat = await config('cod_catalogue_' + shop)
  if (!cat) return null
  try {
    const p = (JSON.parse(cat) as Record<string, { titre: string; prix: number }>)[handle]
    return p ? { titre: p.titre, variante: null, prix: Math.round(p.prix) } : null
  } catch { return null }
}

async function envoyerAchatMeta(o: {
  pays: string; numero: string; total: number; e164: string; nom: string | null; eventId: string
  url: string | null; ip: string | null; ua: string | null; fbc: string | null; fbp: string | null; handle: string
}) {
  const pixel = (await config('meta_pixel_id_' + o.pays)) || (await config('meta_pixel_id'))
  const token = (await config('meta_capi_token_' + o.pays)) || (await config('meta_capi_token'))
  if (!pixel || !token) return
  const devise = (await config('meta_currency_' + o.pays)) || (await config('meta_currency')) || 'XOF'
  const [prenom, ...reste] = (o.nom || '').split(/\s+/)
  const userData: Record<string, unknown> = {
    ph: [await sha256(o.e164.replace(/\D/g, ''))],
    country: [await sha256(o.pays)],
    external_id: [await sha256(o.e164)],
  }
  if (prenom) userData.fn = [await sha256(prenom)]
  if (reste.length) userData.ln = [await sha256(reste.join(' '))]
  if (o.ip) userData.client_ip_address = o.ip
  if (o.ua) userData.client_user_agent = o.ua
  if (o.fbc) userData.fbc = o.fbc
  if (o.fbp) userData.fbp = o.fbp
  const body = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: o.eventId,
      action_source: 'website',
      event_source_url: o.url ?? undefined,
      user_data: userData,
      custom_data: { currency: devise, value: o.total, content_ids: [o.handle], content_type: 'product', order_id: o.numero, pays: o.pays },
    }],
  }
  const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!r.ok) console.error('capi', o.numero, r.status, (await r.text()).slice(0, 300))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, erreur: 'méthode' }, 405)

  let b: Record<string, any>
  try { b = await req.json() } catch { return json({ ok: false, erreur: 'Requête invalide.' }, 400) }

  const shop = String(b.shop || '').toLowerCase()
  const pays = await config('cod_shop_' + shop)
  if (!pays) return json({ ok: false, erreur: 'Boutique non autorisée.' }, 403)

  const nom = court(b.nom, 80)
  const adresse = court(b.adresse, 200)
  const ville = court(b.ville, 80)
  const handle = court(b.handle, 200)
  const quantite = Math.min(Math.max(parseInt(b.quantite) || 1, 1), 5)
  const e164 = normPhone(String(b.telephone || ''), pays)
  if (!nom || nom.length < 2) return json({ ok: false, erreur: 'Indiquez votre nom.' }, 422)
  if (!e164) return json({ ok: false, erreur: 'Numéro de téléphone invalide.' }, 422)
  if (!adresse) return json({ ok: false, erreur: 'Indiquez votre quartier ou votre adresse.' }, 422)
  if (!handle) return json({ ok: false, erreur: 'Produit manquant.' }, 422)

  const produit = await produitBoutique(shop, handle)
  if (!produit) return json({ ok: false, erreur: 'Produit introuvable.' }, 422)
  const total = produit.prix * quantite

  // Même téléphone + même produit dans les 15 dernières minutes : on renvoie la commande existante.
  const { data: dejaVue } = await db.from('orders').select('numero')
    .eq('pays', pays).eq('telephone_e164', e164).eq('produit_nom', produit.titre)
    .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()).limit(1).maybeSingle()
  if (dejaVue) return json({ ok: true, numero: (dejaVue as { numero: string }).numero, doublon: true })

  const { data: seq, error: eSeq } = await db.rpc('cod_prochain_numero')
  if (eSeq || !seq) { console.error('numero', eSeq?.message); return json({ ok: false, erreur: 'Erreur, réessayez.' }, 500) }
  const numero = String(seq)

  const fullUrl = court(b.full_url, 1000)
  let fbclid: string | null = null, adId: string | null = null, url: string | null = null
  try {
    const u = new URL(fullUrl || '')
    fbclid = court(u.searchParams.get('fbclid'), 500)
    adId = court(u.searchParams.get('ad_id') || u.searchParams.get('utm_content'), 64)
    url = court(u.origin + u.pathname, 500)
  } catch { /* pas d'URL exploitable */ }
  const ip = court((req.headers.get('x-forwarded-for') || '').split(',')[0], 64)
  const ua = court(req.headers.get('user-agent'), 500)
  const maintenant = new Date().toISOString()

  const { error } = await db.from('orders').insert({
    pays, numero, source: 'formulaire',
    produit_nom: produit.titre, quantite, prix_unitaire: produit.prix, total,
    nom_complet: nom, telephone: court(b.telephone, 40), telephone_e164: e164,
    whatsapp: e164.replace(/\D/g, ''), adresse, region: ville,
    statut: 'a_appeler', is_backfill: false,
    appel_deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(), appel_deadline_type: 'nouvelle_10min',
    date_commande: maintenant,
    extra: { boutique: shop, handle, variante: produit.variante, note: court(b.note, 300) },
  })
  if (error) { console.error('insert', numero, error.message); return json({ ok: false, erreur: 'Erreur, réessayez.' }, 500) }

  await db.from('shopify_attributions').upsert({
    pays, numero, fbclid, ad_id: adId, ip, user_agent: ua, url, commande_at: maintenant, updated_at: maintenant,
  }, { onConflict: 'pays,numero' })

  const fbc = court(b.fbc, 300) || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null)
  const eventId = court(b.event_id, 100) || 'achat-' + numero
  try {
    await envoyerAchatMeta({ pays, numero, total, e164, nom, eventId, url: url || fullUrl, ip, ua, fbc, fbp: court(b.fbp, 300), handle })
  } catch (e) { console.error('capi', numero, String(e)) }

  console.log('commande', JSON.stringify({ shop, pays, numero, handle, quantite, total }))
  return json({ ok: true, numero, total })
})
