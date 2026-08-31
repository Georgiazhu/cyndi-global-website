import { createContext, useContext, useState } from 'react'

// 顶部搜索框与商品列表共享搜索词：Navbar 写入，Products 读取过滤。
const SearchContext = createContext()

export function SearchProvider({ children }) {
  const [query, setQuery] = useState('')
  return (
    <SearchContext.Provider value={{ query, setQuery }}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearch() {
  return useContext(SearchContext)
}
