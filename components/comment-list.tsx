'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Comment } from '@/lib/comments-store'
import { CommentItem } from './comment-item'
import { CommentForm } from './comment-form'

type CommentListProps = {
  postSlug: string
}

// 回复嵌套的安全阀：数据模型允许"回复的回复"，理论上可以无限套下去。
// 无上限的递归会带来两个问题：① 病理数据（几千层链）导致调用栈溢出；
// ② 缩进把内容一路挤出屏幕。正常使用下每层回复都需要管理员审核，远到不了这个深度，
// 这里只做兜底，不改变常规数据的呈现。
const MAX_REPLY_DEPTH = 10

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
      // 成功后必须清掉上一次的失败提示，否则一次网络抖动会永久残留"评论加载失败"
      setError('')
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

  const topLevelComments = useMemo(
    () => comments.filter((c) => !c.parentId),
    [comments]
  )
  const repliesByParent = useMemo(() => {
    const result = new Map<string, Comment[]>()
    for (const comment of comments) {
      if (!comment.parentId) continue
      const replies = result.get(comment.parentId) ?? []
      replies.push(comment)
      result.set(comment.parentId, replies)
    }
    return result
  }, [comments])

  const renderReplies = (parentId: string, ancestors: Set<string>, depth = 1): React.ReactNode =>
    (repliesByParent.get(parentId) ?? []).map((reply) => {
      // ancestors 防环：数据被人工改坏成 A→B→A 时不会无限递归
      if (ancestors.has(reply.id)) return null
      const nextAncestors = new Set(ancestors)
      nextAncestors.add(reply.id)
      const reachedLimit = depth >= MAX_REPLY_DEPTH
      return (
        <div key={reply.id} className={depth > 1 ? 'ml-8' : undefined}>
          <CommentItem
            comment={reply}
            postSlug={postSlug}
            onRefresh={handleCommentSuccess}
            isReply
          />
          {reachedLimit ? null : renderReplies(reply.id, nextAncestors, depth + 1)}
        </div>
      )
    })

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
              {renderReplies(comment.id, new Set([comment.id]))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
