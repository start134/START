'use client'

import { useEffect } from 'react'

type ConfirmDialogProps = {
  open: boolean
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  loading?: boolean
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title = '确认操作',
  description,
  confirmText = '确认',
  cancelText = '取消',
  loading = false,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onCancel])

  if (!open) return null

  const confirmClass =
    variant === 'danger'
      ? 'border-border hover:border-destructive hover:text-destructive'
      : 'border-border hover:border-primary hover:text-primary'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <button
        type="button"
        aria-label="取消"
        className="absolute inset-0 bg-black/60"
        onClick={() => !loading && onCancel()}
      />
      <div className="relative z-10 w-full max-w-sm border border-border bg-card p-6">
        <p className="font-mono text-xs tracking-[0.2em] text-primary">确认</p>
        <h2 id="confirm-title" className="mt-3 text-lg tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="border border-border px-3 py-2 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`border px-3 py-2 text-xs transition-colors disabled:opacity-50 ${confirmClass}`}
          >
            {loading ? '处理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
