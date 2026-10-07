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
  BJ: { code: 'BJ', nom: 'Bénin', indicatif: '229', devise: 'FCFA', fuseau: 'Africa/Porto-Novo', longueurLocale: 8 },
  TG: { code: 'TG', nom: 'Togo', indicatif: '228', devise: 'FCFA', fuseau: 'Africa/Lome', longueurLocale: 8 },
  BF: { code: 'BF', nom: 'Burkina Faso', indicatif: '226', devise: 'FCFA', fuseau: 'Africa/Ouagadougou', longueurLocale: 8 },
  ML: { code: 'ML', nom: 'Mali', indicatif: '223', devise: 'FCFA', fuseau: 'Africa/Bamako', longueurLocale: 8 },
  GA: { code: 'GA', nom: 'Gabon', indicatif: '241', devise: 'FCFA', fuseau: 'Africa/Libreville', longueurLocale: 8 },
  CG: { code: 'CG', nom: 'Congo', indicatif: '242', devise: 'FCFA', fuseau: 'Africa/Brazzaville', longueurLocale: 9 },
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
