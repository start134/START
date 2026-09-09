// 通知存储（SQLite 版）：导出签名与旧 JSON 实现一致。
import { createLogger } from '@/lib/logger'
import { db } from '@/lib/db'

const log = createLogger('notifications-store')

export type Notification = {
  id: string
  type: 'comment' | 'reply' | 'system'
  title: string
  content: string
  commentId?: string
  postSlug?: string
  read: boolean
  createdAt: string
}

type NotificationRow = {
  id: string
  type: string
  title: string
  content: string
  comment_id: string | null
  post_slug: string | null
  read: number
  created_at: string
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: (row.type as Notification['type']) ?? 'system',
    title: row.title,
    content: row.content,
    ...(row.comment_id ? { commentId: row.comment_id } : {}),
    ...(row.post_slug ? { postSlug: row.post_slug } : {}),
    read: row.read === 1,
    createdAt: row.created_at,
  }
}

function generateId(): string {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function readAllNotifications(): Promise<Notification[]> {
  const rows = db()
    .prepare('SELECT * FROM notifications ORDER BY created_at DESC, rowid DESC')
    .all() as NotificationRow[]
  return rows.map(rowToNotification)
}

export async function createNotification(input: {
  type: Notification['type']
  title: string
  content: string
  commentId?: string
  postSlug?: string
}): Promise<Notification> {
  const notification: Notification = {
    id: generateId(),
    type: input.type,
    title: input.title,
    content: input.content,
    ...(input.commentId ? { commentId: input.commentId } : {}),
    ...(input.postSlug ? { postSlug: input.postSlug } : {}),
    read: false,
    createdAt: new Date().toISOString(),
  }
  db()
    .prepare(
      `INSERT INTO notifications (id, type, title, content, comment_id, post_slug, read, created_at)
       VALUES (@id, @type, @title, @content, @commentId, @postSlug, 0, @createdAt)`
    )
    .run({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      commentId: notification.commentId ?? null,
      postSlug: notification.postSlug ?? null,
      createdAt: notification.createdAt,
    })
  log.info('通知创建成功', { id: notification.id, type: notification.type })
  return notification
}

export async function markAsRead(id: string): Promise<Notification | undefined> {
  const result = db().prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id)
  if (result.changes === 0) return undefined
  log.info('通知已标记为已读', { id })
  const row = db().prepare('SELECT * FROM notifications WHERE id = ?').get(id) as NotificationRow | undefined
  return row ? rowToNotification(row) : undefined
}

export async function markAllAsRead(): Promise<void> {
  db().prepare('UPDATE notifications SET read = 1 WHERE read = 0').run()
  log.info('所有通知已标记为已读')
}

export async function deleteNotification(id: string): Promise<boolean> {
  const result = db().prepare('DELETE FROM notifications WHERE id = ?').run(id)
  if (result.changes === 0) return false
  log.info('通知已删除', { id })
  return true
}

export async function getUnreadCount(): Promise<number> {
  const row = db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE read = 0').get() as { n: number }
  return row.n
}
