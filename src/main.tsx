import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css'
import './styles/app.css'
import App from './App.tsx'
import { registerPwaUpdates } from './pwaUpdate.ts'

registerPwaUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
