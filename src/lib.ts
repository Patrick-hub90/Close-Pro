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

export function isLate(o: Order, now: number): boolean {
  if (o.deadline && (o.statut === 'a_appeler') && now > o.deadline) return true
  if (o.rappelAt && o.statut === 'a_rappeler' && now > o.rappelAt) return true
  return false
}

export function matchFiltre(o: Order, f: FiltreId, now: number): boolean {
  if (TERMINAUX.includes(o.statut) || o.statut === 'livraison') return f === 'toutes'
  switch (f) {
    case 'a_appeler': return o.statut === 'a_appeler' || o.statut === 'injoignable'
    case 'rappels': return o.statut === 'a_rappeler'
    case 'retard': return isLate(o, now)
    case 'toutes': return true
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
