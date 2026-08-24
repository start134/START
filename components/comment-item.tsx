'use client'

import { useState } from 'react'
import type { Comment } from '@/lib/comments-store'
import { CommentForm } from './comment-form'

type CommentItemProps = {
  comment: Comment
  postSlug: string
  onRefresh: () => void
  isReply?: boolean
}

export function CommentItem({ comment, postSlug, onRefresh, isReply = false }: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false)

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return '刚刚'
      if (diffMins < 60) return `${diffMins} 分钟前`
      if (diffHours < 24) return `${diffHours} 小时前`
      if (diffDays < 7) return `${diffDays} 天前`

      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  const handleReplySuccess = () => {
    setShowReplyForm(false)
    onRefresh()
  }

  return (
    <div className={`${isReply ? 'ml-8 border-l-2 border-border pl-4' : ''}`}>
      <div className="py-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">{comment.name}</span>
          <span className="text-muted-foreground/50">·</span>
          <time className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</time>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {comment.content}
        </p>
        {!isReply && (
          <button
            type="button"
            onClick={() => setShowReplyForm(!showReplyForm)}
            className="mt-2 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            回复
          </button>
        )}
      </div>

      {showReplyForm && (
        <div className="ml-8 mb-4">
          <CommentForm
            postSlug={postSlug}
            parentId={comment.id}
            onSuccess={handleReplySuccess}
            onCancel={() => setShowReplyForm(false)}
          />
        </div>
      )}
    </div>
  )
}
