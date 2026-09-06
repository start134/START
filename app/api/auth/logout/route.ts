import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'
import { auth } from '@/lib/auth'

const log = createLogger('api/auth/logout')

// 会话 token 是无状态签名的，登出只需清除 Cookie；
// 已签发 token 在过期前对持有者仍有效（见 lib/auth.ts 的取舍说明）。
export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete(auth.cookieName)
  log.debug('已登出，Cookie 已清除')
  return NextResponse.json({ ok: true })
}
