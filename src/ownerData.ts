// Donnees de demonstration cote proprietaire (Patrick).

export interface Closeuse {
  id: string
  nom: string
  initiales: string
  enLigne: boolean
  charge: number
  capacite: number
  score: number | null
  confiance: number | null
  livre: number | null
  forts: string[]
  apprentissage?: boolean
  ton: 'green' | 'amber' | 'gray'
}

export const PAYS_LISTE = [
  { code: 'CM', nom: 'Cameroun', devise: 'FCFA' },
  { code: 'CI', nom: "Côte d'Ivoire", devise: 'FCFA' },
  { code: 'SN', nom: 'Sénégal', devise: 'FCFA' },
]

export const CLOSEUSES: Closeuse[] = [
  { id: 'awa', nom: 'Awa N.', initiales: 'AW', enLigne: true, charge: 18, capacite: 30, score: 87, confiance: 72, livre: 64, forts: ['Lunettes', 'Yaoundé'], ton: 'green' },
  { id: 'bella', nom: 'Bella M.', initiales: 'BM', enLigne: true, charge: 22, capacite: 30, score: 74, confiance: 61, livre: 55, forts: ['LED', 'Douala'], ton: 'amber' },
  { id: 'carine', nom: 'Carine T.', initiales: 'CT', enLigne: true, charge: 9, capacite: 30, score: null, confiance: null, livre: null, forts: [], apprentissage: true, ton: 'gray' },
]

export const A_ATTRIBUER = 8

export const KPIS = [
  { l: 'Contact à temps', v: '82%', tone: 'green' },
  { l: 'En retard', v: '7', tone: 'red' },
  { l: 'Rappels manqués', v: '3', tone: 'amber' },
  { l: 'CA confirmé', v: '1,24 M', tone: 'plain' },
]

export const PAYS_STATS = [
  { nom: 'Cameroun', commandes: 96, aTemps: 84, tone: 'green' },
  { nom: "Côte d'Ivoire", commandes: 54, aTemps: 76, tone: 'amber' },
  { nom: 'Sénégal', commandes: 34, aTemps: 81, tone: 'green' },
]

export const CLASSEMENT = [
  { rang: 1, nom: 'Awa N.', ini: 'AW', s: 'à temps 91% · confirmées 72%', score: '87', ton: 'green' },
  { rang: 2, nom: 'Bella M.', ini: 'BM', s: 'à temps 78% · confirmées 61%', score: '74', ton: 'amber' },
  { rang: 3, nom: 'Carine T.', ini: 'CT', s: 'à temps 70% · apprentissage', score: '—', ton: 'gray' },
]
