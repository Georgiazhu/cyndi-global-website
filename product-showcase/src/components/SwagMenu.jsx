import { useRef, useState, useLayoutEffect } from 'react'
import { swagCategories, swagItemLinks } from '../cyndi/menuData'

// Stroke-icon helper. Multi-subpath strings are split on each "M" (moveto) command.
function Icon({ d, className = 'w-[19px] h-[19px]' }) {
  const parts = d.split(/(?=M)/).map(s => s.trim()).filter(Boolean)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {parts.map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

// Swag 两级目录面板（从 cyndi 的 SwagMega 移植）：
// 一级品类横排常显；点击某个品类后，在其下方显示该品类的二级项。
// 由 Navbar 的 "All Products" 触发展开/收起。
export default function SwagMenu({ onNavigate }) {
  const btnRefs = useRef([])
  const [activeCat, setActiveCat] = useState(null) // 一级品类索引或 null
  const [stageLeft, setStageLeft] = useState(0)
  const inStage = activeCat !== null
  const cat = inStage ? swagCategories[activeCat] : null

  // 二级面板与被点击的一级品类按钮对齐
  useLayoutEffect(() => {
    if (activeCat !== null && btnRefs.current[activeCat]) {
      setStageLeft(btnRefs.current[activeCat].offsetLeft)
    }
  }, [activeCat])

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-full mt-px bg-[#faf9f6] border border-stone-200 shadow-[0_20px_50px_rgba(0,0,0,0.12)]"
      style={{ width: 1280, maxWidth: 'calc(100vw - 48px)', padding: '24px 28px' }}
    >
      {/* Level 1: category row (single row, evenly split) */}
      <div className="flex gap-1">
        {swagCategories.map((c, i) => (
          <button
            key={c.name}
            ref={el => (btnRefs.current[i] = el)}
            onClick={() => setActiveCat(i === activeCat ? null : i)}
            className={`group flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-[15px] font-semibold transition-colors ${
              i === activeCat ? 'bg-stone-200/70 text-stone-900' : 'text-stone-900 hover:bg-stone-200/50'
            }`}
          >
            <span className={`shrink-0 transition-colors group-hover:text-[#b7410e] ${i === activeCat ? 'text-[#b7410e]' : 'text-stone-500'}`}>
              <Icon d={c.icon} />
            </span>
            <span className="whitespace-nowrap">{c.name}</span>
          </button>
        ))}
      </div>

      {/* Level 2: sub-items for the selected category */}
      {inStage && (
        <div
          className="absolute top-full -mt-px bg-[#faf9f6] border border-stone-200 border-t-0 shadow-[0_20px_50px_rgba(0,0,0,0.12)] p-5"
          style={{
            left: Math.min(stageLeft, 1280 - 240 - 24),
            width: 240,
            maxWidth: 'calc(100% - 24px)',
          }}
        >
          <div className="flex flex-col gap-0.5">
            {cat.items.map(item => {
              const link = swagItemLinks[item]
              return (
                <a
                  key={item}
                  href={link || '#'}
                  onClick={() => onNavigate && onNavigate()}
                  className={`text-sm py-1 transition-colors ${
                    link ? 'text-stone-600 hover:text-[#b7410e]' : 'text-stone-400 cursor-default'
                  }`}
                >
                  {item}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
