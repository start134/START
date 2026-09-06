// 进程内滑动窗口限流：登录失败锁定 + 评论提交频率两类用法。
// 注意：多实例部署时各实例独立计数（单管理员博客可接受，彻底方案需 Redis 等共享存储）。
// 键空间挂 globalThis：dev 下 Turbopack 会为 RSC 与 route handler 创建不同模块实例，
// 必须共享同一张表，否则限流形同虚设。

type Window = { count: number; resetAt: number }

const globalForRateLimit = globalThis as unknown as {
  __startRateLimitWindows?: Map<string, Window>
}
const windows =
  globalForRateLimit.__startRateLimitWindows ?? new Map<string, Window>()
if (!globalForRateLimit.__startRateLimitWindows) {
  globalForRateLimit.__startRateLimitWindows = windows
}

// 表过大时顺手清理过期窗口，避免长期运行内存缓慢增长
function pruneExpired(now: number): void {
  if (windows.size < 1000) return
  for (const [key, win] of windows) {
    if (now > win.resetAt) windows.delete(key)
  }
}

// 每次请求都计数：用于评论等公开写接口
export function hitRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()
  pruneExpired(now)
  const win = windows.get(key)
  if (!win || now > win.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }
  if (win.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((win.resetAt - now) / 1000)),
    }
  }
  win.count += 1
  return { ok: true, retryAfterSec: 0 }
}

// 只对失败计数：用于登录（成功登录不应被限流误伤）
export function checkFailureLimit(
  key: string,
  limit: number,
  _windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()
  const win = windows.get(key)
  if (!win || now > win.resetAt) return { ok: true, retryAfterSec: 0 }
  if (win.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((win.resetAt - now) / 1000)),
    }
  }
  return { ok: true, retryAfterSec: 0 }
}

export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now()
  pruneExpired(now)
  const win = windows.get(key)
  if (!win || now > win.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  win.count += 1
}

export function clearFailures(key: string): void {
  windows.delete(key)
}

// 反向代理（Vercel 等）下取真实客户端 IP
export function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
