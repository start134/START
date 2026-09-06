import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import { readAllPosts } from '@/lib/posts-store'
import { readAllComments } from '@/lib/comments-store'
import { readAllNotifications } from '@/lib/notifications-store'

const log = createLogger('api/admin/export')

// 数据导出（仅管理员）：把全部 JSON 数据打包成一个备份文件下载。
// 配套的导入接口是 /api/admin/import。
export async function GET() {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  try {
    const [posts, comments, notifications, statsRaw] = await Promise.all([
      readAllPosts({ includeDeleted: true }),
      readAllComments(),
      readAllNotifications(),
      fs
        .readFile(path.join(process.cwd(), 'data', 'stats.json'), 'utf-8')
        .catch(() => null),
    ])

    let stats: unknown = null
    try {
      stats = statsRaw ? JSON.parse(statsRaw) : null
    } catch {
      stats = null
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      posts,
      comments,
      notifications,
      stats,
    }

    const date = new Date().toISOString().slice(0, 10)
    log.info('数据导出成功', {
      posts: posts.length,
      comments: comments.length,
      notifications: notifications.length,
    })
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="blog-export-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    log.error('数据导出失败', { error: String(err) })
    return NextResponse.json({ error: '导出失败' }, { status: 500 })
  }
}
