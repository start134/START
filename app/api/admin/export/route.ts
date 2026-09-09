import { NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import { readAllPosts } from '@/lib/posts-store'
import { readAllComments } from '@/lib/comments-store'
import { readAllNotifications } from '@/lib/notifications-store'
import { getDailyStats, getTotalViews } from '@/lib/kv-stats'
import { db } from '@/lib/db'

const log = createLogger('api/admin/export')

// 数据导出（仅管理员）：全部数据打包成一个 JSON 备份文件下载（格式与导入接口兼容）。
export async function GET() {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  try {
    const [posts, comments, notifications, daily, totalViews] = await Promise.all([
      readAllPosts({ includeDeleted: true }),
      readAllComments(),
      readAllNotifications(),
      getDailyStats(3650), // 覆盖全部历史（内部按天补零）
      getTotalViews(),
    ])

    // 单篇每日统计 → bySlug 结构（与旧版备份格式兼容）
    const slugRows = db()
      .prepare("SELECT date, slug, views FROM stats_daily WHERE slug != '' ORDER BY date ASC")
      .all() as { date: string; slug: string; views: number }[]
    const bySlug: Record<string, Record<string, number>> = {}
    for (const r of slugRows) {
      if (!bySlug[r.date]) bySlug[r.date] = {}
      bySlug[r.date][r.slug] = r.views
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      posts,
      comments,
      notifications,
      stats: {
        daily: daily.filter((d) => d.views > 0),
        totalViews,
        bySlug,
      },
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
