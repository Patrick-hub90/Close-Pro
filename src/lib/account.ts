import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Change le mot de passe de l'utilisateur connecté. */
export async function changePassword(newPassword: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré' }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return error ? { error: error.message } : {}
}

/**
 * Crée un compte closeuse (réservé au propriétaire).
 * Utilise un client jetable pour signUp afin de NE PAS déconnecter le propriétaire,
 * puis crée la fiche `agents`. (Confirmation email à désactiver côté Supabase.)
 */
export async function createCloseuse(p: {
  nom: string; email: string; password: string; pays: string
}): Promise<{ error?: string }> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key || !supabase) return { error: 'Supabase non configuré' }

  const tmp = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await tmp.auth.signUp({ email: p.email.trim(), password: p.password })
  if (error) return { error: error.message }
  const uid = data.user?.id
  if (!uid) return { error: 'Compte non créé — désactive la confirmation email dans Supabase.' }

  const { error: e2 } = await supabase
    .from('agents')
    .insert({ auth_uid: uid, role: 'closer', nom: p.nom.trim(), pays: p.pays })
  if (e2) return { error: 'Compte créé mais fiche agent en échec : ' + e2.message }
  return {}
}
