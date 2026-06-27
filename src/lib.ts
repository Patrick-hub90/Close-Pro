import { useEffect, useState } from 'react'
import type { Order, FiltreId } from './types'

/** Re-render chaque seconde pour animer les comptes a rebours. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function fcfa(n: number, short = true): string {
  const v = Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')
  return short ? `${v} F` : `${v} FCFA`
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** Décompte au format hh:mm:ss. */
export function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Heures de travail : l'instant 'now' est-il dans la plage [debut, fin] (HH:MM) ? */
export function isWorkingNow(horaires: { debut?: string; fin?: string } | null | undefined, now: number): boolean {
  if (!horaires?.debut || !horaires?.fin) return true // pas d'horaires définis = toujours actif
  const d = new Date(now)
  const cur = d.getHours() * 60 + d.getMinutes()
  const [hd, md] = horaires.debut.split(':').map(Number)
  const [hf, mf] = horaires.fin.split(':').map(Number)
  const deb = hd * 60 + (md || 0)
  const fin = hf * 60 + (mf || 0)
  return fin > deb ? cur >= deb && cur < fin : cur >= deb || cur < fin
}

export function hm(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function telLink(num: string): string {
  return `tel:${num.replace(/[^\d+]/g, '')}`
}

export function waLink(num: string, text?: string): string {
  const digits = num.replace(/\D/g, '')
  const q = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${digits}${q}`
}

/** Heure de rappel = aujourd'hui a h:m (ms epoch). */
export function rappelToday(h: number, m: number): number {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

const TERMINAUX: Order['statut'][] = ['livre', 'annule', 'refuse']
// Confirmée / en livraison : pipeline de livraison (revue le matin), plus dans les appels.
const LIVRAISON_PIPELINE: Order['statut'][] = ['confirme', 'livraison']

export function isLate(o: Order, now: number): boolean {
  if (TERMINAUX.includes(o.statut) || LIVRAISON_PIPELINE.includes(o.statut)) return false
  if (o.rappelAt && now > o.rappelAt) return true
  if (o.deadline && o.statut === 'a_appeler' && !o.rappelAt && now > o.deadline) return true
  return false
}

// Statuts qui portent un horaire visible dans « Rappels » : à rappeler, injoignable, reporté.
const PLANIFIES: Order['statut'][] = ['a_rappeler', 'injoignable', 'reporte']

export function matchFiltre(o: Order, f: FiltreId, now: number, working = true): boolean {
  if (TERMINAUX.includes(o.statut)) return f === 'toutes'
  if (LIVRAISON_PIPELINE.includes(o.statut)) return f === 'livraisons' || f === 'toutes'
  switch (f) {
    case 'a_appeler': return (o.statut === 'a_appeler' || o.statut === 'injoignable') && !o.rappelAt
    // Un rappel n'apparaît dans "Rappels" que tant que l'heure n'est pas passée.
    // Une fois l'heure dépassée il bascule dans "En retard".
    case 'rappels': return !!o.rappelAt && now < o.rappelAt && PLANIFIES.includes(o.statut)
    case 'retard': return working && isLate(o, now)
    case 'livraisons': return false
    case 'discussion': return o.statut === 'whatsapp'
    case 'toutes': return true
    case 'archivees': return false
  }
}

/** Tri par urgence : retard d'abord, puis echeance la plus proche. */
export function byUrgence(now: number) {
  return (a: Order, b: Order) => urgenceKey(a, now) - urgenceKey(b, now)
}
function urgenceKey(o: Order, now: number): number {
  const due = o.rappelAt ?? o.deadline ?? now + 36e5
  return due
}
