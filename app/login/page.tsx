'use client'

import { Suspense, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useToast, type ToastVariant } from '@/components/toast'

function LoginContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const t = useToast()
  const redirect = sp.get('next') || '/'
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 兼容新旧两种 useToast 结构：优先调用 success/error/info 快捷方法，
  // 否则退回 toast({ variant })。防止 HMR 缓存导致一侧新一侧旧时报 "toast.error is not a function"
  const showToast = (
    variant: ToastVariant,
    input: { title: string; description?: string; durationMs?: number }
  ) => {
    try {
      if (variant === 'success' && typeof t.success === 'function') return t.success(input)
      if (variant === 'error' && typeof t.error === 'function') return t.error(input)
      if (variant === 'info' && typeof t.info === 'function') return t.info(input)
      if (typeof t.toast === 'function') return t.toast({ ...input, variant })
    } catch {
      /* 极端场景兜底：失败也不能影响主流程 */
    }
    return ''
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!password) {
      showToast('error', { title: '请输入密码' })
      return
    }
    setSubmitting(true)
    let statusOk = false
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = (body as { error?: string }).error || '登录失败'
        setError(msg)
        showToast('error', { title: msg })
        return
      }
      statusOk = true
      showToast('success', { title: '登录成功', description: '正在跳转…' })
      // 等 toast 展示一点再跳，避免一闪而过
      setTimeout(() => {
        router.replace(redirect.startsWith('/') ? redirect : '/')
        router.refresh()
      }, 600)
    } catch (err) {
      const msg = '网络错误，请稍后重试'
      setError(msg)
      showToast('error', { title: msg })
    } finally {
      if (!statusOk) setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-md px-6 py-24 lg:px-8 lg:py-32">
      <p className="font-mono text-xs tracking-[0.2em] text-primary">管理员登录</p>
      <h1 className="mt-3 text-3xl tracking-tight">请输入访问密码</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        登录后可发布、编辑、删除文章。
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
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
            className="w-full border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
          />
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full border border-border px-3 py-2 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>

      <p className="mt-8 text-xs text-muted-foreground">
        忘记密码？请在服务器环境变量 <span className="font-mono">ADMIN_PASSWORD</span> 中查看或修改。
      </p>
    </section>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  )
}

function LoginFallback() {
  return (
    <section className="mx-auto max-w-md px-6 py-24 lg:px-8 lg:py-32">
      <p className="font-mono text-xs tracking-[0.2em] text-primary">管理员登录</p>
      <h1 className="mt-3 text-3xl tracking-tight">请输入访问密码</h1>
      <div className="mt-8 h-10 w-full animate-pulse bg-border" />
    </section>
  )
}
