import type { Order } from './types'
import { rappelToday } from './lib'

export const CLOSEUSE = { nom: 'Awa', pays: 'Cameroun', score: 87 }

const T = Date.now()
const MIN = 60_000

export const ORDERS: Order[] = [
  {
    id: '1659', numero: '#1659', client: 'Russ Russ', produit: "L'Extension XXL",
    quantite: 1, prixUnitaire: 13900, total: 13900,
    telephone: '+237652980944', whatsapp: '237652980944',
    adresse: 'Douala', region: 'Littoral', pays: 'Cameroun',
    statut: 'a_appeler', tentatives: 0, deadline: T + 7 * MIN + 12_000, clientCount: 1,
  },
  {
    id: '1667', numero: '#1667', client: 'Désiré Youckwatcheu', produit: 'Lunettes intelligentes',
    quantite: 1, prixUnitaire: 11900, total: 11900,
    telephone: '+237676663808', whatsapp: '237674328233',
    adresse: 'Yaoundé', region: 'Centre', pays: 'Cameroun',
    statut: 'a_rappeler', tentatives: 1, rappelAt: rappelToday(16, 0),
    rappelLieu: 'marché Ndogpassi', commentaire: 'il attend son salaire', clientCount: 3,
  },
  {
    id: '1663', numero: '#1663', client: 'Brice Brice', produit: '2pcs LED H7',
    quantite: 2, prixUnitaire: 6400, total: 12800,
    telephone: '+237694609436', whatsapp: '237694609436',
    adresse: 'Douala', region: 'Littoral', pays: 'Cameroun',
    statut: 'a_appeler', tentatives: 2, deadline: T - 4 * MIN, clientCount: 3,
  },
  {
    id: '1666', numero: '#1666', client: 'Marie Marie', produit: 'Lunettes intelligentes',
    quantite: 1, prixUnitaire: 11900, total: 11900,
    telephone: '+237675091940', whatsapp: '237675091940',
    adresse: 'Yaoundé', region: 'Centre', pays: 'Cameroun',
    statut: 'a_appeler', tentatives: 0, deadline: T + 2 * MIN + 30_000, clientCount: 1,
  },
  {
    id: '1668', numero: '#1668', client: 'Nassourou', produit: "L'Extension XXL",
    quantite: 1, prixUnitaire: 13900, total: 13900,
    telephone: '+237699870491', whatsapp: '237699870491',
    adresse: 'Yaoundé', region: 'Centre', pays: 'Cameroun',
    statut: 'a_appeler', tentatives: 0, deadline: T + 9 * MIN, clientCount: 1,
  },
  {
    id: '1670', numero: '#1670', client: 'Etienne Etienne', produit: '2pcs LED H7',
    quantite: 1, prixUnitaire: 6900, total: 6900,
    telephone: '+237679503434', whatsapp: '237679503434',
    adresse: 'Douala', region: 'Littoral', pays: 'Cameroun',
    statut: 'injoignable', tentatives: 2, commentaire: '2 fois', clientCount: 1,
  },
  {
    id: '1671', numero: '#1671', client: 'Hansel Hansel', produit: 'Lunettes auto-ajustables',
    quantite: 1, prixUnitaire: 9900, total: 9900,
    telephone: '+237678447474', whatsapp: '237678447474',
    adresse: 'Yaoundé', region: 'Centre', pays: 'Cameroun',
    statut: 'a_rappeler', tentatives: 1, rappelAt: rappelToday(17, 30),
    commentaire: 'il va me rappeler', clientCount: 1,
  },
  {
    id: '1672', numero: '#1672', client: 'Abdoul Abdoul', produit: "L'Extension XXL",
    quantite: 1, prixUnitaire: 13900, total: 13900,
    telephone: '+237693425621', whatsapp: '237693425621',
    adresse: 'Douala', region: 'Littoral', pays: 'Cameroun',
    statut: 'a_appeler', tentatives: 0, deadline: T + 5 * MIN, clientCount: 1,
  },
]

// Livraisons d'hier restees "en cours" — alimentent le sas du matin.
export const LIVRAISONS: Order[] = [
  {
    id: 'L1', numero: '#1655', client: 'Jean Mbarga', produit: "L'Extension XXL",
    quantite: 1, prixUnitaire: 13900, total: 13900,
    telephone: '+237690112233', whatsapp: '237690112233',
    adresse: 'Douala', region: 'Littoral', pays: 'Cameroun', statut: 'livraison', tentatives: 0,
  },
  {
    id: 'L2', numero: '#1658', client: 'Aïcha B.', produit: 'Lunettes intelligentes',
    quantite: 1, prixUnitaire: 11900, total: 11900,
    telephone: '+237677889900', whatsapp: '237677889900',
    adresse: 'Yaoundé', region: 'Centre', pays: 'Cameroun', statut: 'livraison', tentatives: 0,
  },
  {
    id: 'L3', numero: '#1661', client: 'Paul N.', produit: '2pcs LED H7',
    quantite: 2, prixUnitaire: 6400, total: 12800,
    telephone: '+237695443322', whatsapp: '237695443322',
    adresse: 'Douala', region: 'Littoral', pays: 'Cameroun', statut: 'livraison', tentatives: 0,
  },
]
