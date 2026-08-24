import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import { incrementRead } from '@/lib/posts-store'

// 阅读量 +1：公开接口，无需鉴权（5 分钟去重由前端 localStorage 保证）
const log = createLogger('api/posts/[slug]/view')

type Ctx = { params: Promise<{ slug: string }> }

export async function POST(_request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params
  log.info('收到请求：POST /api/posts/[slug]/view', { slug })
  try {
    const updated = await incrementRead(slug)
    if (!updated) {
      log.warn('响应：POST view 未找到文章，返回 404', { slug })
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }
    log.info('响应：POST view 成功', { slug, views: updated.views })
    return NextResponse.json(updated)
  } catch (err) {
    log.error('POST /api/posts/[slug]/view 处理失败', { slug, error: String(err) })
    // 阅读量失败不阻断读者，返回 200 + 原样（避免控制台报错）
    return NextResponse.json({ error: '计数失败' }, { status: 200 })
  }
}
