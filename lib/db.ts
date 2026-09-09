// SQLite 数据层核心：better-sqlite3（同步 API，单文件数据库 data/app.db）。
// - WAL 模式 + busy_timeout：读写并发安全，跨进程短暂等待
// - 首次启动自动把旧版 JSON 数据（posts/comments/notifications/stats.json）迁移进库，
//   迁移完成后原文件重命名为 *.migrated.json 留作备份
// - 连接挂 globalThis：dev 下 Turbopack 为 RSC 与 route handler 创建不同模块实例，
//   必须共享同一连接
// 仅服务端使用，禁止在客户端组件 import。
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { createLogger } from '@/lib/logger'

const log = createLogger('db')

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'app.db')

type GlobalWithDb = typeof globalThis & { __startDb?: Database.Database }
const globalForDb = globalThis as GlobalWithDb

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      slug       TEXT PRIMARY KEY,
      date       TEXT NOT NULL,
      category   TEXT NOT NULL DEFAULT '未分类',
      title      TEXT NOT NULL,
      excerpt    TEXT NOT NULL DEFAULT '',
      content    TEXT NOT NULL DEFAULT '',
      read       TEXT NOT NULL DEFAULT '1 分钟',
      views      INTEGER NOT NULL DEFAULT 0,
      status     TEXT NOT NULL DEFAULT 'published',
      tags       TEXT,
      publish_at TEXT,
      deleted_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, deleted_at);

    CREATE TABLE IF NOT EXISTS comments (
      id         TEXT PRIMARY KEY,
      post_slug  TEXT NOT NULL,
      parent_id  TEXT,
      name       TEXT NOT NULL,
      email      TEXT,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_slug, status);

    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      comment_id TEXT,
      post_slug  TEXT,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- 每日阅读统计：slug='' 为全站汇总行，其余为单篇行
    CREATE TABLE IF NOT EXISTS stats_daily (
      date  TEXT NOT NULL,
      slug  TEXT NOT NULL DEFAULT '',
      views INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, slug)
    );

    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
}

// ---------- 旧 JSON → SQLite 迁移 ----------

type LegacyPost = {
  slug: string
  date: string
  category?: string
  title: string
  excerpt?: string
  content?: string
  read?: string
  views?: number
  status?: string
  tags?: string[]
  publishAt?: string
  deletedAt?: string
  updatedAt?: string
}

type LegacyComment = {
  id: string
  postSlug: string
  parentId?: string
  name: string
  email?: string
  content: string
  createdAt: string
  status: string
}

type LegacyNotification = {
  id: string
  type: string
  title: string
  content: string
  commentId?: string
  postSlug?: string
  read?: boolean
  createdAt: string
}

type LegacyStats = {
  daily?: { date: string; views: number }[]
  totalViews?: number
  bySlug?: Record<string, Record<string, number>>
}

function readLegacyJson<T>(file: string): T | null {
  const p = path.join(DATA_DIR, file)
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T
  } catch {
    return null
  }
}

function migrateLegacyJson(db: Database.Database): void {
  const flag = db.prepare("SELECT value FROM kv WHERE key = 'json_migrated'").get() as
    | { value: string }
    | undefined
  if (flag) return

  const run = db.transaction(() => {
    let migrated = 0

    // posts.json
    const posts = readLegacyJson<LegacyPost[]>('posts.json')
    if (Array.isArray(posts)) {
      const insertPost = db.prepare(`
        INSERT OR REPLACE INTO posts
          (slug, date, category, title, excerpt, content, read, views, status, tags, publish_at, deleted_at, updated_at)
        VALUES
          (@slug, @date, @category, @title, @excerpt, @content, @read, @views, @status, @tags, @publish_at, @deleted_at, @updated_at)
      `)
      for (const p of posts) {
        if (!p?.slug || !p?.title) continue
        insertPost.run({
          slug: p.slug,
          date: p.date ?? '',
          category: p.category ?? '未分类',
          title: p.title,
          excerpt: p.excerpt ?? '',
          content: p.content ?? '',
          read: p.read ?? '1 分钟',
          views: p.views ?? 0,
          status: p.status ?? 'published',
          tags: p.tags ? JSON.stringify(p.tags) : null,
          publish_at: p.publishAt ?? null,
          deleted_at: p.deletedAt ?? null,
          updated_at: p.updatedAt ?? null,
        })
        migrated++
      }
      try {
        fs.renameSync(path.join(DATA_DIR, 'posts.json'), path.join(DATA_DIR, 'posts.json.migrated.json'))
      } catch { /* 重命名失败不影响（下次启动 kv 标记会阻止重复迁移） */ }
    }

    // comments.json
    const comments = readLegacyJson<LegacyComment[]>('comments.json')
    if (Array.isArray(comments)) {
      const insert = db.prepare(`
        INSERT OR REPLACE INTO comments (id, post_slug, parent_id, name, email, content, created_at, status)
        VALUES (@id, @postSlug, @parentId, @name, @email, @content, @createdAt, @status)
      `)
      for (const c of comments) {
        if (!c?.id || !c?.postSlug) continue
        insert.run({
          id: c.id,
          postSlug: c.postSlug,
          parentId: c.parentId ?? null,
          name: c.name ?? '匿名',
          email: c.email ?? null,
          content: c.content ?? '',
          createdAt: c.createdAt ?? new Date().toISOString(),
          status: c.status ?? 'pending',
        })
        migrated++
      }
      try {
        fs.renameSync(path.join(DATA_DIR, 'comments.json'), path.join(DATA_DIR, 'comments.json.migrated.json'))
      } catch { /* ignore */ }
    }

    // notifications.json
    const notifications = readLegacyJson<LegacyNotification[]>('notifications.json')
    if (Array.isArray(notifications)) {
      const insert = db.prepare(`
        INSERT OR REPLACE INTO notifications (id, type, title, content, comment_id, post_slug, read, created_at)
        VALUES (@id, @type, @title, @content, @commentId, @postSlug, @read, @createdAt)
      `)
      for (const n of notifications) {
        if (!n?.id) continue
        insert.run({
          id: n.id,
          type: n.type ?? 'system',
          title: n.title ?? '',
          content: n.content ?? '',
          commentId: n.commentId ?? null,
          postSlug: n.postSlug ?? null,
          read: n.read ? 1 : 0,
          createdAt: n.createdAt ?? new Date().toISOString(),
        })
        migrated++
      }
      try {
        fs.renameSync(path.join(DATA_DIR, 'notifications.json'), path.join(DATA_DIR, 'notifications.json.migrated.json'))
      } catch { /* ignore */ }
    }

    // stats.json
    const stats = readLegacyJson<LegacyStats>('stats.json')
    if (stats && typeof stats === 'object') {
      const upsert = db.prepare(`
        INSERT INTO stats_daily (date, slug, views) VALUES (@date, @slug, @views)
        ON CONFLICT(date, slug) DO UPDATE SET views = views + excluded.views
      `)
      for (const d of stats.daily ?? []) {
        if (!d?.date) continue
        upsert.run({ date: d.date, slug: '', views: d.views ?? 0 })
      }
      for (const [date, bySlug] of Object.entries(stats.bySlug ?? {})) {
        for (const [slug, views] of Object.entries(bySlug)) {
          upsert.run({ date, slug, views })
        }
      }
      if (typeof stats.totalViews === 'number') {
        db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(
          'total_views',
          String(stats.totalViews)
        )
      }
      migrated++
      try {
        fs.renameSync(path.join(DATA_DIR, 'stats.json'), path.join(DATA_DIR, 'stats.json.migrated.json'))
      } catch { /* ignore */ }
    }

    // 无论是否有旧文件，都写入标记：空环境（全新安装）没有可迁移内容
    db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(
      'json_migrated',
      new Date().toISOString()
    )
    if (migrated > 0) {
      log.info('旧 JSON 数据已迁移到 SQLite', { rows: migrated })
    }
  })

  try {
    run()
  } catch (err) {
    // 迁移失败不阻塞启动（库可能部分导入，下次启动 kv 未标记会重试，INSERT OR REPLACE 幂等）
    log.error('JSON 迁移失败', { error: String(err) })
  }
}

/** 获取全局共享的数据库连接（懒初始化：首次调用时建 schema + 迁移） */
export function db(): Database.Database {
  if (globalForDb.__startDb) return globalForDb.__startDb
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const conn = new Database(DB_PATH)
  conn.pragma('journal_mode = WAL')
  conn.pragma('busy_timeout = 5000')
  initSchema(conn)
  migrateLegacyJson(conn)
  globalForDb.__startDb = conn
  log.info('SQLite 就绪', { file: DB_PATH })
  return conn
}

/** 供备份使用：一致快照导出到目标文件 */
export async function backupDb(targetPath: string): Promise<void> {
  await db().backup(targetPath)
}
