'use client'

import Link from 'next/link'
import { useAuth } from '@/components/use-auth'

export function SiteFooter() {
  const { authed } = useAuth()
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <p className="font-mono text-xs tracking-[0.18em] text-foreground">
          START<span className="text-primary">.</span>
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          © 2026 START · 用文字记录正在发生的事
        </p>
        <nav className="flex flex-wrap gap-5 text-xs text-muted-foreground" aria-label="页脚导航">
          <Link href="/articles" className="transition-colors hover:text-primary">
            文章
          </Link>
          {authed && (
            <Link href="/new" className="transition-colors hover:text-primary">
              写文章
            </Link>
          )}
          <Link href="/about" className="transition-colors hover:text-primary">
            关于
          </Link>
          <Link href="/contact" className="transition-colors hover:text-primary">
            联系
          </Link>
        </nav>
      </div>
    </footer>
  )
}
