import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Warehousing from './Warehousing.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Warehousing />
  </StrictMode>,
)
