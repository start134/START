import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import {
  createPost,
  isPublishedPost,
  promoteScheduledPosts,
  readAllPosts,
} from '@/lib/posts-store'
import { validatePostInput } from '@/lib/validation'

const log = createLogger('api/posts')

async function requireAuth(): Promise<NextResponse | null> {
  if (!(await isAuthenticatedRequest())) {
    log.warn('鉴权失败：未登录或会话已过期')
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  return null
}

export async function GET(request: NextRequest) {
  log.debug('收到请求：GET /api/posts')
  try {
    // 顺手把到点的定时文章转正 + 每天第一次访问时自动备份（都是纯读兜底，失败不阻塞）
    try {
      await promoteScheduledPosts()
    } catch (err) {
      log.warn('定时文章提升失败', { error: String(err) })
    }
    try {
      const { maybeRunDailyBackup } = await import('@/lib/backup')
      await maybeRunDailyBackup()
    } catch (err) {
      log.warn('自动备份触发失败', { error: String(err) })
    }
    const authed = await isAuthenticatedRequest()
    // 回收站内容仅管理员显式请求时返回
    const includeDeleted = authed && request.nextUrl.searchParams.get('includeDeleted') === '1'
    const posts = await readAllPosts({ includeDeleted })
    // 草稿/未到点定时文章只对管理员可见：未登录请求一律过滤
    const visible = authed ? posts : posts.filter((p) => isPublishedPost(p))
    log.debug('响应：GET /api/posts', { count: visible.length })
    return NextResponse.json(visible)
  } catch (err) {
    log.error('GET /api/posts 处理失败', { error: String(err) })
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  log.debug('收到请求：POST /api/posts')
  const authErr = await requireAuth()
  if (authErr) return authErr
  let body: unknown
  try {
    body = await request.json()
  } catch (err) {
    log.warn('POST /api/posts 请求体解析失败', { error: String(err) })
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  // 服务端校验：与编辑器同一套规则，拦下绕过前端的脏数据
  const result = validatePostInput(body, 'create')
  if (!result.ok) {
    log.warn('POST /api/posts 参数校验失败', { error: result.error })
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  try {
    const post = await createPost(result.value)
    log.info('响应：POST /api/posts 创建成功', { slug: post.slug, httpStatus: 201, postStatus: post.status })
    return NextResponse.json(post, { status: 201 })
  } catch (err) {
    log.error('POST /api/posts 创建失败', { error: String(err) })
    return NextResponse.json({ error: '创建失败' }, { status: 500 })
  }
}

