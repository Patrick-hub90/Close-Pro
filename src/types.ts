export type Statut =
  | 'a_appeler'
  | 'a_rappeler'
  | 'injoignable'
  | 'confirme'
  | 'whatsapp'
  | 'refuse'
  | 'ne_reconnait_pas'
  | 'livraison'
  | 'livre'
  | 'annule'

export interface Order {
  id: string
  numero: string
  client: string
  produit: string
  quantite: number
  prixUnitaire: number
  prixNegocie?: number
  coutLivraison?: number
  total: number
  telephone: string      // format international, ex +237652980944
  whatsapp: string       // chiffres pour wa.me, ex 237652980944
  adresse: string        // ville / quartier
  region: string         // region (le champ "City" du fichier EasySell)
  pays: string
  statut: Statut
  tentatives: number
  deadline?: number       // ms epoch — echeance d'appel (nouvelle commande)
  rappelAt?: number       // ms epoch — heure de rappel programmee
  rappelLieu?: string
  commentaire?: string
  clientCount?: number    // nb de commandes du meme numero (doublon / recurrent)
  extra?: Record<string, unknown> // colonnes variables du Sheet (non mappees / ajoutees)
  closeuseId?: string     // agent assigne (pour le classement proprietaire)
}

export type FiltreId = 'a_appeler' | 'rappels' | 'retard' | 'livraisons' | 'toutes' | 'archivees'

/** Résultat d'un appel : statut + saisies (rappel, édition, commentaire). */
export interface CallResult {
  statut: Statut
  commentaire?: string
  rappelAt?: number
  rappelLieu?: string
  prixNegocie?: number
  coutLivraison?: number
  produit?: string
  quantite?: number
  adresse?: string
}
