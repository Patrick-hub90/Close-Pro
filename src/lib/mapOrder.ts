import type { Order, Statut } from '../types'

/** Convertit une ligne Supabase (snake_case) vers le type Order de l'app. */
export function mapDbOrder(r: any): Order {
  return {
    id: r.id,
    numero: r.numero,
    client: r.nom_complet ?? 'Client',
    produit: r.produit_nom ?? '',
    quantite: r.quantite ?? 1,
    prixUnitaire: r.prix_unitaire ?? 0,
    prixNegocie: r.prix_negocie ?? undefined,
    coutLivraison: r.cout_livraison ?? undefined,
    total: r.total ?? 0,
    telephone: r.telephone_e164 || r.telephone || '',
    whatsapp: r.whatsapp || '',
    adresse: r.adresse ?? '',
    region: r.region ?? '',
    pays: r.pays ?? '',
    statut: (r.statut ?? 'a_appeler') as Statut,
    tentatives: r.tentatives ?? 0,
    deadline: r.appel_deadline ? new Date(r.appel_deadline).getTime() : undefined,
    rappelAt: r.rappel_at ? new Date(r.rappel_at).getTime() : undefined,
    rappelLieu: r.rappel_lieu ?? undefined,
    commentaire: r.dernier_commentaire ?? undefined,
    clientCount: 1,
    extra: r.extra && typeof r.extra === 'object' && !Array.isArray(r.extra) && Object.keys(r.extra).length ? r.extra : undefined,
    closeuseId: r.closeuse_id ?? undefined,
    confirmeAt: r.confirme_at ? new Date(r.confirme_at).getTime() : undefined,
  }
}
