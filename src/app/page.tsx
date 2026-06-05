'use client'

import { useState } from 'react'
import { hospitals } from '@/data/hospitals'
import type { AppMode } from '@/types'
import HospitalPicker from '@/components/HospitalPicker'
import Home from '@/components/Home'
import FindResources from '@/components/FindResources'
import GetAssistance from '@/components/GetAssistance'

export default function Page() {
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(hospitals[0].id)
  const [mode, setMode] = useState<AppMode>('home')

  const selectedHospitalName = hospitals.find((h) => h.id === selectedHospitalId)?.name ?? ''

  return (
    <>
      <HospitalPicker
        hospitals={hospitals}
        selectedId={selectedHospitalId}
        onChange={setSelectedHospitalId}
      />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {mode === 'home' && (
          <Home
            hospitalName={selectedHospitalName}
            onNavigate={setMode}
          />
        )}
        {mode === 'find' && (
          <FindResources
            hospitalId={selectedHospitalId}
            hospitalName={selectedHospitalName}
            onBack={() => setMode('home')}
          />
        )}
        {mode === 'assist' && (
          <GetAssistance
            hospitalName={selectedHospitalName}
            onBack={() => setMode('home')}
          />
        )}
      </main>
    </>
  )
}
