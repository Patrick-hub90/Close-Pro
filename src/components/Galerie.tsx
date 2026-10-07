import { useEffect, useRef, useState } from 'react'
import { listerMedias, ajouterMedias, supprimerMedia, preparerFichier, peutPartager, tailleLisible, type Media } from '../lib/galerie'

/**
 * Galerie de médias de l'équipe.
 *  - mode « gestion » (onglet Moi) : ajouter / supprimer des photos et vidéos.
 *  - mode « envoi » (fiche commande) : choisir un média et l'envoyer au client par WhatsApp.
 * L'envoi se fait en 2 temps (préparer puis envoyer) : le partage natif exige un geste récent
 * de l'utilisateur, qu'un long téléchargement ferait expirer.
 */
export default function Galerie({ mode, waNum, onClose }: {
  mode: 'gestion' | 'envoi'
  waNum?: string          // numéro WhatsApp du client (chiffres avec indicatif), pour l'envoi en lien
  onClose?: () => void
}) {
  const [medias, setMedias] = useState<Media[]>([])
  const [chargement, setChargement] = useState(true)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [choix, setChoix] = useState<Media | null>(null)
  const [fichier, setFichier] = useState<File | null>(null)
  const [preparation, setPreparation] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const cache = useRef(new Map<string, File>())

  async function charger() {
    setChargement(true)
    setMedias(await listerMedias())
    setChargement(false)
  }
  useEffect(() => { void charger() }, [])

  async function onFichiers(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setEnvoiEnCours(true); setErreur(null)
    const err = await ajouterMedias(files)
    setEnvoiEnCours(false)
    if (err) setErreur(err)
    await charger()
  }

  async function supprimer(m: Media) {
    if (!window.confirm(`Supprimer « ${m.nom} » de la galerie ?`)) return
    const err = await supprimerMedia(m.path)
    if (err) setErreur(err.includes('row-level') ? 'Seul le propriétaire ou la personne qui l\'a ajouté peut le supprimer.' : err)
    await charger()
  }

  async function choisir(m: Media) {
    if (mode !== 'envoi') return
    setChoix(m); setErreur(null)
    const deja = cache.current.get(m.path)
    if (deja) { setFichier(deja); return }
    setFichier(null); setPreparation(true)
    try {
      const f = await preparerFichier(m)
      cache.current.set(m.path, f)
      setFichier(f)
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setPreparation(false)
    }
  }

  async function envoyerFichier() {
    if (!fichier || !choix) return
    if (!peutPartager(fichier)) { envoyerLien(); return }
    try {
      await navigator.share({ files: [fichier] })
      onClose?.()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErreur('Partage impossible sur ce téléphone — utilise « Envoyer en lien ».')
    }
  }

  function envoyerLien() {
    if (!choix) return
    window.open(`https://wa.me/${waNum ?? ''}?text=${encodeURIComponent(choix.url)}`, '_blank')
    onClose?.()
  }

  return (
    <div className={`gal gal-${mode}`}>
      <div className="gal-top">
        <button type="button" className="gal-add" onClick={() => input.current?.click()} disabled={envoiEnCours}>
          <i className="ti ti-photo-plus" aria-hidden="true" /> {envoiEnCours ? 'Ajout en cours…' : 'Ajouter des photos / vidéos'}
        </button>
        <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={onFichiers} />
      </div>

      {erreur ? <div className="acct-err">{erreur}</div> : null}

      {chargement ? (
        <div className="gal-vide">Chargement…</div>
      ) : medias.length === 0 ? (
        <div className="gal-vide">Aucun média pour l'instant. Ajoute les photos et vidéos de tes produits : elles seront disponibles pour toute l'équipe.</div>
      ) : (
        <div className="gal-grid">
          {medias.map((m) => (
            <div key={m.path} className={`gal-item ${choix?.path === m.path ? 'on' : ''}`} onClick={() => choisir(m)}>
              {m.type === 'video'
                ? <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline />
                : <img src={m.url} alt={m.nom} loading="lazy" />}
              {m.type === 'video' ? <span className="gal-play"><i className="ti ti-player-play-filled" aria-hidden="true" /></span> : null}
              <span className="gal-nom">{m.nom}{m.taille ? ` · ${tailleLisible(m.taille)}` : ''}</span>
              {mode === 'gestion' ? (
                <button type="button" className="gal-del" onClick={(e) => { e.stopPropagation(); void supprimer(m) }} aria-label="Supprimer">
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {mode === 'envoi' ? (
        <div className="gal-actions">
          <div className="acct-hint">
            Astuce : ouvre d'abord la discussion avec le client (bouton WhatsApp), elle apparaîtra en premier dans la liste de partage.
          </div>
          <button type="button" className="gal-send" disabled={!fichier || preparation} onClick={envoyerFichier}>
            <i className="ti ti-brand-whatsapp" aria-hidden="true" />
            {!choix ? 'Choisis un média' : preparation ? 'Préparation…' : 'Envoyer sur WhatsApp'}
          </button>
          <button type="button" className="gal-link" disabled={!choix} onClick={envoyerLien}>
            <i className="ti ti-link" aria-hidden="true" /> Envoyer en lien au client
          </button>
        </div>
      ) : null}
    </div>
  )
}
