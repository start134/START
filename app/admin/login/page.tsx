'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import { useAuth } from '@/components/use-auth'
import { ConfirmDialog } from '@/components/confirm-dialog'

export default function AdminLogin() {
  const router = useRouter()
  const t = useToast()
  const { authed } = useAuth()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  // 如果已登录，直接跳转到仪表盘
  useEffect(() => {
    if (authed) router.replace('/admin')
  }, [authed, router])

  if (authed) return null

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) {
      t.error({ title: '请输入密码' })
      return
    }
    setSubmitting(true)
    // 只有失败时才把按钮解锁：成功后会走 600ms 的跳转延迟，
    // 若此时解锁，用户可以在这段时间里重复提交登录请求。
    let ok = false
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = (body as { error?: string }).error || '登录失败'
        t.error({ title: msg })
        return
      }
      ok = true
      t.success({ title: '登录成功', description: '正在跳转...' })
      setTimeout(() => {
        router.replace('/admin')
        router.refresh()
      }, 600)
    } catch {
      t.error({ title: '网络错误，请稍后重试' })
    } finally {
      if (!ok) setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium tracking-tight">START 后台管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            请输入管理员密码登录
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="password" className="sr-only">
              管理员密码
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="管理员密码"
              className="w-full rounded-md border border-border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              忘记密码？
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← 返回前台
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={forgotOpen}
        title="找回密码"
        description={
          '管理员密码存储在服务器的 .env.local 文件中。\n\n如果您忘记了密码，请在服务器上找到 .env.local 文件，修改 ADMIN_PASSWORD 变量为您的新密码，然后重启服务即可。'
        }
        confirmText="知道了"
        cancelText="关闭"
        onConfirm={() => setForgotOpen(false)}
        onCancel={() => setForgotOpen(false)}
      />
    </div>
  )
}
