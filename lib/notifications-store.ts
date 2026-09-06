import { readJSON, writeJSON, withFileLock } from '@/lib/storage'
import { createLogger } from '@/lib/logger'

const log = createLogger('notifications-store')
const NOTIFICATIONS_FILE = 'notifications.json'
const NOTIFICATIONS_LOCK_KEY = 'notifications.json'

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

function generateId(): string {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function sortByDateDesc(items: Notification[]): Notification[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function readAllNotifications(): Promise<Notification[]> {
  const notifications = await readJSON<Notification[]>(NOTIFICATIONS_FILE)
  if (!notifications || !Array.isArray(notifications)) {
    return []
  }
  return sortByDateDesc(notifications)
}

export async function readNotification(id: string): Promise<Notification | undefined> {
  const all = await readAllNotifications()
  return all.find(n => n.id === id)
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
    commentId: input.commentId,
    postSlug: input.postSlug,
    read: false,
    createdAt: new Date().toISOString(),
  }

  await withFileLock(NOTIFICATIONS_LOCK_KEY, async () => {
    const all = await readAllNotifications()
    all.push(notification)
    await writeJSON(NOTIFICATIONS_FILE, all)
  })
  log.info('通知创建成功', { id: notification.id, type: notification.type })
  return notification
}

export async function markAsRead(id: string): Promise<Notification | undefined> {
  return withFileLock(NOTIFICATIONS_LOCK_KEY, async () => {
    const all = await readAllNotifications()
    const idx = all.findIndex(n => n.id === id)
    if (idx < 0) return undefined
    all[idx] = { ...all[idx], read: true }
    await writeJSON(NOTIFICATIONS_FILE, all)
    log.info('通知已标记为已读', { id })
    return all[idx]
  })
}

export async function markAllAsRead(): Promise<void> {
  await withFileLock(NOTIFICATIONS_LOCK_KEY, async () => {
    const all = await readAllNotifications()
    const updated = all.map(n => ({ ...n, read: true }))
    await writeJSON(NOTIFICATIONS_FILE, updated)
    log.info('所有通知已标记为已读')
  })
}

export async function deleteNotification(id: string): Promise<boolean> {
  return withFileLock(NOTIFICATIONS_LOCK_KEY, async () => {
    const all = await readAllNotifications()
    const next = all.filter(n => n.id !== id)
    if (next.length === all.length) return false
    await writeJSON(NOTIFICATIONS_FILE, next)
    log.info('通知已删除', { id })
    return true
  })
}

export async function getUnreadCount(): Promise<number> {
  const all = await readAllNotifications()
  return all.filter(n => !n.read).length
}
