// 客户端认证 hook：查询 /api/auth/me（HttpOnly Cookie 自动被浏览器带上），
// 提供登录态 + 登出方法，在各受保护页面与导航栏复用。

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type AuthState = {
  authed: boolean
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

export function useAuth(): AuthState {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      const body = (await res.json()) as { authed?: boolean }
      setAuthed(!!body.authed)
    } catch {
      setAuthed(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setAuthed(false)
      router.refresh()
    }
  }, [router])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  return { authed, loading, refresh, logout }
}
