import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createLogger } from '@/lib/logger'
import { auth, validateSession } from '@/lib/auth'
import { deletePost, readPost, updatePost, type PostInput } from '@/lib/posts-store'

const log = createLogger('api/posts/[slug]')

type Ctx = { params: Promise<{ slug: string }> }

async function requireAuth(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(auth.cookieName)?.value
  if (!validateSession(token)) {
    log.warn('鉴权失败：未登录或会话已过期')
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  return null
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params
  log.info('收到请求：GET /api/posts/[slug]', { slug })
  try {
    const post = await readPost(slug)
    if (!post) {
      log.warn('响应：GET 未找到文章，返回 404', { slug })
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }
    log.info('响应：GET 文章查询成功', { slug, title: post.title })
    return NextResponse.json(post)
  } catch (err) {
    log.error('GET /api/posts/[slug] 处理失败', { slug, error: String(err) })
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params
  log.info('收到请求：PATCH /api/posts/[slug]', { slug })
  const authErr = await requireAuth()
  if (authErr) return authErr
  let body: PostInput
  try {
    body = (await request.json()) as PostInput
  } catch (err) {
    log.warn('PATCH 请求体解析失败', { slug, error: String(err) })
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }
  try {
    const updated = await updatePost(slug, body)
    if (!updated) {
      log.warn('响应：PATCH 未找到文章，返回 404', { slug })
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }
    log.info('响应：PATCH 文章更新成功', { slug, title: updated.title, postStatus: updated.status })
    return NextResponse.json(updated)
  } catch (err) {
    log.error('PATCH /api/posts/[slug] 处理失败', { slug, error: String(err) })
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params
  log.info('收到请求：DELETE /api/posts/[slug]', { slug })
  const authErr = await requireAuth()
  if (authErr) return authErr
  try {
    const ok = await deletePost(slug)
    if (!ok) {
      log.warn('响应：DELETE 未找到文章，返回 404', { slug })
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }
    log.info('响应：DELETE 删除成功，返回 204', { slug })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    log.error('DELETE /api/posts/[slug] 处理失败', { slug, error: String(err) })
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
