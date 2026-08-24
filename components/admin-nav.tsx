'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/use-auth'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useEffect, useState, useCallback } from 'react'

const navItems = [
  { href: '/admin', label: '仪表盘', icon: '📊' },
  { href: '/admin/articles', label: '文章管理', icon: '📝' },
  { href: '/admin/new', label: '写文章', icon: '✍️' },
  { href: '/admin/notifications', label: '通知', icon: '🔔' },
]

export function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { authed, loading, logout } = useAuth()
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnreadCount = useCallback(async () => {
    if (!authed) return
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setUnreadCount(data.unreadCount || 0)
      }
    } catch {
      // 忽略错误
    }
  }, [authed])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // 未登录则跳转登录页（但要等待加载完成，避免初始状态误判）
  useEffect(() => {
    if (loading) return
    if (!authed && pathname !== '/admin/login') {
      router.push('/admin/login')
    }
  }, [authed, loading, pathname, router])

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const onLogoutClick = () => {
    setLogoutConfirmOpen(true)
  }

  const onConfirmLogout = async () => {
    setLogoutLoading(true)
    try {
      await logout()
      setLogoutConfirmOpen(false)
      router.push('/admin/login')
    } finally {
      setLogoutLoading(false)
    }
  }

  // 加载中或未登录（非登录页）时不显示导航
  if (loading) {
    return null
  }
  
  if (!authed && pathname !== '/admin/login') {
    return null
  }

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center justify-center border-b border-border">
          <Link href="/admin" className="font-mono text-xl tracking-[0.18em] text-foreground">
            START<span className="text-primary">.</span>
            <span className="ml-2 text-xs text-muted-foreground">后台</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive(item.href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
              {item.href === '/admin/notifications' && unreadCount > 0 && (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {unreadCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <div className="mb-4 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">管理员</p>
            <p>你好，START</p>
          </div>
          <Link
            href="/"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-primary hover:text-primary mb-2"
          >
            返回首页
          </Link>
          <button
            onClick={onLogoutClick}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-destructive hover:text-destructive"
          >
            退出登录
          </button>
        </div>
      </aside>

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="确认退出登录"
        description="退出后需要重新登录才能继续使用后台管理功能。"
        confirmText={logoutLoading ? '退出中...' : '退出登录'}
        variant="danger"
        loading={logoutLoading}
        onConfirm={onConfirmLogout}
        onCancel={() => !logoutLoading && setLogoutConfirmOpen(false)}
      />
    </>
  )
}
