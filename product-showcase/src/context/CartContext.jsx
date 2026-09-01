import { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext()

const CART_KEY = 'swag_cart_v1'

// 初始化：从 localStorage 恢复购物车（跨页面/刷新不丢）
function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(loadCart)
  const [isCartOpen, setIsCartOpen] = useState(false)

  // cart 变化时写入 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart))
    } catch {
      // 忽略配额/隐私模式错误
    }
  }, [cart])

  // 购物车行的唯一键：优先 sku（同款不同色/码算不同行），回退 id
  const lineKey = (item) => item.sku || item.id

  const addToCart = (product, quantity = 1) => {
    const key = lineKey(product)
    setCart(prev => {
      const existing = prev.find(item => lineKey(item) === key)
      if (existing) {
        return prev.map(item =>
          lineKey(item) === key
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }
      return [...prev, { ...product, quantity }]
    })
  }

  const removeFromCart = (key) => {
    setCart(prev => prev.filter(item => lineKey(item) !== key))
  }

  const updateQuantity = (key, quantity) => {
    if (quantity <= 0) {
      removeFromCart(key)
      return
    }
    setCart(prev =>
      prev.map(item =>
        lineKey(item) === key ? { ...item, quantity } : item
      )
    )
  }

  const clearCart = () => setCart([])

  const cartTotal = cart.reduce(
    (sum, item) => sum + parseFloat(item.price[0]) * item.quantity,
    0
  )

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <CartContext.Provider
      value={{
        cart,
        isCartOpen,
        setIsCartOpen,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartTotal,
        cartCount,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  return useContext(CartContext)
}
