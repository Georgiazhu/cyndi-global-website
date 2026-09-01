import { createContext, useContext } from 'react'
import { useProducts } from '../hooks/useProducts'

const ProductsContext = createContext(null)

export function ProductsProvider({ children }) {
  const value = useProducts()
  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>
}

export function useProductsContext() {
  const ctx = useContext(ProductsContext)
  if (!ctx) throw new Error('useProductsContext must be used within ProductsProvider')
  return ctx
}
