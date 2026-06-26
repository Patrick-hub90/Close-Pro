// Moteur d'attribution des commandes aux closeuses (intra-pays).
// Modes : equilibre (charge), performance (score d'adequation), manuel (override).
// Garde-fous "sans penaliser" : plancher de volume garanti + periode d'apprentissage.

export interface CloseuseStat {
  id: string
  enLigne: boolean
  charge: number
  capacite: number
  // taux 0..1 ; null si pas encore d'historique (nouvelle closeuse)
  confiance: number | null
  livre: number | null
  // forces optionnelles par produit / region (taux 0..1)
  parProduit?: Record<string, number>
  parRegion?: Record<string, number>
  apprentissage?: boolean
}

export interface OrdreContexte {
  produit?: string
  region?: string
}

export interface AssignConfig {
  mode: 'equilibre' | 'performance' | 'manuel'
  // 0..100 : 0 = equite pure (charge), 100 = performance pure
  curseurPerformance: number
  // part minimale du flux garantie a chaque closeuse active (ex 0.15)
  plancher: number
}

const DEFAULT_LEARNING = 0.6 // adequation neutre pour une nouvelle closeuse

/** Score d'adequation 0..1 d'une closeuse pour une commande donnee. */
export function scoreAdequation(c: CloseuseStat, ctx: OrdreContexte): number {
  if (c.apprentissage || c.confiance == null) return DEFAULT_LEARNING
  let base = 0.5 * c.confiance + 0.5 * (c.livre ?? c.confiance)
  if (ctx.produit && c.parProduit?.[ctx.produit] != null) base = 0.6 * base + 0.4 * c.parProduit[ctx.produit]
  if (ctx.region && c.parRegion?.[ctx.region] != null) base = 0.7 * base + 0.3 * c.parRegion[ctx.region]
  return Math.max(0, Math.min(1, base))
}

/** Choisit la closeuse pour une commande. Retourne son id, ou null si aucune dispo. */
export function pickCloseuse(
  closeuses: CloseuseStat[],
  ctx: OrdreContexte,
  cfg: AssignConfig
): string | null {
  const dispo = closeuses.filter((c) => c.enLigne && c.charge < c.capacite)
  if (dispo.length === 0) return null
  if (dispo.length === 1) return dispo[0].id

  // Plancher : si une closeuse est tres en-dessous de sa part garantie, la prioriser.
  const totalCharge = dispo.reduce((s, c) => s + c.charge, 0) + 1
  const partGarantie = cfg.plancher
  const sousPlancher = dispo
    .filter((c) => c.charge / totalCharge < partGarantie)
    .sort((a, b) => a.charge - b.charge)
  if (sousPlancher.length > 0) return sousPlancher[0].id

  if (cfg.mode === 'equilibre' || cfg.mode === 'manuel') {
    return [...dispo].sort((a, b) => a.charge / a.capacite - b.charge / b.capacite)[0].id
  }

  // Mode performance : melange (adequation) et (place dispo), dose par le curseur.
  const w = cfg.curseurPerformance / 100
  const note = (c: CloseuseStat) => {
    const adeq = scoreAdequation(c, ctx)
    const dispoRatio = 1 - c.charge / c.capacite
    return w * adeq + (1 - w) * dispoRatio
  }
  return [...dispo].sort((a, b) => note(b) - note(a))[0].id
}
