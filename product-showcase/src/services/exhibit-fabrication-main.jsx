import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import ExhibitFabrication from './ExhibitFabrication.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ExhibitFabrication />
  </StrictMode>,
)
