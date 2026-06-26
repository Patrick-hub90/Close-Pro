// Moteur SLA : echeances d'appel + escalade graduee.
// Tourne cote SERVEUR (cron) — l'horloge de reference est le serveur, jamais le tel.

export const SLA = {
  nouvelleMin: 10,       // appel <= 10 min apres reception
  rappelToleranceMin: 15, // rappel honore a +/- 15 min
  paliers: {
    nudgeMin: 7,          // rappel doux a la closeuse
    breachCloseuseMin: 10, // 2e rappel ferme
    rappelCloseuse2Min: 20,
    alerteProprietaireMin: 30, // alerte Telegram a Patrick
  },
}

export type EcheanceType = 'nouvelle_10min' | 'rappel_programme'

export interface SlaCommande {
  id: string
  closeuseId: string
  detecteeAt: number        // reception cote serveur (ms)
  echeanceAt: number | null // deadline d'appel
  echeanceType: EcheanceType
  premierAppelAt: number | null // 1er clic tel:/wa enregistre
  statutTermine: boolean
}

export type Palier = 'ok' | 'nudge' | 'breach_closeuse' | 'rappel2' | 'alerte_proprietaire'

/** Echeance d'une nouvelle commande = detection + 10 min (horloge serveur). */
export function echeanceNouvelle(detecteeAt: number): number {
  return detecteeAt + SLA.nouvelleMin * 60_000
}

/** Palier d'escalade courant pour une commande non encore traitee. */
export function palier(c: SlaCommande, now: number): Palier {
  if (c.statutTermine || c.premierAppelAt) return 'ok'
  if (!c.echeanceAt) return 'ok'
  const retardMin = (now - c.echeanceAt) / 60_000
  const p = SLA.paliers
  if (c.echeanceType === 'rappel_programme') {
    if (retardMin < SLA.rappelToleranceMin) return 'ok'
    if (retardMin < p.alerteProprietaireMin) return 'rappel2'
    return 'alerte_proprietaire'
  }
  // nouvelle commande
  const ageMin = (now - (c.echeanceAt - SLA.nouvelleMin * 60_000)) / 60_000
  if (ageMin < p.nudgeMin) return 'ok'
  if (ageMin < p.breachCloseuseMin) return 'nudge'
  if (ageMin < p.rappelCloseuse2Min) return 'breach_closeuse'
  if (ageMin < p.alerteProprietaireMin) return 'rappel2'
  return 'alerte_proprietaire'
}

/** Faut-il alerter le proprietaire (Telegram) ? Avec fenetre de grace deja incluse. */
export function doitAlerterProprietaire(c: SlaCommande, now: number): boolean {
  return palier(c, now) === 'alerte_proprietaire'
}

/** Texte d'alerte Telegram pour le proprietaire. */
export function texteAlerte(o: { numero: string; client: string; produit: string; total: number; region: string; closeuseNom: string }, retardMin: number): string {
  return [
    `RETARD APPEL — ${o.closeuseNom}`,
    `${o.numero} — ${o.client} (${o.region})`,
    `${o.produit} — ${o.total.toLocaleString('fr-FR')} FCFA`,
    `Retard ${Math.round(retardMin)} min · jamais appelée`,
  ].join('\n')
}
