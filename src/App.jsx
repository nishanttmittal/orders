import { useState } from 'react'
import { runMigrations } from './core/db/migrations'
import AppShell from './app/AppShell'

runMigrations()

export default function App() {
  const [moduleId] = useState('orders')
  return <AppShell moduleId={moduleId} />
}
