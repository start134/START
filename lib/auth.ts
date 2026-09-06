// 服务端鉴权入口（route handler / RSC 使用）：
// 纯令牌逻辑在 lib/session.ts（proxy.ts 也从那里引用）；
// 这里只补充依赖 next/headers 的请求级助手。
// 禁止在客户端组件直接 import。
import { cookies } from 'next/headers'
import {
  COOKIE_NAME,
  sessionCookieOptions,
  validateSession,
} from '@/lib/session'

export {
  COOKIE_NAME,
  isAdminPasswordConfigured,
  issueSession,
  validateSession,
  verifyAdminPassword,
} from '@/lib/session'

export const auth = {
  cookieName: COOKIE_NAME,
  cookieOptions: sessionCookieOptions,
}

// 供 route handler / RSC 统一判断当前请求是否已登录
export async function isAuthenticatedRequest(): Promise<boolean> {
  const cookieStore = await cookies()
  return validateSession(cookieStore.get(COOKIE_NAME)?.value)
}
