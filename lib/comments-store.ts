// 评论存储（SQLite 版）：导出签名与旧 JSON 实现一致。
import { createLogger } from '@/lib/logger'
import { db } from '@/lib/db'

const log = createLogger('comments-store')

export type Comment = {
  id: string
  postSlug: string
  parentId?: string
  name: string
  email?: string
  content: string
  createdAt: string
  status: 'pending' | 'approved'
}

export type CommentInput = {
  postSlug: string
  parentId?: string
  name: string
  email?: string
  content: string
}

type CommentRow = {
  id: string
  post_slug: string
  parent_id: string | null
  name: string
  email: string | null
  content: string
  created_at: string
  status: string
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    postSlug: row.post_slug,
    ...(row.parent_id ? { parentId: row.parent_id } : {}),
    name: row.name,
    ...(row.email ? { email: row.email } : {}),
    content: row.content,
    createdAt: row.created_at,
    status: row.status === 'approved' ? 'approved' : 'pending',
  }
}

function generateId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const UPSERT_COMMENT = `
  INSERT INTO comments (id, post_slug, parent_id, name, email, content, created_at, status)
  VALUES (@id, @postSlug, @parentId, @name, @email, @content, @createdAt, @status)
  ON CONFLICT(id) DO UPDATE SET
    post_slug=excluded.post_slug, parent_id=excluded.parent_id, name=excluded.name,
    email=excluded.email, content=excluded.content, created_at=excluded.created_at, status=excluded.status
`

export async function readAllComments(): Promise<Comment[]> {
  const rows = db()
    .prepare('SELECT * FROM comments ORDER BY created_at DESC, rowid DESC')
    .all() as CommentRow[]
  return rows.map(rowToComment)
}

export async function readCommentsByPost(postSlug: string): Promise<Comment[]> {
  const rows = db()
    .prepare('SELECT * FROM comments WHERE post_slug = ? AND status = ? ORDER BY created_at DESC')
    .all(postSlug, 'approved') as CommentRow[]
  return rows.map(rowToComment)
}

export async function readComment(id: string): Promise<Comment | undefined> {
  const row = db().prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow | undefined
  return row ? rowToComment(row) : undefined
}

export async function createComment(input: CommentInput): Promise<Comment> {
  const comment: Comment = {
    id: generateId(),
    postSlug: input.postSlug,
    ...(input.parentId ? { parentId: input.parentId } : {}),
    name: input.name.trim() || '匿名',
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    content: input.content.trim(),
    createdAt: new Date().toISOString(),
    status: 'pending',
  }
  db().prepare(UPSERT_COMMENT).run({
    id: comment.id,
    postSlug: comment.postSlug,
    parentId: comment.parentId ?? null,
    name: comment.name,
    email: comment.email ?? null,
    content: comment.content,
    createdAt: comment.createdAt,
    status: comment.status,
  })
  log.info('评论创建成功', { id: comment.id, postSlug: comment.postSlug })
  return comment
}

export async function approveComment(id: string): Promise<Comment | undefined> {
  const result = db()
    .prepare("UPDATE comments SET status = 'approved' WHERE id = ?")
    .run(id)
  if (result.changes === 0) return undefined
  log.info('评论已批准', { id })
  return readComment(id)
}

export async function deleteComment(id: string): Promise<boolean> {
  // 级联删除其下所有回复
  const result = db()
    .prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?')
    .run(id, id)
  if (result.changes === 0) return false
  log.info('评论已删除（含回复）', { id, count: result.changes })
  return true
}

/**
 * 管理员回复：以博主身份回复某条评论，回复自动过审；
 * 若目标评论还在待审，一并批准（管理员选择回复即代表认可）。
 */
export async function createAdminReply(input: {
  parentId: string
  author: string
  content: string
}): Promise<Comment | undefined> {
  const run = db().transaction((): Comment | undefined => {
    const parentRow = db()
      .prepare('SELECT * FROM comments WHERE id = ?')
      .get(input.parentId) as CommentRow | undefined
    if (!parentRow) return undefined
    db()
      .prepare("UPDATE comments SET status = 'approved' WHERE id = ? AND status = 'pending'")
      .run(input.parentId)
    const reply: Comment = {
      id: generateId(),
      postSlug: parentRow.post_slug,
      parentId: parentRow.id,
      name: input.author,
      content: input.content.trim(),
      createdAt: new Date().toISOString(),
      status: 'approved',
    }
    db().prepare(UPSERT_COMMENT).run({
      id: reply.id,
      postSlug: reply.postSlug,
      parentId: reply.parentId,
      name: reply.name,
      email: null,
      content: reply.content,
      createdAt: reply.createdAt,
      status: reply.status,
    })
    log.info('管理员回复已创建', { id: reply.id, parent: parentRow.id })
    return reply
  })
  return run()
}

// 公开响应剥离邮箱：评论者邮箱只进管理端，不对访客暴露
export type PublicComment = Omit<Comment, 'email'>

export function toPublicComment(comment: Comment): PublicComment {
  return {
    id: comment.id,
    postSlug: comment.postSlug,
    ...(comment.parentId ? { parentId: comment.parentId } : {}),
    name: comment.name,
    content: comment.content,
    createdAt: comment.createdAt,
    status: comment.status,
  }
}

export async function getAllCommentsForAdmin(): Promise<Comment[]> {
  return readAllComments()
}
