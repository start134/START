'use client'

import { useEffect, useState } from 'react'

const THEME_KEY = 'start:theme'

/** 亮/暗主题切换：读写 localStorage 并切换 html 的 .dark class（默认暗色） */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null)

  // 挂载后同步真实状态（服务端无 localStorage）
  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* ignore */
    }
    setTheme(next)
  }

  const label = theme === 'light' ? '切换到暗色' : '切换到亮色'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      // 挂载前不渲染具体字符，避免服务端/客户端不一致
      className={`transition-colors hover:text-primary ${className}`}
    >
      {theme === null ? '◐' : theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}

export default ThemeToggle
