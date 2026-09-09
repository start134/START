// 文章存储（SQLite 版）：所有导出签名与旧 JSON 实现保持一致，路由/UI 无需改动。
// better-sqlite3 为同步 API，这里用 async 函数包装以维持原有 Promise 签名。
import { randomBytes } from 'node:crypto'
import { createLogger } from '@/lib/logger'
import { db } from '@/lib/db'

const log = createLogger('posts-store')

export type Post = {
  slug: string
  date: string
  category: string
  title: string
  excerpt: string
  content: string
  read: string
  views?: number
  /** draft 草稿 / published 已发布 / scheduled 定时发布（到点由 promoteScheduledPosts 转正） */
  status?: 'draft' | 'published' | 'scheduled'
  /** 标签（可多个，与单一分类互补） */
  tags?: string[]
  /** 定时发布时间（ISO 字符串），仅 status === 'scheduled' 时有意义 */
  publishAt?: string
  /** 软删除标记（回收站），ISO 字符串；存在即表示在回收站中 */
  deletedAt?: string
  /** 最近一次内容修改时间（ISO），乐观锁版本号 */
  updatedAt?: string
}

/** 乐观锁冲突：文章在本次编辑期间已被其他窗口/请求修改 */
export class PostConflictError extends Error {
  constructor() {
    super('文章已在其他窗口被修改，请刷新查看最新内容')
    this.name = 'PostConflictError'
  }
}

type PostRow = {
  slug: string
  date: string
  category: string
  title: string
  excerpt: string
  content: string
  read: string
  views: number
  status: string
  tags: string | null
  publish_at: string | null
  deleted_at: string | null
  updated_at: string | null
}

function rowToPost(row: PostRow): Post {
  let tags: string[] | undefined
  if (row.tags) {
    try {
      const parsed = JSON.parse(row.tags)
      if (Array.isArray(parsed) && parsed.length > 0) tags = parsed.map(String)
    } catch {
      // tags 损坏时按无标签处理
    }
  }
  return {
    slug: row.slug,
    date: row.date,
    category: row.category,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    read: row.read,
    views: row.views,
    status: (row.status as Post['status']) ?? 'published',
    ...(tags ? { tags } : {}),
    ...(row.publish_at ? { publishAt: row.publish_at } : {}),
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  }
}

const SELECT_POST = 'SELECT * FROM posts'

const selectAll = () => db().prepare(`${SELECT_POST} ORDER BY date DESC, rowid ASC`)
const selectBySlug = () => db().prepare(`${SELECT_POST} WHERE slug = ?`)

/** 对公众是否可见：published 直接可见；scheduled 到点后可见 */
export function isPublishedPost(post: Post, now: Date = new Date()): boolean {
  const status = post.status ?? 'published'
  if (status === 'published') return true
  if (status === 'scheduled') {
    return !!post.publishAt && new Date(post.publishAt).getTime() <= now.getTime()
  }
  return false
}

/** tags 规范化：去空、去重、限量 8 个、单个限长 20；空数组返回 undefined 便于清空字段 */
function normalizeTags(tags: unknown): string[] | undefined {
  if (!Array.isArray(tags)) return undefined
  const cleaned = Array.from(new Set(tags.map((t) => String(t).trim()).filter(Boolean)))
  return cleaned.length > 0 ? cleaned.slice(0, 8).map((t) => t.slice(0, 20)) : undefined
}

function formatDateYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function today(): string {
  return formatDateYMD(new Date())
}

function estimateRead(content: string): string {
  const len = content.replace(/\s+/g, '').length
  const minutes = Math.max(1, Math.round(len / 300))
  return `${minutes} 分钟`
}

export async function readAllPosts(
  opts?: { includeDeleted?: boolean }
): Promise<Post[]> {
  const rows = opts?.includeDeleted
    ? (selectAll().all() as PostRow[])
    : ((db().prepare(`${SELECT_POST} WHERE deleted_at IS NULL ORDER BY date DESC, rowid ASC`).all()) as PostRow[])
  return rows.map(rowToPost)
}

export async function readPost(slug: string): Promise<Post | undefined> {
  const row = selectBySlug().get(slug) as PostRow | undefined
  if (row) {
    log.debug('查询单篇文章命中', { slug, title: row.title })
  } else {
    log.warn('查询单篇文章未命中', { slug })
  }
  return row ? rowToPost(row) : undefined
}

export type PostInput = {
  title?: string
  category?: string
  excerpt?: string
  content?: string
  status?: 'draft' | 'published' | 'scheduled'
  tags?: string[]
  publishAt?: string
  /** 乐观锁版本号：API 层读取后通过 opts 传入，存储层本身忽略此字段 */
  baseUpdatedAt?: string
}

type InsertParams = Record<string, string | number | null>

function postToParams(p: Post): InsertParams {
  return {
    slug: p.slug,
    date: p.date,
    category: p.category,
    title: p.title,
    excerpt: p.excerpt,
    content: p.content,
    read: p.read,
    views: p.views ?? 0,
    status: p.status ?? 'published',
    tags: p.tags ? JSON.stringify(p.tags) : null,
    publish_at: p.publishAt ?? null,
    deleted_at: p.deletedAt ?? null,
    updated_at: p.updatedAt ?? null,
  }
}

const UPSERT_POST = `
  INSERT INTO posts
    (slug, date, category, title, excerpt, content, read, views, status, tags, publish_at, deleted_at, updated_at)
  VALUES
    (@slug, @date, @category, @title, @excerpt, @content, @read, @views, @status, @tags, @publish_at, @deleted_at, @updated_at)
  ON CONFLICT(slug) DO UPDATE SET
    date=excluded.date, category=excluded.category, title=excluded.title, excerpt=excluded.excerpt,
    content=excluded.content, read=excluded.read, views=excluded.views, status=excluded.status,
    tags=excluded.tags, publish_at=excluded.publish_at, deleted_at=excluded.deleted_at, updated_at=excluded.updated_at
`

export async function createPost(input: PostInput): Promise<Post> {
  const content = (input.content ?? '').trim()
  const title = (input.title ?? '').trim() || '无题'
  const tags = normalizeTags(input.tags)
  const status =
    input.status === 'draft'
      ? 'draft'
      : input.status === 'scheduled'
        ? 'scheduled'
        : 'published'
  const post: Post = {
    // 随机后缀防碰撞：同毫秒连续创建也能区分
    slug: `p-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
    date: today(),
    category: (input.category ?? '').trim() || '未分类',
    title,
    excerpt: (input.excerpt ?? '').trim() || content.slice(0, 60),
    content,
    read: estimateRead(content),
    status,
    updatedAt: new Date().toISOString(),
    ...(tags ? { tags } : {}),
    ...(status === 'scheduled' && input.publishAt ? { publishAt: input.publishAt } : {}),
  }
  log.info('准备创建文章', { slug: post.slug, title: post.title, category: post.category, status })
  db().prepare(UPSERT_POST).run(postToParams(post))
  log.info('文章创建成功', { slug: post.slug })
  return post
}

export async function updatePost(
  slug: string,
  input: PostInput,
  opts?: { expectedUpdatedAt?: string }
): Promise<Post | undefined> {
  const run = db().transaction((): Post | undefined => {
    const row = selectBySlug().get(slug) as PostRow | undefined
    if (!row) {
      log.warn('更新文章未找到目标', { slug })
      return undefined
    }
    // 乐观锁：编辑器保存时带上它读到的 updatedAt，不匹配说明已被其他窗口改过
    if (
      opts?.expectedUpdatedAt !== undefined &&
      row.updated_at !== undefined &&
      row.updated_at !== null &&
      row.updated_at !== opts.expectedUpdatedAt
    ) {
      log.warn('更新冲突：文章已被其他窗口修改', { slug })
      throw new PostConflictError()
    }
    const current = rowToPost(row)
    const content = input.content !== undefined ? input.content.trim() : current.content
    const title = input.title !== undefined ? input.title.trim() || '无题' : current.title
    const nextStatus = input.status !== undefined ? input.status : (current.status ?? 'published')
    // 定时发布保留/更新 publishAt；转草稿或直接发布则清除定时字段
    const publishAt =
      nextStatus === 'scheduled' ? (input.publishAt ?? current.publishAt) : undefined
    const updated: Post = {
      ...current,
      title,
      category: input.category !== undefined ? input.category.trim() || '未分类' : current.category,
      excerpt: input.excerpt !== undefined ? input.excerpt.trim() || content.slice(0, 60) : current.excerpt,
      content,
      read: input.content !== undefined ? estimateRead(content) : current.read,
      status: nextStatus,
      tags: input.tags !== undefined ? normalizeTags(input.tags) : current.tags,
      updatedAt: new Date().toISOString(),
      ...(publishAt !== undefined ? { publishAt } : {}),
    }
    if (publishAt === undefined) delete updated.publishAt
    db().prepare(UPSERT_POST).run(postToParams(updated))
    log.info('文章更新成功', { slug, title: updated.title, status: updated.status })
    return updated
  })
  return run()
}

export async function incrementRead(slug: string): Promise<Post | undefined> {
  const run = db().transaction((): { post: Post; counted: boolean } | undefined => {
    const row = selectBySlug().get(slug) as PostRow | undefined
    if (!row) {
      log.warn('阅读量 +1 未找到目标', { slug })
      return undefined
    }
    const post = rowToPost(row)
    if (!isPublishedPost(post)) {
      log.info('草稿/未发布不计阅读量', { slug })
      return { post, counted: false }
    }
    const result = db()
      .prepare('UPDATE posts SET views = views + 1 WHERE slug = ?')
      .run(slug)
    if (result.changes === 0) return { post, counted: false }
    // 每日统计与总阅读量在同一事务内记账（单篇行 + 全站行 + kv 计数）
    const date = today()
    db()
      .prepare(
        `INSERT INTO stats_daily (date, slug, views) VALUES (?, '', 1)
         ON CONFLICT(date, slug) DO UPDATE SET views = views + 1`
      )
      .run(date)
    db()
      .prepare(
        `INSERT INTO stats_daily (date, slug, views) VALUES (?, ?, 1)
         ON CONFLICT(date, slug) DO UPDATE SET views = views + 1`
      )
      .run(date, slug)
    db()
      .prepare(
        `INSERT INTO kv (key, value) VALUES ('total_views', '1')
         ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`
      )
      .run()
    return { post: { ...post, views: (post.views ?? 0) + 1 }, counted: true }
  })
  const result = run()
  return result?.post
}

export async function getAdjacentPosts(slug: string): Promise<{ prev?: Post; next?: Post }> {
  const rows = db()
    .prepare(`${SELECT_POST} WHERE deleted_at IS NULL ORDER BY date DESC, rowid ASC`)
    .all() as PostRow[]
  const published = rows.map(rowToPost).filter((p) => isPublishedPost(p))
  const idx = published.findIndex((p) => p.slug === slug)
  if (idx < 0) return {}
  const prev = idx + 1 < published.length ? published[idx + 1] : undefined
  const next = idx - 1 >= 0 ? published[idx - 1] : undefined
  return { prev, next }
}

/** 相关文章：同分类、公开可见、排除自身与回收站，取最新 3 篇 */
export async function getRelatedPosts(slug: string, limit = 3): Promise<Post[]> {
  const current = selectBySlug().get(slug) as PostRow | undefined
  if (!current) return []
  const rows = db()
    .prepare(
      `${SELECT_POST} WHERE deleted_at IS NULL AND status = 'published' AND category = ? AND slug != ? ORDER BY date DESC, rowid ASC LIMIT ?`
    )
    .all(current.category, slug, limit) as PostRow[]
  return rows.map(rowToPost)
}

/** 删除 → 移入回收站（软删除）；已在回收站返回 false */
export async function deletePost(slug: string): Promise<boolean> {
  const result = db()
    .prepare('UPDATE posts SET deleted_at = ? WHERE slug = ? AND deleted_at IS NULL')
    .run(new Date().toISOString(), slug)
  if (result.changes === 0) return false
  log.info('文章已移入回收站', { slug })
  return true
}

/** 从回收站恢复 */
export async function restorePost(slug: string): Promise<Post | undefined> {
  const result = db()
    .prepare('UPDATE posts SET deleted_at = NULL WHERE slug = ? AND deleted_at IS NOT NULL')
    .run(slug)
  if (result.changes === 0) return undefined
  const row = selectBySlug().get(slug) as PostRow | undefined
  log.info('文章已从回收站恢复', { slug })
  return row ? rowToPost(row) : undefined
}

/** 彻底删除（仅限回收站中的文章） */
export async function purgePost(slug: string): Promise<boolean> {
  const result = db()
    .prepare('DELETE FROM posts WHERE slug = ? AND deleted_at IS NOT NULL')
    .run(slug)
  if (result.changes === 0) return false
  log.info('文章已彻底删除', { slug })
  return true
}

/**
 * 定时发布懒提升：把到点的 scheduled 文章转成 published（date 取发布日）。
 * 在文章页 / 文章列表 API / RSS / sitemap 等读取路径上调用；无到点文章时只读不写，幂等。
 */
export async function promoteScheduledPosts(): Promise<number> {
  const now = Date.now()
  const due = db()
    .prepare(`${SELECT_POST} WHERE status = 'scheduled' AND publish_at IS NOT NULL AND deleted_at IS NULL`)
    .all() as PostRow[]
  const duePosts = due
    .map(rowToPost)
    .filter((p) => p.publishAt && new Date(p.publishAt).getTime() <= now)
  if (duePosts.length === 0) return 0
  const run = db().transaction(() => {
    const stmt = db().prepare(
      `UPDATE posts SET status = 'published', date = ?, publish_at = NULL, updated_at = ? WHERE slug = ?`
    )
    for (const p of duePosts) {
      stmt.run(formatDateYMD(new Date(p.publishAt!)), new Date().toISOString(), p.slug)
    }
  })
  run()
  log.info('定时文章已到点发布', { count: duePosts.length })
  return duePosts.length
}
