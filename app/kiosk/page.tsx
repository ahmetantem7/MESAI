import { Suspense } from 'react'
import KioskClient from './KioskClient'

export default function KioskPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Yükleniyor…</div>}>
      <KioskClient />
    </Suspense>
  )
}
