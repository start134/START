import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'
import { auth, revokeSession, validateSession } from '@/lib/auth'

const log = createLogger('api/auth/logout')

export async function POST() {
  log.info('收到登出请求')
  const cookieStore = await cookies()
  const token = cookieStore.get(auth.cookieName)?.value
  if (token && validateSession(token)) {
    revokeSession(token)
  }
  cookieStore.delete(auth.cookieName)
  log.info('已登出，Cookie 已清除')
  return NextResponse.json({ ok: true })
}
