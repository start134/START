import { redirect } from 'next/navigation'

// 写作入口统一收口到管理后台（旧链接/书签自动跳转）
export default function NewRedirectPage() {
  redirect('/admin/new')
}
