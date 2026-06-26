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
}

export type FiltreId = 'a_appeler' | 'rappels' | 'retard' | 'toutes'
