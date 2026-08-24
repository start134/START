'use client'

import { AdminNav } from '@/components/admin-nav'
import { SiteNav } from '@/components/site-nav'
import { useAuth } from '@/components/use-auth'
import { usePathname } from 'next/navigation'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { authed, loading } = useAuth()
  const pathname = usePathname()
  const isLoginPage = pathname === '/admin/login'

  // 如果是登录页，不显示侧边栏，使用全屏布局
  if (isLoginPage) {
    return <div className="min-h-screen bg-background">{children}</div>
  }

  // 加载中时不显示内容，避免闪动
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-background">
      {authed && <AdminNav />}
      <main className={`flex-1 ${authed ? 'ml-64' : ''}`}>
        <SiteNav />
        <div className="min-h-screen p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
