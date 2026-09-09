import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import { writeJSON } from '@/lib/storage'
import { withFileLock } from '@/lib/storage'

const log = createLogger('api/admin/import')

type ImportPayload = {
  posts?: unknown
  comments?: unknown
  notifications?: unknown
  stats?: unknown
}

// 数据导入（仅管理员）：用导出的备份文件整体替换对应数据。
// 每个部分独立校验后写入，全部在文件锁内执行；导入是破坏性操作，UI 端需二次确认。
export async function POST(request: NextRequest) {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  let body: ImportPayload
  try {
    body = (await request.json()) as ImportPayload
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const imported: Record<string, number | boolean> = {}

  try {
    if (Array.isArray(body.posts)) {
      const posts = body.posts as Record<string, unknown>[]
      const valid = posts.every(
        (p) => typeof p.slug === 'string' && typeof p.title === 'string' && typeof p.content === 'string'
      )
      if (!valid) {
        return NextResponse.json({ error: 'posts 数据格式不正确' }, { status: 400 })
      }
      await withFileLock('posts.json', () => writeJSON('posts.json', posts))
      imported.posts = posts.length
    }

    if (Array.isArray(body.comments)) {
      await withFileLock('comments.json', () =>
        writeJSON('comments.json', body.comments)
      )
      imported.comments = body.comments.length
    }

    if (Array.isArray(body.notifications)) {
      await withFileLock('notifications.json', () =>
        writeJSON('notifications.json', body.notifications)
      )
      imported.notifications = body.notifications.length
    }

    if (body.stats && typeof body.stats === 'object') {
      const stats = body.stats as { daily?: unknown; totalViews?: unknown }
      if (!Array.isArray(stats.daily)) {
        return NextResponse.json({ error: 'stats 数据格式不正确' }, { status: 400 })
      }
      await withFileLock('stats.json', () => writeJSON('stats.json', body.stats))
      imported.stats = true
    }
  } catch (err) {
    log.error('数据导入失败', { error: String(err) })
    return NextResponse.json({ error: '导入失败：文件写入出错' }, { status: 500 })
  }

  if (Object.keys(imported).length === 0) {
    return NextResponse.json(
      { error: '备份文件中没有可导入的数据（需要 posts/comments/notifications/stats 至少一项）' },
      { status: 400 }
    )
  }

  log.info('数据导入成功', imported)
  return NextResponse.json({ ok: true, imported })
}
