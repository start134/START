import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'
import { auth, validateSession } from '@/lib/auth'

const log = createLogger('api/auth/me')

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(auth.cookieName)?.value
  const authed = validateSession(token)
  log.debug('会话状态查询', { authed: !!authed })
  return NextResponse.json({ authed })
}
