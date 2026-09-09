import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import { db } from '@/lib/db'

const log = createLogger('api/admin/import')

type ImportPayload = {
  posts?: unknown
  comments?: unknown
  notifications?: unknown
  stats?: unknown
}

// 数据导入（仅管理员）：用导出的备份 JSON 整体替换对应表。
// 每个部分独立校验后在一个事务内替换；导入是破坏性操作，UI 端需二次确认。
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
  const conn = db()

  const importPosts = conn.transaction((posts: Record<string, unknown>[]) => {
    conn.prepare('DELETE FROM posts').run()
    const stmt = conn.prepare(`
      INSERT INTO posts (slug, date, category, title, excerpt, content, read, views, status, tags, publish_at, deleted_at, updated_at)
      VALUES (@slug, @date, @category, @title, @excerpt, @content, @read, @views, @status, @tags, @publish_at, @deleted_at, @updated_at)
    `)
    for (const p of posts) {
      stmt.run({
        slug: String(p.slug),
        date: String(p.date ?? ''),
        category: String(p.category ?? '未分类'),
        title: String(p.title ?? ''),
        excerpt: String(p.excerpt ?? ''),
        content: String(p.content ?? ''),
        read: String(p.read ?? '1 分钟'),
        views: Number(p.views ?? 0) || 0,
        status: String(p.status ?? 'published'),
        tags: Array.isArray(p.tags) ? JSON.stringify(p.tags) : null,
        publish_at: p.publishAt ? String(p.publishAt) : null,
        deleted_at: p.deletedAt ? String(p.deletedAt) : null,
        updated_at: p.updatedAt ? String(p.updatedAt) : null,
      })
    }
  })

  const importComments = conn.transaction((comments: Record<string, unknown>[]) => {
    conn.prepare('DELETE FROM comments').run()
    const stmt = conn.prepare(`
      INSERT INTO comments (id, post_slug, parent_id, name, email, content, created_at, status)
      VALUES (@id, @postSlug, @parentId, @name, @email, @content, @createdAt, @status)
    `)
    for (const c of comments) {
      stmt.run({
        id: String(c.id),
        postSlug: String(c.postSlug ?? ''),
        parentId: c.parentId ? String(c.parentId) : null,
        name: String(c.name ?? '匿名'),
        email: c.email ? String(c.email) : null,
        content: String(c.content ?? ''),
        createdAt: String(c.createdAt ?? new Date().toISOString()),
        status: String(c.status ?? 'pending'),
      })
    }
  })

  const importNotifications = conn.transaction((items: Record<string, unknown>[]) => {
    conn.prepare('DELETE FROM notifications').run()
    const stmt = conn.prepare(`
      INSERT INTO notifications (id, type, title, content, comment_id, post_slug, read, created_at)
      VALUES (@id, @type, @title, @content, @commentId, @postSlug, @read, @createdAt)
    `)
    for (const n of items) {
      stmt.run({
        id: String(n.id),
        type: String(n.type ?? 'system'),
        title: String(n.title ?? ''),
        content: String(n.content ?? ''),
        commentId: n.commentId ? String(n.commentId) : null,
        postSlug: n.postSlug ? String(n.postSlug) : null,
        read: n.read ? 1 : 0,
        createdAt: String(n.createdAt ?? new Date().toISOString()),
      })
    }
  })

  const importStats = conn.transaction((stats: {
    daily?: { date: string; views: number }[]
    totalViews?: number
    bySlug?: Record<string, Record<string, number>>
  }) => {
    conn.prepare('DELETE FROM stats_daily').run()
    const stmt = conn.prepare(`
      INSERT INTO stats_daily (date, slug, views) VALUES (?, ?, ?)
      ON CONFLICT(date, slug) DO UPDATE SET views = views + excluded.views
    `)
    for (const d of stats.daily ?? []) {
      if (!d?.date) continue
      stmt.run(d.date, '', Number(d.views) || 0)
    }
    for (const [date, bySlug] of Object.entries(stats.bySlug ?? {})) {
      for (const [slug, views] of Object.entries(bySlug)) {
        stmt.run(date, slug, Number(views) || 0)
      }
    }
    if (typeof stats.totalViews === 'number') {
      conn
        .prepare("INSERT OR REPLACE INTO kv (key, value) VALUES ('total_views', ?)")
        .run(String(stats.totalViews))
    }
  })

  try {
    if (Array.isArray(body.posts)) {
      const posts = body.posts as Record<string, unknown>[]
      const valid = posts.every(
        (p) => typeof p.slug === 'string' && typeof p.title === 'string' && typeof p.content === 'string'
      )
      if (!valid) {
        return NextResponse.json({ error: 'posts 数据格式不正确' }, { status: 400 })
      }
      importPosts(posts)
      imported.posts = posts.length
    }

    if (Array.isArray(body.comments)) {
      importComments(body.comments as Record<string, unknown>[])
      imported.comments = body.comments.length
    }

    if (Array.isArray(body.notifications)) {
      importNotifications(body.notifications as Record<string, unknown>[])
      imported.notifications = body.notifications.length
    }

    if (body.stats && typeof body.stats === 'object') {
      const stats = body.stats as { daily?: unknown }
      if (!Array.isArray(stats.daily)) {
        return NextResponse.json({ error: 'stats 数据格式不正确' }, { status: 400 })
      }
      importStats(body.stats as Parameters<typeof importStats>[0])
      imported.stats = true
    }
  } catch (err) {
    log.error('数据导入失败', { error: String(err) })
    return NextResponse.json({ error: '导入失败：数据库写入出错' }, { status: 500 })
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
