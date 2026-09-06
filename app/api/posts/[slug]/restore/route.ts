import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import { restorePost } from '@/lib/posts-store'

const log = createLogger('api/posts/[slug]/restore')

type Ctx = { params: Promise<{ slug: string }> }

// 从回收站恢复文章（仅管理员）
export async function POST(_request: NextRequest, ctx: Ctx) {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  const { slug } = await ctx.params
  try {
    const restored = await restorePost(slug)
    if (!restored) {
      return NextResponse.json({ error: '文章不在回收站中' }, { status: 404 })
    }
    log.info('文章已恢复', { slug })
    return NextResponse.json(restored)
  } catch (err) {
    log.error('文章恢复失败', { slug, error: String(err) })
    return NextResponse.json({ error: '恢复失败' }, { status: 500 })
  }
}
