import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_NAME, validateSession } from '@/lib/session'

// 统一鉴权关卡（Next 16 的 proxy，即原 middleware，默认 Node.js runtime）：
// - /api/admin/*：未登录直接 401，杜绝"新增接口忘了加锁"这类漏洞
// - /admin/*（登录页除外）：未登录重定向到 /admin/login
// 各路由内部的 requireAuth 保留，作为第二道防线。
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(COOKIE_NAME)?.value

  if (pathname.startsWith('/api/admin')) {
    if (!validateSession(token)) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }
    return NextResponse.next()
  }

  if (pathname === '/admin/login') {
    return NextResponse.next()
  }

  if (!validateSession(token)) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/admin/:path*', '/admin/:path*'],
}
