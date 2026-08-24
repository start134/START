'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NowClock } from '@/components/now-clock'
import { useAuth } from '@/components/use-auth'
import { useToast } from '@/components/toast'
import { ConfirmDialog } from '@/components/confirm-dialog'

const links = [
  { href: '/', label: '首页' },
  { href: '/articles', label: '文章' },
  { href: '/about', label: '关于' },
  { href: '/contact', label: '联系' },
]

export function SiteNav() {
  const router = useRouter()
  const pathname = usePathname()
  const { authed, loading, logout } = useAuth()
  const t = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  // 切路由时自动关抽屉
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // ESC 关闭抽屉
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  // 抽屉打开时锁 body 滚动
  useEffect(() => {
    const prev = document.body.style.overflow
    if (menuOpen) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  const onLogoutClick = () => {
    setLogoutConfirmOpen(true)
  }

  const onConfirmLogout = async () => {
    setLogoutLoading(true)
    setMenuOpen(false)
    try {
      await logout()
      try {
        if (typeof t.success === 'function') t.success({ title: '已退出登录' })
        else if (typeof t.toast === 'function')
          t.toast({ variant: 'success', title: '已退出登录' })
      } catch {
        /* ignore */
      }
      setLogoutConfirmOpen(false)
      router.push('/')
      router.refresh()
    } finally {
      setLogoutLoading(false)
    }
  }

  const onLogoDoubleClick = () => {
    router.push('/admin/login')
  }

  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-7 lg:px-8">
      {/* 左：START. Logo + 时钟（一组品牌信息） */}
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <Link
          href="/"
          onDoubleClick={onLogoDoubleClick}
          className="flex-none font-mono text-xl tracking-[0.18em] text-foreground"
          aria-label="START 首页"
          title="双击进入后台"
        >
          START<span className="text-primary">.</span>
        </Link>
        <span className="hidden sm:inline font-mono text-xs font-light text-foreground/20" aria-hidden="true">
          ·
        </span>
        <div className="hidden min-w-0 sm:block" aria-label="当前日期时间">
          <NowClock inline />
        </div>
      </div>

      {/* 右：桌面端导航 + 移动端汉堡 */}
      <div className="flex flex-none items-center justify-end">
        <nav
          className="hidden flex-none items-center gap-6 text-sm text-muted-foreground sm:flex"
          aria-label="主导航"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? 'page' : undefined}
              className={
                isActive(l.href)
                  ? 'text-primary transition-colors'
                  : 'transition-colors hover:text-primary'
              }
            >
              {l.label}
            </Link>
          ))}
          {!loading && authed ? (
            <>
              <Link
                href="/admin"
                className="transition-colors hover:text-primary"
              >
                管理后台
              </Link>
              <button
                type="button"
                onClick={onLogoutClick}
                className="transition-colors hover:text-destructive"
              >
                退出
              </button>
            </>
          ) : null}
        </nav>

        {/* 移动端汉堡按钮 */}
        <button
          type="button"
          className="sm:hidden inline-flex h-9 w-9 items-center justify-center border border-border text-foreground transition-colors hover:border-primary hover:text-primary"
          aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span aria-hidden="true" className="text-base leading-none">
            {menuOpen ? '✕' : '☰'}
          </span>
        </button>
      </div>

      {/* 移动端抽屉 */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" id="mobile-menu" role="dialog" aria-modal="true" aria-label="移动端导航">
          <button
            type="button"
            aria-label="关闭菜单"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-3/4 max-w-xs border-l border-border bg-card p-6 shadow-2xl">
            <div className="mb-8 flex items-center justify-between">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="font-mono text-lg tracking-[0.18em] text-foreground"
              >
                START<span className="text-primary">.</span>
              </Link>
              <button
                type="button"
                aria-label="关闭菜单"
                onClick={() => setMenuOpen(false)}
                className="text-foreground transition-colors hover:text-primary"
              >
                ✕
              </button>
            </div>
            <nav className="flex flex-col text-base text-foreground" aria-label="移动端菜单">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  className={`border-b border-border py-4 ${
                    isActive(l.href)
                      ? 'text-primary'
                      : 'transition-colors hover:text-primary'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
              {!loading && authed ? (
                <>
                  <Link
                    href="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="border-b border-border py-4 transition-colors hover:text-primary"
                  >
                    管理后台
                  </Link>
                  <Link
                    href="/admin/new"
                    onClick={() => setMenuOpen(false)}
                    className="border-b border-border py-4 transition-colors hover:text-primary"
                  >
                    写文章
                  </Link>
                  <button
                    type="button"
                    onClick={onLogoutClick}
                    className="py-4 text-left text-destructive transition-colors hover:text-destructive/80"
                  >
                    退出登录
                  </button>
                </>
              ) : null}
            </nav>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="确认退出登录"
        description="退出后需要重新登录才能访问管理后台和文章编辑功能。"
        confirmText={logoutLoading ? '退出中...' : '退出登录'}
        variant="danger"
        loading={logoutLoading}
        onConfirm={onConfirmLogout}
        onCancel={() => !logoutLoading && setLogoutConfirmOpen(false)}
      />
    </header>
  )
}
