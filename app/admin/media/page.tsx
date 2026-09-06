'use client'

import { useCallback, useEffect, useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/components/toast'
import { apiFetch, errorMessage } from '@/lib/api-client'

type MediaItem = {
  name: string
  url: string
  size: number
  uploadedAt: string
  referenced: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** 媒体库：管理编辑器上传的图片（列表 / 引用检测 / 删除） */
export default function AdminMediaPage() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const t = useToast()

  const reload = useCallback(async () => {
    setLoadError('')
    try {
      const data = await apiFetch<{ items: MediaItem[] }>('/api/admin/media', {
        cache: 'no-store',
      })
      setItems(data.items ?? [])
    } catch (err) {
      setLoadError(errorMessage(err, '加载媒体列表失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const onDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch<undefined>(
        `/api/admin/media?name=${encodeURIComponent(deleteTarget.name)}`,
        { method: 'DELETE' }
      )
      setItems((prev) => prev.filter((i) => i.name !== deleteTarget.name))
      t.success({ title: '已删除', description: deleteTarget.name })
      setDeleteTarget(null)
    } catch (err) {
      t.error({ title: errorMessage(err, '删除失败') })
    } finally {
      setDeleting(false)
    }
  }

  const totalSize = items.reduce((s, i) => s + i.size, 0)
  const orphanCount = items.filter((i) => !i.referenced).length

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-medium tracking-tight">媒体库</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          编辑器上传的图片都在这里。共 {items.length} 个文件 · {formatSize(totalSize)}
          {orphanCount > 0 && (
            <span className="ml-2 text-amber-500">· {orphanCount} 个未被文章引用</span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
          加载中...
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-destructive/40 bg-card p-12 text-center">
          <p className="text-destructive">{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            还没有上传过图片。在写文章时通过「插入图片」、粘贴或拖拽上传的文件会出现在这里。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.name} className="overflow-hidden rounded-lg border border-border bg-card">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.name}
                  loading="lazy"
                  className="h-40 w-full border-b border-border object-cover"
                />
              </a>
              <div className="p-3">
                <p className="truncate text-xs font-medium text-foreground" title={item.name}>
                  {item.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatSize(item.size)} ·{' '}
                  {new Date(item.uploadedAt).toLocaleDateString('zh-CN')}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      item.referenced
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-amber-500/10 text-amber-500'
                    }`}
                  >
                    {item.referenced ? '被文章引用' : '未被引用'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除图片"
        description={
          deleteTarget?.referenced
            ? `《${deleteTarget.name}》正在被某篇文章引用，删除后文章里会显示裂图。确定删除？`
            : `确定删除 ${deleteTarget?.name ?? ''}？此操作不可恢复。`
        }
        variant="danger"
        confirmText={deleting ? '删除中…' : '删除'}
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  )
}
