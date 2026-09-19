/**
 * 使用 sql.js（纯 WASM），避免群晖 Web Station 上 better-sqlite3 的 GLIBC 不兼容。
 * API 对齐 better-sqlite3 的 prepare/get/all/run/exec/transaction/pragma。
 */
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'classroom.db');

function normalizeParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

class Statement {
  constructor(owner, sql) {
    this.owner = owner;
    this.sql = sql;
  }

  get(...params) {
    const stmt = this.owner._raw.prepare(this.sql);
    try {
      const p = normalizeParams(params);
      if (p.length) stmt.bind(p);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.reset();
        return row;
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params) {
    const stmt = this.owner._raw.prepare(this.sql);
    const rows = [];
    try {
      const p = normalizeParams(params);
      if (p.length) stmt.bind(p);
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  run(...params) {
    const p = normalizeParams(params);
    this.owner._raw.run(this.sql, p.length ? p : undefined);
    const changes = this.owner._raw.getRowsModified();
    let lastInsertRowid = 0;
    try {
      const r = this.owner._raw.exec('SELECT last_insert_rowid() AS id');
      if (r[0]?.values?.[0]?.[0] != null) lastInsertRowid = Number(r[0].values[0][0]);
    } catch {
      /* ignore */
    }
    if (!this.owner._inTx) this.owner._persist();
    return { changes, lastInsertRowid };
  }
}

class SqlJsDatabase {
  constructor(raw, filePath) {
    this._raw = raw;
    this._path = filePath;
    this._inTx = false;
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  exec(sql) {
    this._raw.exec(sql);
    if (!this._inTx) this._persist();
  }

  pragma(source) {
    try {
      this._raw.run(`PRAGMA ${source}`);
    } catch {
      /* sql.js 部分 pragma 可忽略 */
    }
  }

  transaction(fn) {
    return (...args) => {
      this._raw.run('BEGIN');
      this._inTx = true;
      try {
        const result = fn(...args);
        this._raw.run('COMMIT');
        this._inTx = false;
        this._persist();
        return result;
      } catch (e) {
        try {
          this._raw.run('ROLLBACK');
        } catch {
          /* ignore */
        }
        this._inTx = false;
        throw e;
      }
    };
  }

  _persist() {
    const data = this._raw.export();
    fs.writeFileSync(this._path, Buffer.from(data));
  }
}

const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
const wasmBinary = fs.readFileSync(wasmPath);
const SQL = await initSqlJs({ wasmBinary });

let raw;
if (fs.existsSync(dbPath)) {
  try {
    raw = new SQL.Database(fs.readFileSync(dbPath));
  } catch {
    // 旧 better-sqlite3/WAL 文件可能无法直接打开，则新建（可备份后手工迁移）
    const bak = `${dbPath}.bak-${Date.now()}`;
    try {
      fs.copyFileSync(dbPath, bak);
    } catch {
      /* ignore */
    }
    raw = new SQL.Database();
  }
} else {
  raw = new SQL.Database();
}

export const db = new SqlJsDatabase(raw, dbPath);
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      school TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      usage_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      call_template TEXT NOT NULL DEFAULT '{name}同学，请到办公室来一趟。',
      voice_repeat INTEGER NOT NULL DEFAULT 1,
      voice_rate REAL NOT NULL DEFAULT 1,
      voice_pitch REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      ref_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_no TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT '',
      points INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS live_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS call_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      names TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS disciplines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_id INTEGER,
      student_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS homeworks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '全部',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS homework_done (
      homework_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      PRIMARY KEY (homework_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS picker_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS class_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'event',
      student_id INTEGER,
      student_name TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS pets (
      class_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '班级小宠',
      stars INTEGER NOT NULL DEFAULT 0,
      mood INTEGER NOT NULL DEFAULT 80,
      food INTEGER NOT NULL DEFAULT 80,
      energy INTEGER NOT NULL DEFAULT 80,
      total_exp INTEGER NOT NULL DEFAULT 0,
      feed_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS points_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_id INTEGER,
      student_name TEXT NOT NULL,
      delta INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      cost INTEGER NOT NULL DEFAULT 10,
      stock INTEGER NOT NULL DEFAULT 99
    );

    CREATE TABLE IF NOT EXISTS duty_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS duty_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS duty_members (
      group_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      PRIMARY KEY (group_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS duty_state (
      class_id INTEGER PRIMARY KEY,
      active_group_id INTEGER,
      day TEXT
    );

    CREATE TABLE IF NOT EXISTS duty_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      student_id INTEGER,
      done INTEGER NOT NULL DEFAULT 0,
      UNIQUE(class_id, day, post_id)
    );

    CREATE TABLE IF NOT EXISTS module_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      module TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seat_layout (
      class_id INTEGER PRIMARY KEY,
      rows INTEGER NOT NULL DEFAULT 6,
      cols INTEGER NOT NULL DEFAULT 8,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS seat_cells (
      class_id INTEGER NOT NULL,
      row_idx INTEGER NOT NULL,
      col_idx INTEGER NOT NULL,
      student_id INTEGER,
      PRIMARY KEY (class_id, row_idx, col_idx)
    );

    CREATE TABLE IF NOT EXISTS timetable_settings (
      class_id INTEGER PRIMARY KEY,
      enable_morning INTEGER NOT NULL DEFAULT 1,
      enable_evening INTEGER NOT NULL DEFAULT 1,
      enable_saturday INTEGER NOT NULL DEFAULT 0,
      enable_sunday INTEGER NOT NULL DEFAULT 0,
      morning_label TEXT NOT NULL DEFAULT '早自习',
      evening_label TEXT NOT NULL DEFAULT '晚自习',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS timetable_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      day INTEGER NOT NULL,
      period_key TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      teacher TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(class_id, day, period_key)
    );
  `);

  const auto = db.prepare(`SELECT value FROM system_settings WHERE key='class_auto_approve'`).get();
  if (!auto) {
    db.prepare(`INSERT INTO system_settings (key, value) VALUES ('class_auto_approve', '0')`).run();
  }

  const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (adminCount === 0) {
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(
      'admin',
      bcrypt.hashSync('admin123', 10),
    );
  }

  const classCount = db.prepare('SELECT COUNT(*) AS c FROM classes').get().c;
  if (classCount === 0) {
    const hash = bcrypt.hashSync('123456', 10);
    const info = db
      .prepare(
        `INSERT INTO classes (code, name, school, password_hash, status, usage_count, last_used_at)
         VALUES (?, ?, ?, ?, 'active', 1, datetime('now','localtime'))`,
      )
      .run('DEMO01', '示例班', '天门中学', hash);
    const classId = info.lastInsertRowid;
    const names = [
      '陈思远', '林晓萱', '王浩然', '张雨桐', '刘子墨', '赵一诺', '黄子轩', '周诗涵',
      '吴俊杰', '徐梦瑶', '孙浩宇', '马欣怡', '朱明轩', '胡语嫣', '郭宇航', '何雨欣',
      '高子涵', '罗俊熙', '梁思琪', '宋嘉豪', '郑欣然', '谢宇辰', '韩雨薇', '唐子豪',
      '冯思涵', '于梓萱', '董浩然', '萧雨桐', '程一凡', '曹欣悦', '袁俊杰', '邓诗雨',
      '许明辉', '傅佳怡', '沈子轩', '曾雨涵', '彭浩宇', '吕思琪', '苏俊豪', '卢欣然',
      '蒋宇轩', '蔡梦琪', '贾子墨', '丁诗涵', '魏浩然', '薛雨萱', '叶明轩', '阎欣怡',
    ];
    const ins = db.prepare(
      'INSERT INTO students (class_id, student_no, name, gender) VALUES (?, ?, ?, ?)',
    );
    const tx = db.transaction(() => {
      names.forEach((name, i) => {
        ins.run(classId, String(i + 1).padStart(2, '0'), name, i % 2 === 0 ? '男' : '女');
      });
      db.prepare('INSERT INTO pets (class_id, name) VALUES (?, ?)').run(classId, '示例班小宠');
      ['黑板', '扫地', '倒垃圾', '窗户'].forEach((n, i) => {
        db.prepare('INSERT INTO duty_posts (class_id, name, sort_order) VALUES (?, ?, ?)').run(
          classId,
          n,
          i,
        );
      });
      ['A组', 'B组', 'C组', 'D组'].forEach((n, i) => {
        const g = db
          .prepare('INSERT INTO duty_groups (class_id, name, sort_order) VALUES (?, ?, ?)')
          .run(classId, n, i);
        const students = db
          .prepare('SELECT id FROM students WHERE class_id=? ORDER BY id LIMIT 12 OFFSET ?')
          .all(classId, i * 12);
        const add = db.prepare('INSERT INTO duty_members (group_id, student_id) VALUES (?, ?)');
        students.forEach((s) => add.run(g.lastInsertRowid, s.id));
      });
      const firstGroup = db
        .prepare('SELECT id FROM duty_groups WHERE class_id=? ORDER BY sort_order LIMIT 1')
        .get(classId);
      db.prepare(
        `INSERT INTO duty_state (class_id, active_group_id, day) VALUES (?, ?, date('now','localtime'))`,
      ).run(classId, firstGroup?.id || null);
      [
        ['免作业一次', 20, 10],
        ['奖状一张', 30, 5],
        ['小零食', 15, 20],
      ].forEach(([name, cost, stock]) => {
        db.prepare('INSERT INTO shop_items (class_id, name, cost, stock) VALUES (?, ?, ?, ?)').run(
          classId,
          name,
          cost,
          stock,
        );
      });
    });
    tx();
  }
}

export function today() {
  return db.prepare(`SELECT date('now','localtime') AS d`).get().d;
}
