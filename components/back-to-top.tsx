'use client'

import { useEffect, useState } from 'react'

const SHOW_THRESHOLD = 400 // 滚动超过 400px 才显示

/**
 * 返回顶部按钮：右下角固定，滚动超过阈值后淡入上滑，点击平滑回顶。
 * SSR 与首次客户端渲染都隐藏（避免 hydration mismatch），mount 后按滚动位置决定显隐。
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_THRESHOLD)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="返回顶部"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-6 right-6 z-30 flex h-10 w-10 items-center justify-center border border-border bg-card/80 font-mono text-lg text-muted-foreground backdrop-blur transition-all duration-200 hover:border-primary hover:text-primary ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      ↑
    </button>
  )
}

export default BackToTop
