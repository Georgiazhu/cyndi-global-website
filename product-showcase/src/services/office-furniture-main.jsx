import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import OfficeFurniture from './OfficeFurniture.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <OfficeFurniture />
  </StrictMode>,
)
