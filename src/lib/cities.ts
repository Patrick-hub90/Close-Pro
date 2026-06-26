// Table de normalisation des villes / quartiers (donnees EasySell tres sales).
// La colonne "City" du fichier = REGION ; la vraie ville est dans "Address 1".
// On nettoie la ville et on RECALCULE la region depuis la ville (la region brute est fausse).

const VILLE_ALIASES: Record<string, string> = {
  dla: 'Douala', douala: 'Douala', dl: 'Douala', bonaberi: 'Douala', bonabéri: 'Douala',
  yde: 'Yaoundé', yaounde: 'Yaoundé', yaoundé: 'Yaoundé', yaonde: 'Yaoundé', ya: 'Yaoundé',
  bafoussam: 'Bafoussam', bafous: 'Bafoussam',
  bamenda: 'Bamenda', ngaoundere: 'Ngaoundéré', 'ngaoundéré': 'Ngaoundéré',
  garoua: 'Garoua', maroua: 'Maroua', bertoua: 'Bertoua', ebolowa: 'Ebolowa',
  kribi: 'Kribi', limbe: 'Limbé', limbé: 'Limbé', buea: 'Buea', edea: 'Edéa', 'edéa': 'Edéa',
  dschang: 'Dschang', kumba: 'Kumba', nkongsamba: 'Nkongsamba',
}

// Ville canonique -> region administrative (Cameroun).
const VILLE_REGION: Record<string, string> = {
  Douala: 'Littoral', Edéa: 'Littoral', Nkongsamba: 'Littoral',
  Yaoundé: 'Centre', Mbalmayo: 'Centre',
  Bafoussam: 'Ouest', Dschang: 'Ouest',
  Bamenda: 'Nord-Ouest', Buea: 'Sud-Ouest', Limbé: 'Sud-Ouest', Kumba: 'Sud-Ouest',
  Ngaoundéré: 'Adamaoua', Garoua: 'Nord', Maroua: 'Extrême-Nord',
  Bertoua: 'Est', Ebolowa: 'Sud', Kribi: 'Sud',
}

function looksInvalid(s: string): boolean {
  const v = (s || '').trim()
  return !v || v.length < 2 || /^[\d+\s().\-/]+$/.test(v)
}

/** Renvoie la ville canonique a partir d'une saisie sale, ou '' si invalide. */
export function normalizeCity(raw: string): string {
  if (looksInvalid(raw)) return ''
  const key = raw.trim().toLowerCase().replace(/\.+/g, '').replace(/\s+/g, ' ')
  if (VILLE_ALIASES[key]) return VILLE_ALIASES[key]
  // Capitalise proprement les villes non connues.
  return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Region recalculee depuis la ville ; repli sur la region brute si plausible. */
export function resolveRegion(city: string, rawRegion: string): string {
  const v = normalizeCity(city)
  if (v && VILLE_REGION[v]) return VILLE_REGION[v]
  if (!looksInvalid(rawRegion)) return rawRegion.trim()
  return ''
}
