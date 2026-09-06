import { redirect } from 'next/navigation'

type Props = { params: Promise<{ slug: string }> }

// 编辑入口统一收口到管理后台（旧链接/书签自动跳转）
export default async function EditRedirectPage({ params }: Props) {
  const { slug } = await params
  redirect(`/admin/articles/${encodeURIComponent(slug)}/edit`)
}
