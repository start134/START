import { NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import { readAllPosts } from '@/lib/posts-store'
import { readAllComments } from '@/lib/comments-store'
import { readAllNotifications } from '@/lib/notifications-store'
import { readJSON } from '@/lib/storage'

const log = createLogger('api/admin/export')

// 数据导出（仅管理员）：把全部 JSON 数据打包成一个备份文件下载。
// 配套的导入接口是 /api/admin/import。
export async function GET() {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  try {
    const [posts, comments, notifications] = await Promise.all([
      readAllPosts({ includeDeleted: true }),
      readAllComments(),
      readAllNotifications(),
    ])

    // stats.json 单独读取并单独兜底。
    // readJSON 现在遇到内容损坏会抛错（避免空数据回写覆盖），但备份不该因为一个分区
    // 读不出来就整体失败——那反而丢掉了把 posts/comments 抢救出来的机会。
    // 代价是必须把降级显式写进 warnings，杜绝"备份看起来完整、其实统计全丢"的静默降级。
    let stats: unknown = null
    const warnings: string[] = []
    try {
      stats = await readJSON<unknown>('stats.json')
    } catch (err) {
      warnings.push(`stats.json 读取失败，本次备份未包含统计数据：${String(err)}`)
      log.error('导出时读取 stats.json 失败，已降级导出', { error: String(err) })
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      posts,
      comments,
      notifications,
      stats,
      ...(warnings.length > 0 ? { warnings } : {}),
    }

    const date = new Date().toISOString().slice(0, 10)
    log.info('数据导出成功', {
      posts: posts.length,
      comments: comments.length,
      notifications: notifications.length,
      statsIncluded: stats !== null,
      warnings: warnings.length,
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
