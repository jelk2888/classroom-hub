import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'classroom.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
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
      status TEXT NOT NULL DEFAULT 'pending', -- pending | active | disabled
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
      kind TEXT NOT NULL, -- class | admin
      ref_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_no TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT '',
      points INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS disciplines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      student_name TEXT NOT NULL,
      kind TEXT NOT NULL, -- warn | praise
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS homeworks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '全部',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS homework_done (
      homework_id INTEGER NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      done_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (homework_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS call_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      names TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS picker_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      student_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS class_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      student_id INTEGER,
      student_name TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS pets (
      class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      total_exp INTEGER NOT NULL DEFAULT 0,
      mood INTEGER NOT NULL DEFAULT 60,
      food INTEGER NOT NULL DEFAULT 60,
      energy INTEGER NOT NULL DEFAULT 60,
      stars INTEGER NOT NULL DEFAULT 0,
      last_settle TEXT,
      feed_json TEXT NOT NULL DEFAULT '[]',
      rank_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS points_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      student_name TEXT NOT NULL,
      delta INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT '其他',
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      cost INTEGER NOT NULL DEFAULT 10,
      stock INTEGER NOT NULL DEFAULT 99
    );

    CREATE TABLE IF NOT EXISTS duty_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS duty_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS duty_members (
      group_id INTEGER NOT NULL REFERENCES duty_groups(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS duty_state (
      class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
      active_group_id INTEGER,
      day TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS duty_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      student_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | done | miss
      UNIQUE(class_id, day, post_id)
    );

    CREATE TABLE IF NOT EXISTS live_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS module_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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
      db.prepare(
        'INSERT INTO pets (class_id, name) VALUES (?, ?)',
      ).run(classId, '示例班小宠');
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
        db.prepare(
          'INSERT INTO shop_items (class_id, name, cost, stock) VALUES (?, ?, ?, ?)',
        ).run(classId, name, cost, stock);
      });
    });
    tx();
  }
}

export function today() {
  return db.prepare(`SELECT date('now','localtime') AS d`).get().d;
}
