// 客户端文章 API：通过 fetch 调用服务端 Route，数据真正持久化（跨浏览器/刷新可见）
import type { Post } from '@/lib/posts-store'

export type { Post }
export type PostInput = {
  title?: string
  category?: string
  excerpt?: string
  content?: string
  status?: 'draft' | 'published' | 'scheduled'
  tags?: string[]
  publishAt?: string
}

export async function fetchPosts(
  opts?: { includeDeleted?: boolean }
): Promise<Post[]> {
  const qs = opts?.includeDeleted ? '?includeDeleted=1' : ''
  const res = await fetch(`/api/posts${qs}`, { cache: 'no-store' })
  if (!res.ok) return []
  const data = (await res.json()) as Post[]
  return Array.isArray(data) ? data : []
}

export async function fetchPost(slug: string): Promise<Post | undefined> {
  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  })
  if (!res.ok) return undefined
  return (await res.json()) as Post
}

export async function createPost(input: PostInput): Promise<Post> {
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '发布失败' }))
    throw new Error((err as { error?: string }).error || '发布失败')
  }
  return (await res.json()) as Post
}

export async function updatePost(
  slug: string,
  input: PostInput
): Promise<Post> {
  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '更新失败' }))
    throw new Error((err as { error?: string }).error || '更新失败')
  }
  return (await res.json()) as Post
}

/** 删除 → 移入回收站（软删除，可在管理后台恢复） */
export async function deletePost(slug: string): Promise<void> {
  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: '删除失败' }))
    throw new Error((err as { error?: string }).error || '删除失败')
  }
}

/** 从回收站恢复文章 */
export async function restorePost(slug: string): Promise<Post> {
  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/restore`, {
    method: 'POST',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '恢复失败' }))
    throw new Error((err as { error?: string }).error || '恢复失败')
  }
  return (await res.json()) as Post
}

/** 彻底删除（回收站中的文章，不可恢复） */
export async function purgePost(slug: string): Promise<void> {
  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}?purge=1`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: '删除失败' }))
    throw new Error((err as { error?: string }).error || '删除失败')
  }
}

/** 上传插图：返回可直接嵌入 Markdown 的 /uploads/... URL */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/admin/upload', { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '图片上传失败' }))
    throw new Error((err as { error?: string }).error || '图片上传失败')
  }
  const data = (await res.json()) as { url?: string }
  if (!data.url) throw new Error('图片上传失败：响应缺少 URL')
  return data.url
}

/**
 * 阅读量 +1：公开调用，无需鉴权。
 * 失败静默（不抛错），不影响读者继续阅读。接口只回传最新浏览数。
 */
export async function incrementView(slug: string): Promise<number | undefined> {
  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { views?: number }
    return typeof data.views === 'number' ? data.views : undefined
  } catch {
    return undefined
  }
}
