'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Notification } from '@/lib/notifications-store'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) throw new Error('获取通知失败')
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch (err) {
      console.error('获取通知失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', { method: 'PATCH' })
      fetchNotifications()
    } catch (err) {
      console.error('标记已读失败:', err)
    }
  }

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
      fetchNotifications()
    } catch (err) {
      console.error('标记已读失败:', err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
      fetchNotifications()
    } catch (err) {
      console.error('删除通知失败:', err)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  const getTypeIcon = (type: Notification['type']) => {
    switch (type) {
      case 'comment': return '💬'
      case 'reply': return '↩️'
      default: return '🔔'
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">通知</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {unreadCount > 0 ? `有 ${unreadCount} 条未读通知` : '所有通知已读'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            全部标为已读
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">暂无通知</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`flex items-start gap-4 p-4 transition-colors ${
                !notification.read ? 'bg-primary/[0.02]' : ''
              }`}
            >
              <span className="mt-1 text-lg">{getTypeIcon(notification.type)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`text-sm font-medium ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {notification.title}
                  </h3>
                  {!notification.read && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                  {notification.content}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground/70">
                  <time>{formatDate(notification.createdAt)}</time>
                  {notification.postSlug && (
                    <Link
                      href={`/articles/${notification.postSlug}`}
                      className="hover:text-primary transition-colors"
                    >
                      查看文章 →
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!notification.read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(notification.id)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    标为已读
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(notification.id)}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
