// Normalisation multi-pays — base de la future synchro Google Sheet.

export interface PaysConfig {
  code: string
  nom: string
  indicatif: string
  devise: string
  fuseau: string
  longueurLocale: number
}

export const PAYS: Record<string, PaysConfig> = {
  CM: { code: 'CM', nom: 'Cameroun', indicatif: '237', devise: 'FCFA', fuseau: 'Africa/Douala', longueurLocale: 9 },
  CI: { code: 'CI', nom: "Côte d'Ivoire", indicatif: '225', devise: 'FCFA', fuseau: 'Africa/Abidjan', longueurLocale: 10 },
  SN: { code: 'SN', nom: 'Sénégal', indicatif: '221', devise: 'FCFA', fuseau: 'Africa/Dakar', longueurLocale: 9 },
}

/** Met un numero brut au format international +<indicatif>XXXXXXXXX. */
export function normalizePhone(raw: unknown, paysCode = 'CM'): string {
  const p = PAYS[paysCode] ?? PAYS.CM
  let d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00' + p.indicatif)) d = d.slice(2)
  if (d.startsWith(p.indicatif)) {
    // deja prefixe
  } else if (d.length === p.longueurLocale) {
    d = p.indicatif + d
  }
  return '+' + d
}

/** Cle de deduplication : les 9 derniers chiffres (reconcilie Phone et *Whatsapp). */
export function dedupKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-9)
}

/** Lien wa.me a partir d'un numero (local ou international). */
export function waNumber(raw: string, paysCode = 'CM'): string {
  const p = PAYS[paysCode] ?? PAYS.CM
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d && !d.startsWith(p.indicatif) && d.length === p.longueurLocale) d = p.indicatif + d
  return d
}
