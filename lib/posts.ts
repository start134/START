// 客户端文章 API：统一走 apiFetch，错误以 ApiError（带 status）抛出
import type { Post } from '@/lib/posts-store'
import { apiFetch } from '@/lib/api-client'

export type { Post }
export type PostInput = {
  title?: string
  category?: string
  excerpt?: string
  content?: string
  status?: 'draft' | 'published' | 'scheduled'
  tags?: string[]
  publishAt?: string
  /** 乐观锁：编辑器保存时带上加载文章时的 updatedAt，冲突返回 409 */
  baseUpdatedAt?: string
}

export async function fetchPosts(
  opts?: { includeDeleted?: boolean }
): Promise<Post[]> {
  const qs = opts?.includeDeleted ? '?includeDeleted=1' : ''
  const data = await apiFetch<Post[]>(`/api/posts${qs}`, { cache: 'no-store' })
  return Array.isArray(data) ? data : []
}

export async function fetchPost(slug: string): Promise<Post | undefined> {
  try {
    return await apiFetch<Post>(`/api/posts/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    })
  } catch {
    return undefined
  }
}

export async function createPost(input: PostInput): Promise<Post> {
  return apiFetch<Post>('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function updatePost(
  slug: string,
  input: PostInput
): Promise<Post> {
  return apiFetch<Post>(`/api/posts/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** 删除 → 移入回收站（软删除，可在管理后台恢复） */
export async function deletePost(slug: string): Promise<void> {
  await apiFetch<undefined>(`/api/posts/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  })
}

/** 从回收站恢复文章 */
export async function restorePost(slug: string): Promise<Post> {
  return apiFetch<Post>(`/api/posts/${encodeURIComponent(slug)}/restore`, {
    method: 'POST',
  })
}

/** 彻底删除（回收站中的文章，不可恢复） */
export async function purgePost(slug: string): Promise<void> {
  await apiFetch<undefined>(`/api/posts/${encodeURIComponent(slug)}?purge=1`, {
    method: 'DELETE',
  })
}

/** 上传插图：返回可直接嵌入 Markdown 的 /uploads/... URL */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const data = await apiFetch<{ url?: string }>('/api/admin/upload', {
    method: 'POST',
    body: form,
  })
  if (!data.url) throw new Error('图片上传失败：响应缺少 URL')
  return data.url
}

/**
 * 阅读量 +1：公开调用，无需鉴权。
 * 失败静默（不抛错），不影响读者继续阅读。接口只回传最新浏览数。
 */
export async function incrementView(slug: string): Promise<number | undefined> {
  try {
    const data = await apiFetch<{ views?: number }>(
      `/api/posts/${encodeURIComponent(slug)}/view`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    )
    return typeof data?.views === 'number' ? data.views : undefined
  } catch {
    return undefined
  }
}
