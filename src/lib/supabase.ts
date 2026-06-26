import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseEnabled = Boolean(url && key)
export const supabase: SupabaseClient | null = supabaseEnabled ? createClient(url!, key!) : null

export interface Agent {
  id: string
  role: 'owner' | 'closer'
  nom: string
  pays: string | null
}

/** Récupère la fiche agent (rôle, pays) liée au compte connecté. */
export async function getAgent(authUid: string): Promise<Agent | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('agents')
    .select('id, role, nom, pays')
    .eq('auth_uid', authUid)
    .maybeSingle()
  return (data as Agent) ?? null
}
