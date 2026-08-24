'use client'

import { useState, type FormEvent } from 'react'
import { SITE_CONTACT_EMAIL } from '@/lib/site'

export default function ContactPage() {
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', message: '' })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSent(true)
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 lg:px-8 lg:py-24">
      <p className="font-mono text-xs tracking-[0.2em] text-primary">联系方式</p>
      <h1 className="mt-3 text-3xl tracking-tight sm:text-4xl">联系</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        有想聊的，欢迎写信给我，或者直接用下面的表单。
      </p>

      {sent ? (
        <div className="mt-10 border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
          <p className="text-foreground">感谢你的留言！</p>
          <p className="mt-2">
            我会尽快通过邮箱
            <span className="mx-1 text-primary">{SITE_CONTACT_EMAIL}</span>
            回复你。
          </p>
          <button
            type="button"
            onClick={() => {
              setSent(false)
              setForm({ name: '', email: '', message: '' })
            }}
            className="mt-4 border border-border px-3 py-2 text-xs transition-colors hover:border-primary hover:text-primary"
          >
            再写一封
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-10 grid gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-xs text-muted-foreground">
                姓名
              </label>
              <input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="你的称呼"
                className="border-b border-border bg-transparent pb-2 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="email" className="text-xs text-muted-foreground">
                邮箱
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                className="border-b border-border bg-transparent pb-2 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <label htmlFor="message" className="text-xs text-muted-foreground">
              想说什么
            </label>
            <textarea
              id="message"
              required
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="写下你的话…"
              rows={6}
              className="resize-none border-b border-border bg-transparent pb-2 text-sm leading-7 outline-none transition-colors focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              className="border border-border px-4 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
            >
              发送
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
