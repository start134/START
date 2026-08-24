import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createLogger } from '@/lib/logger'
import { auth, validateSession } from '@/lib/auth'
import { createPost, readAllPosts, type PostInput } from '@/lib/posts-store'

const log = createLogger('api/posts')

async function requireAuth(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(auth.cookieName)?.value
  if (!validateSession(token)) {
    log.warn('鉴权失败：未登录或会话已过期')
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  return null
}

export async function GET() {
  log.info('收到请求：GET /api/posts')
  try {
    const posts = await readAllPosts()
    log.info('响应：GET /api/posts', { count: posts.length })
    return NextResponse.json(posts)
  } catch (err) {
    log.error('GET /api/posts 处理失败', { error: String(err) })
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  log.info('收到请求：POST /api/posts')
  const authErr = await requireAuth()
  if (authErr) return authErr
  let body: PostInput
  try {
    body = (await request.json()) as PostInput
  } catch (err) {
    log.warn('POST /api/posts 请求体解析失败', { error: String(err) })
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const content = (body.content ?? '').trim()
  const title = (body.title ?? '').trim()
  if (!title || !content) {
    log.warn('POST /api/posts 参数校验失败', { title: !!title, hasContent: !!content })
    return NextResponse.json({ error: '标题和正文不能为空' }, { status: 400 })
  }

  try {
    const post = await createPost(body)
    log.info('响应：POST /api/posts 创建成功', { slug: post.slug, httpStatus: 201, postStatus: post.status })
    return NextResponse.json(post, { status: 201 })
  } catch (err) {
    log.error('POST /api/posts 创建失败', { error: String(err) })
    return NextResponse.json({ error: '创建失败' }, { status: 500 })
  }
}

