import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Shipping from './Shipping.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Shipping />
  </StrictMode>,
)
