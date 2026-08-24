'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Comment } from '@/lib/comments-store'
import { CommentItem } from './comment-item'
import { CommentForm } from './comment-form'

type CommentListProps = {
  postSlug: string
}

export function CommentList({ postSlug }: CommentListProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?postSlug=${encodeURIComponent(postSlug)}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('获取评论失败')
      const data = await res.json()
      setComments(Array.isArray(data) ? data : [])
    } catch (err) {
      setError('评论加载失败')
      console.error('获取评论失败:', err)
    } finally {
      setLoading(false)
    }
  }, [postSlug])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  const handleCommentSuccess = () => {
    fetchComments()
  }

  const topLevelComments = comments.filter(c => !c.parentId)
  const getReplies = (parentId: string) => comments.filter(c => c.parentId === parentId)

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        加载评论中...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="border-t border-border pt-8">
        <h2 className="text-xl font-medium tracking-tight">
          评论
          {topLevelComments.length > 0 && (
            <span className="ml-2 text-sm text-muted-foreground font-normal">
              ({topLevelComments.length})
            </span>
          )}
        </h2>
      </div>

      {/* 评论表单 */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-medium mb-4">发表评论</h3>
        <CommentForm
          postSlug={postSlug}
          onSuccess={handleCommentSuccess}
        />
      </div>

      {/* 评论列表 */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {topLevelComments.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          还没有评论，快来发表第一条评论吧！
        </p>
      ) : (
        <div className="divide-y divide-border">
          {topLevelComments.map(comment => (
            <div key={comment.id}>
              <CommentItem
                comment={comment}
                postSlug={postSlug}
                onRefresh={handleCommentSuccess}
              />
              {getReplies(comment.id).map(reply => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  postSlug={postSlug}
                  onRefresh={handleCommentSuccess}
                  isReply
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
