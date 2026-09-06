import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import {
  deletePost,
  isPublishedPost,
  purgePost,
  readPost,
  updatePost,
  type PostInput,
} from '@/lib/posts-store'

const log = createLogger('api/posts/[slug]')

type Ctx = { params: Promise<{ slug: string }> }

async function requireAuth(): Promise<NextResponse | null> {
  if (!(await isAuthenticatedRequest())) {
    log.warn('鉴权失败：未登录或会话已过期')
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  return null
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params
  log.debug('收到请求：GET /api/posts/[slug]', { slug })
  try {
    const post = await readPost(slug)
    if (!post) {
      log.warn('响应：GET 未找到文章，返回 404', { slug })
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }
    // 草稿对未登录请求一律 404，与文章详情页行为一致
    if (!isPublishedPost(post) && !(await isAuthenticatedRequest())) {
      log.warn('非管理员请求草稿，返回 404', { slug })
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }
    log.debug('响应：GET 文章查询成功', { slug, title: post.title })
    return NextResponse.json(post)
  } catch (err) {
    log.error('GET /api/posts/[slug] 处理失败', { slug, error: String(err) })
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params
  log.debug('收到请求：PATCH /api/posts/[slug]', { slug })
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

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params
  // 默认软删除（进回收站）；?purge=1 彻底删除（仅回收站文章）
  const purge = request.nextUrl.searchParams.get('purge') === '1'
  log.debug('收到请求：DELETE /api/posts/[slug]', { slug, purge })
  const authErr = await requireAuth()
  if (authErr) return authErr
  try {
    const ok = purge ? await purgePost(slug) : await deletePost(slug)
    if (!ok) {
      const message = purge ? '文章不在回收站中' : '文章不存在'
      log.warn('响应：DELETE 未生效', { slug, purge, message })
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }
    log.info('响应：DELETE 成功', { slug, purge })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    log.error('DELETE /api/posts/[slug] 处理失败', { slug, error: String(err) })
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
