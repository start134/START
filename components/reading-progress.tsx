'use client'

import { useEffect, useState } from 'react'

/**
 * 顶部阅读进度条：2px 细线 · primary 主色 · 平滑跟随滚动。
 * SSR 与首次客户端渲染都从 0% 开始，mount 后按滚动位置实时更新，无 hydration mismatch。
 */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const update = () => {
      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      const top = el.scrollTop || window.scrollY
      setProgress(max > 0 ? Math.min(1, Math.max(0, top / max)) : 0)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div className="fixed left-0 top-0 z-40 h-[2px] w-full" aria-hidden="true">
      <div
        className="h-full bg-primary transition-[width] duration-75 ease-out"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  )
}

export default ReadingProgress
