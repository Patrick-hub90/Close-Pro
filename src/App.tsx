import { useState } from 'react'
import CloseuseApp from './CloseuseApp'
import OwnerApp from './OwnerApp'

type Role = 'closeuse' | 'owner'

export default function App() {
  const [role, setRole] = useState<Role>('closeuse')

  return role === 'owner' ? (
    <OwnerApp onSwitchRole={() => setRole('closeuse')} />
  ) : (
    <CloseuseApp onSwitchRole={() => setRole('owner')} />
  )
}
