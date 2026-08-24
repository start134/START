import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import { createLogger } from '@/lib/logger'

const log = createLogger('db')

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'stats.db')

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (db) return db

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  db = new DatabaseSync(DB_FILE)

  // 启用 WAL 模式，支持并发读写
  db.exec(`PRAGMA journal_mode=WAL`)
  db.exec(`PRAGMA synchronous=NORMAL`)

  // 建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  // 建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date)
  `)

  // 元数据表（存储总阅读量等全局统计）
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  log.info('SQLite 数据库初始化完成', { file: DB_FILE })

  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    log.info('SQLite 数据库已关闭')
  }
}
