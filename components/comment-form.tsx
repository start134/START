'use client'

import { useState } from 'react'
import type { Comment, CommentInput } from '@/lib/comments-store'

type CommentFormProps = {
  postSlug: string
  parentId?: string
  onSuccess: () => void
  onCancel?: () => void
}

export function CommentForm({ postSlug, parentId, onSuccess, onCancel }: CommentFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) {
      setError('请输入评论内容')
      return
    }

    setLoading(true)
    setError('')

    try {
      const input: CommentInput = {
        postSlug,
        parentId,
        name: name.trim() || '匿名',
        email: email.trim(),
        content: content.trim(),
      }

      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '评论失败')
      }

      setName('')
      setEmail('')
      setContent('')
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '评论失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm text-muted-foreground mb-1">
            昵称 <span className="text-muted-foreground/50">(可选)</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="匿名"
            className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm text-muted-foreground mb-1">
            邮箱 <span className="text-muted-foreground/50">(可选，不会公开)</span>
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>
      <div>
        <label htmlFor="content" className="block text-sm text-muted-foreground mb-1">
          评论内容 <span className="text-destructive">*</span>
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="说点什么..."
          rows={4}
          className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
        />
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="border border-primary bg-primary text-primary-foreground px-4 py-2 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {loading ? '提交中...' : '提交评论'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            取消
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground/70">
        评论将在审核后显示。请文明发言，共建良好氛围。
      </p>
    </form>
  )
}
