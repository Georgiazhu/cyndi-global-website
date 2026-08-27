import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import CyndiApp from './CyndiApp.jsx'

createRoot(document.getElementById('cyndi-root')).render(
  <StrictMode>
    <CyndiApp />
  </StrictMode>,
)
