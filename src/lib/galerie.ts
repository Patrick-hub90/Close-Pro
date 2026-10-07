import { supabase } from './supabase'

// Galerie de médias partagée par l'équipe (Supabase Storage, compartiment public « galerie »).
// Les médias sont ajoutés une fois, puis envoyés aux clients en un geste depuis la fiche commande.
const BUCKET = 'galerie'

export interface Media {
  path: string
  nom: string
  url: string
  type: 'image' | 'video'
  mime: string
  taille: number
}

function versMedia(path: string, mime?: string, taille?: number): Media {
  const m = mime || (/\.(mp4|mov|webm|m4v|3gp)$/i.test(path) ? 'video/mp4' : 'image/jpeg')
  return {
    path,
    nom: path.replace(/^\d+-/, ''),
    url: supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    type: m.startsWith('video') ? 'video' : 'image',
    mime: m,
    taille: taille ?? 0,
  }
}

export async function listerMedias(): Promise<Media[]> {
  if (!supabase) return []
  const { data, error } = await supabase.storage.from(BUCKET)
    .list('', { limit: 300, sortBy: { column: 'created_at', order: 'desc' } })
  if (error || !data) return []
  return data
    .filter((f) => f.id) // ignore les dossiers
    .map((f) => versMedia(f.name, (f.metadata as any)?.mimetype, (f.metadata as any)?.size))
}

/** Nom de fichier sûr pour le stockage (sans accents ni caractères spéciaux), préfixé pour l'unicité. */
function nomStockage(nom: string): string {
  const propre = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
  return `${Date.now()}-${propre || 'media'}`
}

/** Ajoute des fichiers à la galerie. Renvoie un message d'erreur, ou null si tout est passé. */
export async function ajouterMedias(files: File[]): Promise<string | null> {
  if (!supabase) return 'Connexion indisponible.'
  for (const f of files) {
    if (f.size > 50 * 1024 * 1024) return `« ${f.name} » dépasse 50 Mo.`
    const { error } = await supabase.storage.from(BUCKET)
      .upload(nomStockage(f.name), f, { contentType: f.type || undefined, upsert: false })
    if (error) return `« ${f.name} » : ${error.message}`
  }
  return null
}

export async function supprimerMedia(path: string): Promise<string | null> {
  if (!supabase) return 'Connexion indisponible.'
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  return error ? error.message : null
}

/** Télécharge le média et le transforme en fichier partageable (étape préalable au partage natif). */
export async function preparerFichier(m: Media): Promise<File> {
  const r = await fetch(m.url)
  if (!r.ok) throw new Error(`Téléchargement impossible (${r.status})`)
  const b = await r.blob()
  return new File([b], m.nom, { type: b.type || m.mime })
}

/** Le téléphone sait-il partager ce fichier vers une autre appli (WhatsApp) ? */
export function peutPartager(f: File): boolean {
  return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [f] })
}

export function tailleLisible(o: number): string {
  if (!o) return ''
  return o >= 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`
}
