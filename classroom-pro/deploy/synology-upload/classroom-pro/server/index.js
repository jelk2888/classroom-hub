import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';
import http from 'http';
import { db, initDb, today } from './db.js';
import {
  attachRealtime,
  bindWsSession,
  addSseClient,
  removeSseClient,
  broadcastLive,
  wakeBoards,
  getClassPresence,
} from './realtime.js';
import { buildNetInfo, listLanIpv4 } from './netInfo.js';

initDb();

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const PORT = process.env.PORT || 3789;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

function publishLive(classId, type, payload = {}) {
  const info = db
    .prepare('INSERT INTO live_events (class_id, type, payload) VALUES (?, ?, ?)')
    .run(classId, type, JSON.stringify(payload));
  const event = {
    id: info.lastInsertRowid,
    type,
    payload,
    created_at: new Date().toISOString(),
  };
  broadcastLive(classId, event);
  wakeBoards(classId, { title: payload.names?.[0] || payload.name || payload.display || type, ...payload });
  return event;
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM system_settings WHERE key=?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO system_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(key, String(value));
}

function trackModule(classId, module) {
  db.prepare('INSERT INTO module_usage (class_id, module) VALUES (?, ?)').run(classId, module);
}

function auth(req, res, next) {
  const token = req.headers['x-token'] || req.query.token;
  if (!token) return res.status(401).json({ error: '未登录' });
  const row = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
  if (!row) return res.status(401).json({ error: '登录已失效' });
  req.session = row;
  if (row.kind === 'class') {
    req.classRow = db.prepare('SELECT * FROM classes WHERE id=?').get(row.ref_id);
    if (!req.classRow) return res.status(401).json({ error: '班级不存在' });
  } else {
    req.admin = db.prepare('SELECT id, username FROM admins WHERE id=?').get(row.ref_id);
  }
  next();
}

function requireClass(req, res, next) {
  if (req.session.kind !== 'class') return res.status(403).json({ error: '需要班级登录' });
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.kind !== 'admin') return res.status(403).json({ error: '需要管理员' });
  next();
}

function createSession(kind, refId) {
  const token = randomUUID();
  db.prepare('INSERT INTO sessions (token, kind, ref_id) VALUES (?, ?, ?)').run(token, kind, refId);
  return token;
}

function petLevelInfo(totalExp) {
  let lv = 1;
  let need = 100;
  let rest = Math.max(0, Math.round(totalExp || 0));
  let guard = 0;
  while (rest >= need && guard++ < 300) {
    rest -= need;
    lv++;
    need = 100 + (lv - 1) * 50;
  }
  return { level: lv, cur: rest, need };
}

const PET_STAGES = [
  { min: 1, name: '蛋宝宝', emoji: '🥚' },
  { min: 3, name: '毛球崽', emoji: '🐣' },
  { min: 6, name: '小书虫', emoji: '🐥' },
  { min: 10, name: '学霸兽', emoji: '🦉' },
  { min: 15, name: '守护兽', emoji: '🐯' },
  { min: 22, name: '传奇龙', emoji: '🐲' },
];

function petStageOf(level) {
  let s = PET_STAGES[0];
  for (const x of PET_STAGES) if (level >= x.min) s = x;
  return s;
}

function ensurePet(classId, className) {
  let pet = db.prepare('SELECT * FROM pets WHERE class_id=?').get(classId);
  if (!pet) {
    db.prepare('INSERT INTO pets (class_id, name) VALUES (?, ?)').run(
      classId,
      `${String(className || '班级').slice(0, 6)}小宠`,
    );
    pet = db.prepare('SELECT * FROM pets WHERE class_id=?').get(classId);
  }
  return pet;
}

function enrichPet(pet) {
  const info = petLevelInfo(pet.total_exp);
  return {
    ...pet,
    level: info.level,
    exp_cur: info.cur,
    exp_need: info.need,
    stage: petStageOf(info.level),
    feed: JSON.parse(pet.feed_json || '[]'),
    rank: JSON.parse(pet.rank_json || '{}'),
  };
}

function pushPetFeed(classId, message) {
  const pet = ensurePet(classId, '');
  const feed = JSON.parse(pet.feed_json || '[]');
  feed.unshift({ t: new Date().toLocaleString('zh-CN'), m: message });
  db.prepare('UPDATE pets SET feed_json=? WHERE class_id=?').run(
    JSON.stringify(feed.slice(0, 40)),
    classId,
  );
}

// ---------- Auth ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

/** 网络端点：局域网优先，互联网为回退 */
app.get('/api/net/info', (_req, res) => {
  const publicUrl = getSetting('public_url', '') || process.env.PUBLIC_URL || '';
  res.json(buildNetInfo(PORT, publicUrl));
});

app.get('/api/presence', auth, requireClass, (req, res) => {
  res.json(getClassPresence(req.classRow.id));
});

app.post('/api/auth/register', (req, res) => {
  const { code, name, school, password } = req.body || {};
  if (!code || !name || !school || !password || String(password).length < 6) {
    return res.status(400).json({ error: '请完整填写，密码至少 6 位' });
  }
  const exists = db.prepare('SELECT id FROM classes WHERE code=?').get(String(code).trim());
  if (exists) return res.status(400).json({ error: '班级码已存在' });
  const hash = bcrypt.hashSync(String(password), 10);
  const auto = getSetting('class_auto_approve', '0') === '1';
  const status = auto ? 'active' : 'pending';
  const info = db
    .prepare(
      `INSERT INTO classes (code, name, school, password_hash, status) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(String(code).trim(), String(name).trim(), String(school).trim(), hash, status);
  const classId = info.lastInsertRowid;
  db.prepare('INSERT INTO pets (class_id, name) VALUES (?, ?)').run(
    classId,
    `${String(name).trim().slice(0, 6)}小宠`,
  );
  ['黑板', '扫地', '倒垃圾', '窗户'].forEach((n, i) => {
    db.prepare('INSERT INTO duty_posts (class_id, name, sort_order) VALUES (?, ?, ?)').run(
      classId,
      n,
      i,
    );
  });
  res.json({
    ok: true,
    autoApproved: auto,
    message: auto
      ? '注册成功，已自动审核通过，可直接登录'
      : '已提交注册，待管理员审核通过后可登录',
  });
});

app.post('/api/auth/login', (req, res) => {
  const { code, password } = req.body || {};
  const row = db.prepare('SELECT * FROM classes WHERE code=?').get(String(code || '').trim());
  if (!row || !bcrypt.compareSync(String(password || ''), row.password_hash)) {
    return res.status(400).json({ error: '班级码或密码错误' });
  }
  if (row.status === 'pending') return res.status(403).json({ error: '班级注册审核中' });
  if (row.status === 'disabled') return res.status(403).json({ error: '该班级已被禁用' });
  db.prepare(
    `UPDATE classes SET usage_count = usage_count + 1, last_used_at = datetime('now','localtime') WHERE id=?`,
  ).run(row.id);
  const token = createSession('class', row.id);
  res.json({
    token,
    class: {
      id: row.id,
      code: row.code,
      name: row.name,
      school: row.school,
      call_template: row.call_template,
      voice_repeat: row.voice_repeat,
      voice_rate: row.voice_rate,
      voice_pitch: row.voice_pitch,
    },
  });
});

app.post('/api/auth/admin-login', (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare('SELECT * FROM admins WHERE username=?').get(String(username || '').trim());
  if (!row || !bcrypt.compareSync(String(password || ''), row.password_hash)) {
    return res.status(400).json({ error: '管理员账号或密码错误' });
  }
  const token = createSession('admin', row.id);
  res.json({ token, admin: { id: row.id, username: row.username } });
});

app.post('/api/auth/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(req.session.token);
  res.json({ ok: true });
});

app.post('/api/auth/change-password', auth, requireClass, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: '新密码至少 6 位' });
  }
  if (!bcrypt.compareSync(String(oldPassword || ''), req.classRow.password_hash)) {
    return res.status(400).json({ error: '原密码不正确' });
  }
  db.prepare('UPDATE classes SET password_hash=? WHERE id=?').run(
    bcrypt.hashSync(String(newPassword), 10),
    req.classRow.id,
  );
  res.json({ ok: true });
});

app.get('/api/me', auth, requireClass, (req, res) => {
  res.json({
    class: {
      id: req.classRow.id,
      code: req.classRow.code,
      name: req.classRow.name,
      school: req.classRow.school,
      call_template: req.classRow.call_template,
      voice_repeat: req.classRow.voice_repeat,
      voice_rate: req.classRow.voice_rate,
      voice_pitch: req.classRow.voice_pitch,
    },
  });
});

// ---------- SSE sync ----------
app.get('/api/sync/stream', auth, requireClass, (req, res) => {
  const classId = req.classRow.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: 'hello', payload: { classId } })}\n\n`);
  addSseClient(classId, res);
  req.on('close', () => {
    removeSseClient(classId, res);
  });
});

app.get('/api/settings/public', (_req, res) => {
  res.json({ class_auto_approve: getSetting('class_auto_approve', '0') === '1' });
});

app.get('/api/admin/settings', auth, requireAdmin, (_req, res) => {
  res.json({
    class_auto_approve: getSetting('class_auto_approve', '0') === '1',
    public_url: getSetting('public_url', '') || process.env.PUBLIC_URL || '',
    lan: listLanIpv4().map((ip) => `http://${ip}:${PORT}`),
  });
});

app.put('/api/admin/settings', auth, requireAdmin, (req, res) => {
  if (typeof req.body?.class_auto_approve === 'boolean') {
    setSetting('class_auto_approve', req.body.class_auto_approve ? '1' : '0');
  }
  if (typeof req.body?.public_url === 'string') {
    setSetting('public_url', req.body.public_url.trim().replace(/\/$/, ''));
  }
  res.json({
    ok: true,
    class_auto_approve: getSetting('class_auto_approve', '0') === '1',
    public_url: getSetting('public_url', '') || process.env.PUBLIC_URL || '',
    lan: listLanIpv4().map((ip) => `http://${ip}:${PORT}`),
  });
});

/** 教师端请求打开/关闭教室摄像头直播 */
app.post('/api/camera/command', auth, requireClass, (req, res) => {
  const { action = 'start' } = req.body || {}; // start | stop | shout
  const text = req.body?.text || '';
  publishLive(req.classRow.id, 'camera', { action, text });
  wakeBoards(req.classRow.id, { type: 'camera', action, text, title: action === 'shout' ? '教师喊话' : '摄像头' });
  res.json({ ok: true });
});

app.get('/api/sync/recent', auth, requireClass, (req, res) => {
  const after = Number(req.query.after || 0);
  const rows = db
    .prepare('SELECT * FROM live_events WHERE class_id=? AND id>? ORDER BY id ASC LIMIT 50')
    .all(req.classRow.id, after)
    .map((r) => ({ ...r, payload: JSON.parse(r.payload || '{}') }));
  res.json({ events: rows });
});

// ---------- Students ----------
app.get('/api/students', auth, requireClass, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM students WHERE class_id=? ORDER BY CAST(student_no AS INTEGER), id')
    .all(req.classRow.id);
  res.json({ students: rows });
});

app.post('/api/students', auth, requireClass, (req, res) => {
  const { student_no, name, gender } = req.body || {};
  if (!name) return res.status(400).json({ error: '姓名必填' });
  const info = db
    .prepare('INSERT INTO students (class_id, student_no, name, gender) VALUES (?, ?, ?, ?)')
    .run(req.classRow.id, student_no || '', name, gender || '');
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/students/:id', auth, requireClass, (req, res) => {
  const { student_no, name, gender } = req.body || {};
  db.prepare(
    'UPDATE students SET student_no=?, name=?, gender=? WHERE id=? AND class_id=?',
  ).run(student_no || '', name, gender || '', req.params.id, req.classRow.id);
  res.json({ ok: true });
});

app.delete('/api/students/:id', auth, requireClass, (req, res) => {
  db.prepare('DELETE FROM students WHERE id=? AND class_id=?').run(req.params.id, req.classRow.id);
  res.json({ ok: true });
});

app.delete('/api/students', auth, requireClass, (req, res) => {
  db.prepare('DELETE FROM students WHERE class_id=?').run(req.classRow.id);
  res.json({ ok: true });
});

app.post('/api/students/import', auth, requireClass, upload.single('file'), (req, res) => {
  let rows = [];
  if (req.file) {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  } else if (req.body?.text) {
    rows = String(req.body.text)
      .split(/\r?\n/)
      .map((l) => l.split(/[,，\t]/));
  }
  if (!rows.length) return res.status(400).json({ error: '没有可导入数据' });
  if (String(rows[0][0] || '').includes('学号') || String(rows[0][1] || '').includes('姓名')) {
    rows = rows.slice(1);
  }
  const del = db.prepare('DELETE FROM students WHERE class_id=?');
  const ins = db.prepare(
    'INSERT INTO students (class_id, student_no, name, gender) VALUES (?, ?, ?, ?)',
  );
  const tx = db.transaction(() => {
    del.run(req.classRow.id);
    rows.forEach((r, i) => {
      const no = String(r[0] ?? '').trim();
      const name = String(r[1] ?? r[0] ?? '').trim();
      const gender = String(r[2] ?? '').trim();
      if (!name) return;
      ins.run(req.classRow.id, no || String(i + 1).padStart(2, '0'), name, gender);
    });
  });
  tx();
  const students = db.prepare('SELECT * FROM students WHERE class_id=?').all(req.classRow.id);
  res.json({ ok: true, count: students.length, students });
});

app.get('/api/students/template', (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['学号', '姓名', '性别'],
    ['01', '张三', '男'],
    ['02', '李四', '女'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, '名单');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=students-template.xlsx');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ---------- Settings / backup ----------
app.put('/api/settings', auth, requireClass, (req, res) => {
  const { name, call_template, voice_repeat, voice_rate, voice_pitch } = req.body || {};
  db.prepare(
    `UPDATE classes SET name=COALESCE(?, name), call_template=COALESCE(?, call_template),
     voice_repeat=COALESCE(?, voice_repeat), voice_rate=COALESCE(?, voice_rate),
     voice_pitch=COALESCE(?, voice_pitch) WHERE id=?`,
  ).run(
    name ?? null,
    call_template ?? null,
    voice_repeat ?? null,
    voice_rate ?? null,
    voice_pitch ?? null,
    req.classRow.id,
  );
  res.json({ ok: true });
});

app.get('/api/backup', auth, requireClass, (req, res) => {
  const id = req.classRow.id;
  const payload = {
    class: db.prepare('SELECT code,name,school,call_template,voice_repeat,voice_rate,voice_pitch FROM classes WHERE id=?').get(id),
    students: db.prepare('SELECT student_no,name,gender,points FROM students WHERE class_id=?').all(id),
    disciplines: db.prepare('SELECT student_name,kind,reason,created_at FROM disciplines WHERE class_id=?').all(id),
    homeworks: db.prepare('SELECT id,title,subject,created_at FROM homeworks WHERE class_id=?').all(id),
    logs: db.prepare('SELECT type,student_name,content,created_at FROM class_logs WHERE class_id=?').all(id),
    points: db.prepare('SELECT student_name,delta,category,reason,created_at FROM points_log WHERE class_id=?').all(id),
  };
  res.json(payload);
});

app.post('/api/backup/restore', auth, requireClass, (req, res) => {
  const body = req.body || {};
  const id = req.classRow.id;
  const students = Array.isArray(body.students) ? body.students : [];
  if (!students.length) return res.status(400).json({ error: '备份中无学生名单' });
  const tx = db.transaction(() => {
    if (body.class) {
      db.prepare(
        `UPDATE classes SET name=COALESCE(?, name), call_template=COALESCE(?, call_template),
         voice_repeat=COALESCE(?, voice_repeat), voice_rate=COALESCE(?, voice_rate),
         voice_pitch=COALESCE(?, voice_pitch) WHERE id=?`,
      ).run(
        body.class.name ?? null,
        body.class.call_template ?? null,
        body.class.voice_repeat ?? null,
        body.class.voice_rate ?? null,
        body.class.voice_pitch ?? null,
        id,
      );
    }
    db.prepare('DELETE FROM students WHERE class_id=?').run(id);
    const ins = db.prepare(
      'INSERT INTO students (class_id, student_no, name, gender, points) VALUES (?, ?, ?, ?, ?)',
    );
    students.forEach((s, i) => {
      ins.run(
        id,
        s.student_no || String(i + 1).padStart(2, '0'),
        s.name || `学生${i + 1}`,
        s.gender || '',
        Number(s.points) || 0,
      );
    });
  });
  tx();
  publishLive(id, 'announce', { content: '已从备份恢复名单' });
  res.json({ ok: true, count: students.length });
});

/** 教师端显式推送一条大屏任务（公告/自定义文案等） */
app.post('/api/live/push', auth, requireClass, (req, res) => {
  const { type = 'announce', title, subtitle, payload = {} } = req.body || {};
  const event = publishLive(req.classRow.id, type, {
    ...payload,
    names: payload.names || (title ? [title] : []),
    texts: payload.texts || (subtitle ? [subtitle] : title ? [title] : []),
    content: subtitle || title || payload.content,
    name: title,
    display: title,
    subtitle,
  });
  res.json({ ok: true, event });
});

// ---------- Call ----------
app.post('/api/call', auth, requireClass, (req, res) => {
  const { studentIds = [], text } = req.body || {};
  const students = studentIds
    .map((id) => db.prepare('SELECT * FROM students WHERE id=? AND class_id=?').get(id, req.classRow.id))
    .filter(Boolean);
  if (!students.length) return res.status(400).json({ error: '请选择学生' });
  const names = students.map((s) => s.name);
  const tpl = text || req.classRow.call_template || '{name}同学，请到办公室来一趟。';
  const spoken = names.map((n) => tpl.replaceAll('{name}', n).replaceAll('{姓名}', n));
  // 多人：先报全部姓名，再报事项；单人：整句
  let speakParts;
  if (names.length === 1) {
    speakParts = [spoken[0]];
  } else {
    const action = String(tpl)
      .replaceAll('{name}同学', '')
      .replaceAll('{姓名}同学', '')
      .replaceAll('{name}', '')
      .replaceAll('{姓名}', '')
      .replace(/^[,，、。.\s]+/, '')
      .replace(/[,，、\s]+$/, '')
      .trim();
    speakParts = action ? [`${names.join('、')}同学`, action] : [`${names.join('、')}同学`];
  }
  db.prepare('INSERT INTO call_history (class_id, names, text) VALUES (?, ?, ?)').run(
    req.classRow.id,
    names.join('、'),
    spoken.join(' / '),
  );
  trackModule(req.classRow.id, 'calling');
  const event = publishLive(req.classRow.id, 'call', {
    names,
    texts: spoken,
    speakParts,
    template: tpl,
    repeat: req.classRow.voice_repeat,
    rate: req.classRow.voice_rate,
    pitch: req.classRow.voice_pitch,
  });
  res.json({ ok: true, event, names, texts: spoken, speakParts });
});

app.get('/api/call/history', auth, requireClass, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM call_history WHERE class_id=? ORDER BY id DESC LIMIT 50')
    .all(req.classRow.id);
  res.json({ history: rows });
});

app.delete('/api/call/history', auth, requireClass, (req, res) => {
  db.prepare('DELETE FROM call_history WHERE class_id=?').run(req.classRow.id);
  res.json({ ok: true });
});

/** 兼容部分客户端/代理对 DELETE 支持不佳 */
app.post('/api/call/history/clear', auth, requireClass, (req, res) => {
  db.prepare('DELETE FROM call_history WHERE class_id=?').run(req.classRow.id);
  res.json({ ok: true });
});

// ---------- Discipline ----------
app.get('/api/disciplines', auth, requireClass, (req, res) => {
  const range = req.query.range || 'today';
  let sql = 'SELECT * FROM disciplines WHERE class_id=?';
  if (range === 'today') sql += ` AND date(created_at)=date('now','localtime')`;
  else if (range === 'week') sql += ` AND date(created_at)>=date('now','localtime','weekday 0','-6 days')`;
  sql += ' ORDER BY id DESC';
  res.json({ records: db.prepare(sql).all(req.classRow.id) });
});

app.post('/api/disciplines', auth, requireClass, (req, res) => {
  const { studentId, kind, reason } = req.body || {};
  if (!['warn', 'praise'].includes(kind)) return res.status(400).json({ error: '类型错误' });
  const stu = db.prepare('SELECT * FROM students WHERE id=? AND class_id=?').get(studentId, req.classRow.id);
  if (!stu) return res.status(400).json({ error: '学生不存在' });
  const info = db
    .prepare(
      'INSERT INTO disciplines (class_id, student_id, student_name, kind, reason) VALUES (?, ?, ?, ?, ?)',
    )
    .run(req.classRow.id, stu.id, stu.name, kind, reason || (kind === 'warn' ? '违纪' : '表现优秀'));
  // auto points + pet stars hint
  const delta = kind === 'praise' ? 1 : -1;
  db.prepare('UPDATE students SET points = points + ? WHERE id=?').run(delta, stu.id);
  db.prepare(
    'INSERT INTO points_log (class_id, student_id, student_name, delta, category, reason) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(req.classRow.id, stu.id, stu.name, delta, '纪律', reason || kind);
  const pet = ensurePet(req.classRow.id, req.classRow.name);
  db.prepare('UPDATE pets SET stars = MAX(0, stars + ?) WHERE class_id=?').run(delta, req.classRow.id);
  pushPetFeed(req.classRow.id, kind === 'praise' ? `🌟 ${stu.name} 受表扬` : `⚠ ${stu.name} 违纪`);
  trackModule(req.classRow.id, 'discipline');
  publishLive(req.classRow.id, 'discipline', { id: info.lastInsertRowid, kind, name: stu.name });
  res.json({ id: info.lastInsertRowid, petStars: pet.stars + delta });
});

app.delete('/api/disciplines/:id', auth, requireClass, (req, res) => {
  db.prepare('DELETE FROM disciplines WHERE id=? AND class_id=?').run(req.params.id, req.classRow.id);
  res.json({ ok: true });
});

app.delete('/api/disciplines', auth, requireClass, (req, res) => {
  const scope = req.query.scope || 'today';
  if (scope === 'all') db.prepare('DELETE FROM disciplines WHERE class_id=?').run(req.classRow.id);
  else
    db.prepare(
      `DELETE FROM disciplines WHERE class_id=? AND date(created_at)=date('now','localtime')`,
    ).run(req.classRow.id);
  res.json({ ok: true });
});

// ---------- Homework ----------
app.get('/api/homeworks', auth, requireClass, (req, res) => {
  const list = db
    .prepare('SELECT * FROM homeworks WHERE class_id=? ORDER BY id DESC')
    .all(req.classRow.id)
    .map((hw) => {
      const doneIds = db
        .prepare('SELECT student_id FROM homework_done WHERE homework_id=?')
        .all(hw.id)
        .map((x) => x.student_id);
      return { ...hw, doneIds };
    });
  res.json({ homeworks: list });
});

app.post('/api/homeworks', auth, requireClass, (req, res) => {
  const { title, subject } = req.body || {};
  if (!title) return res.status(400).json({ error: '作业名称必填' });
  const info = db
    .prepare('INSERT INTO homeworks (class_id, title, subject) VALUES (?, ?, ?)')
    .run(req.classRow.id, title, subject || '全部');
  trackModule(req.classRow.id, 'homework');
  res.json({ id: info.lastInsertRowid });
});

app.post('/api/homeworks/:id/toggle', auth, requireClass, (req, res) => {
  const hw = db
    .prepare('SELECT * FROM homeworks WHERE id=? AND class_id=?')
    .get(req.params.id, req.classRow.id);
  if (!hw) return res.status(404).json({ error: '作业不存在' });
  const { studentId } = req.body || {};
  const exists = db
    .prepare('SELECT 1 FROM homework_done WHERE homework_id=? AND student_id=?')
    .get(hw.id, studentId);
  if (exists) {
    db.prepare('DELETE FROM homework_done WHERE homework_id=? AND student_id=?').run(hw.id, studentId);
  } else {
    db.prepare('INSERT INTO homework_done (homework_id, student_id) VALUES (?, ?)').run(
      hw.id,
      studentId,
    );
    const stu = db.prepare('SELECT * FROM students WHERE id=?').get(studentId);
    if (stu) {
      db.prepare('UPDATE students SET points = points + 1 WHERE id=?').run(stu.id);
      db.prepare(
        'INSERT INTO points_log (class_id, student_id, student_name, delta, category, reason) VALUES (?, ?, ?, 1, ?, ?)',
      ).run(req.classRow.id, stu.id, stu.name, '作业', hw.title);
      db.prepare('UPDATE pets SET stars = stars + 1 WHERE class_id=?').run(req.classRow.id);
    }
  }
  publishLive(req.classRow.id, 'homework', { homeworkId: hw.id, studentId });
  res.json({ ok: true, done: !exists });
});

app.delete('/api/homeworks/:id', auth, requireClass, (req, res) => {
  db.prepare('DELETE FROM homeworks WHERE id=? AND class_id=?').run(req.params.id, req.classRow.id);
  res.json({ ok: true });
});

// ---------- Picker ----------
app.get('/api/picker/history', auth, requireClass, (req, res) => {
  res.json({
    history: db
      .prepare('SELECT * FROM picker_history WHERE class_id=? ORDER BY id DESC LIMIT 100')
      .all(req.classRow.id),
  });
});

app.post('/api/picker', auth, requireClass, (req, res) => {
  const { studentId } = req.body || {};
  const stu = db.prepare('SELECT * FROM students WHERE id=? AND class_id=?').get(studentId, req.classRow.id);
  if (!stu) return res.status(400).json({ error: '学生不存在' });
  db.prepare(
    'INSERT INTO picker_history (class_id, student_id, student_name) VALUES (?, ?, ?)',
  ).run(req.classRow.id, stu.id, stu.name);
  trackModule(req.classRow.id, 'picker');
  publishLive(req.classRow.id, 'roll', { name: stu.name, studentId: stu.id });
  res.json({ ok: true, student: stu });
});

app.delete('/api/picker/history', auth, requireClass, (req, res) => {
  db.prepare('DELETE FROM picker_history WHERE class_id=?').run(req.classRow.id);
  res.json({ ok: true });
});

// ---------- Timer live ----------
app.post('/api/timer/live', auth, requireClass, (req, res) => {
  const { mode, display, subtitle } = req.body || {};
  publishLive(req.classRow.id, 'timer', { mode, display, subtitle });
  trackModule(req.classRow.id, 'timer');
  res.json({ ok: true });
});

// ---------- Logs ----------
app.get('/api/logs', auth, requireClass, (req, res) => {
  const type = req.query.type || 'all';
  let sql = 'SELECT * FROM class_logs WHERE class_id=?';
  const params = [req.classRow.id];
  if (type !== 'all') {
    sql += ' AND type=?';
    params.push(type);
  }
  sql += ' ORDER BY id DESC LIMIT 200';
  res.json({ logs: db.prepare(sql).all(...params) });
});

app.post('/api/logs', auth, requireClass, (req, res) => {
  const { type, studentId, content } = req.body || {};
  if (!content) return res.status(400).json({ error: '内容必填' });
  let studentName = null;
  if (studentId) {
    const stu = db.prepare('SELECT name FROM students WHERE id=? AND class_id=?').get(studentId, req.classRow.id);
    studentName = stu?.name || null;
  }
  const info = db
    .prepare(
      'INSERT INTO class_logs (class_id, type, student_id, student_name, content) VALUES (?, ?, ?, ?, ?)',
    )
    .run(req.classRow.id, type || 'event', studentId || null, studentName, content);
  trackModule(req.classRow.id, 'log');
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/logs', auth, requireClass, (req, res) => {
  db.prepare('DELETE FROM class_logs WHERE class_id=?').run(req.classRow.id);
  res.json({ ok: true });
});

// ---------- Announcements ----------
app.get('/api/announcements', auth, requireClass, (req, res) => {
  res.json({
    list: db
      .prepare('SELECT * FROM announcements WHERE class_id=? ORDER BY id DESC LIMIT 20')
      .all(req.classRow.id),
  });
});

app.post('/api/announcements', auth, requireClass, (req, res) => {
  const { content, link, image_url } = req.body || {};
  if (!content) return res.status(400).json({ error: '公告内容必填' });
  const info = db
    .prepare(
      'INSERT INTO announcements (class_id, content, link, image_url) VALUES (?, ?, ?, ?)',
    )
    .run(req.classRow.id, content, link || '', image_url || '');
  publishLive(req.classRow.id, 'announce', { content });
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/announcements/:id', auth, requireClass, (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id=? AND class_id=?').run(
    req.params.id,
    req.classRow.id,
  );
  res.json({ ok: true });
});

// ---------- Pet ----------
app.get('/api/pet', auth, requireClass, (req, res) => {
  const pet = enrichPet(ensurePet(req.classRow.id, req.classRow.name));
  const day = today();
  const praise = db
    .prepare(
      `SELECT COUNT(*) AS c FROM disciplines WHERE class_id=? AND kind='praise' AND date(created_at)=?`,
    )
    .get(req.classRow.id, day).c;
  const warn = db
    .prepare(
      `SELECT COUNT(*) AS c FROM disciplines WHERE class_id=? AND kind='warn' AND date(created_at)=?`,
    )
    .get(req.classRow.id, day).c;
  const hw = db
    .prepare(
      `SELECT COUNT(*) AS c FROM homework_done hd
       JOIN homeworks h ON h.id=hd.homework_id
       WHERE h.class_id=? AND date(hd.done_at)=?`,
    )
    .get(req.classRow.id, day).c;
  res.json({ pet, today: { praise, warn, hw } });
});

app.put('/api/pet/rename', auth, requireClass, (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: '名称必填' });
  ensurePet(req.classRow.id, req.classRow.name);
  db.prepare('UPDATE pets SET name=? WHERE class_id=?').run(String(name).slice(0, 12), req.classRow.id);
  res.json({ ok: true });
});

app.post('/api/pet/act', auth, requireClass, (req, res) => {
  const costs = { feed: 5, pat: 1, play: 3, clean: 2 };
  const { action } = req.body || {};
  const cost = costs[action];
  if (!cost) return res.status(400).json({ error: '未知动作' });
  const pet = ensurePet(req.classRow.id, req.classRow.name);
  if (pet.stars < cost) return res.status(400).json({ error: `星星不足，需要 ${cost}★` });
  let { mood, food, energy, total_exp, stars } = pet;
  stars -= cost;
  if (action === 'feed') {
    food = Math.min(100, food + 20);
    total_exp += 8;
  }
  if (action === 'pat') {
    mood = Math.min(100, mood + 10);
    total_exp += 3;
  }
  if (action === 'play') {
    energy = Math.min(100, energy + 15);
    mood = Math.min(100, mood + 8);
    total_exp += 6;
  }
  if (action === 'clean') {
    mood = Math.min(100, mood + 6);
    food = Math.min(100, food + 4);
    total_exp += 4;
  }
  db.prepare(
    'UPDATE pets SET stars=?, mood=?, food=?, energy=?, total_exp=? WHERE class_id=?',
  ).run(stars, mood, food, energy, total_exp, req.classRow.id);
  const labels = { feed: '喂食', pat: '抚摸', play: '玩耍', clean: '清洁' };
  pushPetFeed(req.classRow.id, `🐾 ${labels[action]}（-${cost}★）`);
  res.json({ pet: enrichPet(ensurePet(req.classRow.id, req.classRow.name)) });
});

app.post('/api/pet/settle', auth, requireClass, (req, res) => {
  const day = today();
  const praise = db
    .prepare(
      `SELECT COUNT(*) AS c FROM disciplines WHERE class_id=? AND kind='praise' AND date(created_at)=?`,
    )
    .get(req.classRow.id, day).c;
  const warn = db
    .prepare(
      `SELECT COUNT(*) AS c FROM disciplines WHERE class_id=? AND kind='warn' AND date(created_at)=?`,
    )
    .get(req.classRow.id, day).c;
  const hw = db
    .prepare(
      `SELECT COUNT(*) AS c FROM homework_done hd JOIN homeworks h ON h.id=hd.homework_id
       WHERE h.class_id=? AND date(hd.done_at)=?`,
    )
    .get(req.classRow.id, day).c;
  const stars = praise + hw - warn;
  const exp = praise * 5 + hw * 3 - warn * 4;
  const pet = ensurePet(req.classRow.id, req.classRow.name);
  db.prepare(
    `UPDATE pets SET stars=MAX(0, stars+?), total_exp=MAX(0, total_exp+?), last_settle=datetime('now','localtime') WHERE class_id=?`,
  ).run(stars, exp, req.classRow.id);
  pushPetFeed(
    req.classRow.id,
    `💱 结算：表扬${praise} 作业${hw} 违纪${warn} → 经验${exp >= 0 ? '+' : ''}${exp} 星星${stars >= 0 ? '+' : ''}${stars}`,
  );
  res.json({ pet: enrichPet(ensurePet(req.classRow.id, req.classRow.name)), settle: { praise, warn, hw, stars, exp } });
});

// ---------- Points ----------
app.get('/api/points', auth, requireClass, (req, res) => {
  const rank = db
    .prepare('SELECT id, student_no, name, points FROM students WHERE class_id=? ORDER BY points DESC, id')
    .all(req.classRow.id);
  const log = db
    .prepare('SELECT * FROM points_log WHERE class_id=? ORDER BY id DESC LIMIT 40')
    .all(req.classRow.id);
  const shop = db.prepare('SELECT * FROM shop_items WHERE class_id=? ORDER BY id').all(req.classRow.id);
  const total = rank.reduce((s, x) => s + x.points, 0);
  res.json({ rank, log, shop, summary: { total, students: rank.length } });
});

app.post('/api/points', auth, requireClass, (req, res) => {
  const { studentIds = [], delta, category, reason } = req.body || {};
  if (!studentIds.length || !delta) return res.status(400).json({ error: '请选择学生并指定分数' });
  const tx = db.transaction(() => {
    for (const id of studentIds) {
      const stu = db.prepare('SELECT * FROM students WHERE id=? AND class_id=?').get(id, req.classRow.id);
      if (!stu) continue;
      db.prepare('UPDATE students SET points = points + ? WHERE id=?').run(delta, stu.id);
      db.prepare(
        'INSERT INTO points_log (class_id, student_id, student_name, delta, category, reason) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(req.classRow.id, stu.id, stu.name, delta, category || '其他', reason || '');
    }
  });
  tx();
  trackModule(req.classRow.id, 'points');
  res.json({ ok: true });
});

app.post('/api/shop', auth, requireClass, (req, res) => {
  const { name, cost, stock } = req.body || {};
  if (!name) return res.status(400).json({ error: '商品名必填' });
  const info = db
    .prepare('INSERT INTO shop_items (class_id, name, cost, stock) VALUES (?, ?, ?, ?)')
    .run(req.classRow.id, name, cost || 10, stock ?? 99);
  res.json({ id: info.lastInsertRowid });
});

app.post('/api/shop/:id/redeem', auth, requireClass, (req, res) => {
  const item = db
    .prepare('SELECT * FROM shop_items WHERE id=? AND class_id=?')
    .get(req.params.id, req.classRow.id);
  if (!item) return res.status(404).json({ error: '商品不存在' });
  if (item.stock <= 0) return res.status(400).json({ error: '库存不足' });
  const { studentId } = req.body || {};
  const stu = db.prepare('SELECT * FROM students WHERE id=? AND class_id=?').get(studentId, req.classRow.id);
  if (!stu) return res.status(400).json({ error: '学生不存在' });
  if (stu.points < item.cost) return res.status(400).json({ error: '积分不足' });
  db.prepare('UPDATE students SET points = points - ? WHERE id=?').run(item.cost, stu.id);
  db.prepare('UPDATE shop_items SET stock = stock - 1 WHERE id=?').run(item.id);
  db.prepare(
    'INSERT INTO points_log (class_id, student_id, student_name, delta, category, reason) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(req.classRow.id, stu.id, stu.name, -item.cost, '兑换', item.name);
  res.json({ ok: true });
});

app.delete('/api/shop/:id', auth, requireClass, (req, res) => {
  db.prepare('DELETE FROM shop_items WHERE id=? AND class_id=?').run(req.params.id, req.classRow.id);
  res.json({ ok: true });
});

// ---------- Duty ----------
app.get('/api/duty', auth, requireClass, (req, res) => {
  const classId = req.classRow.id;
  const posts = db
    .prepare('SELECT * FROM duty_posts WHERE class_id=? ORDER BY sort_order, id')
    .all(classId);
  const groups = db
    .prepare('SELECT * FROM duty_groups WHERE class_id=? ORDER BY sort_order, id')
    .all(classId)
    .map((g) => ({
      ...g,
      members: db
        .prepare(
          `SELECT s.id, s.name, s.student_no FROM duty_members dm
           JOIN students s ON s.id=dm.student_id WHERE dm.group_id=?`,
        )
        .all(g.id),
    }));
  let state = db.prepare('SELECT * FROM duty_state WHERE class_id=?').get(classId);
  if (!state) {
    db.prepare(
      `INSERT INTO duty_state (class_id, active_group_id, day) VALUES (?, ?, date('now','localtime'))`,
    ).run(classId, groups[0]?.id || null);
    state = db.prepare('SELECT * FROM duty_state WHERE class_id=?').get(classId);
  }
  const day = state.day || today();
  const checks = db
    .prepare('SELECT * FROM duty_checks WHERE class_id=? AND day=?')
    .all(classId, day);
  const active = groups.find((g) => g.id === state.active_group_id) || groups[0];
  res.json({ posts, groups, state, checks, active });
});

app.post('/api/duty/rotate', auth, requireClass, (req, res) => {
  const dir = req.body?.dir === 'prev' ? -1 : 1;
  const groups = db
    .prepare('SELECT * FROM duty_groups WHERE class_id=? ORDER BY sort_order, id')
    .all(req.classRow.id);
  if (!groups.length) return res.status(400).json({ error: '请先设置值日组' });
  let state = db.prepare('SELECT * FROM duty_state WHERE class_id=?').get(req.classRow.id);
  const idx = Math.max(
    0,
    groups.findIndex((g) => g.id === state?.active_group_id),
  );
  const next = groups[(idx + dir + groups.length) % groups.length];
  db.prepare(
    `UPDATE duty_state SET active_group_id=?, day=date('now','localtime') WHERE class_id=?`,
  ).run(next.id, req.classRow.id);
  res.json({ ok: true, active_group_id: next.id });
});

app.post('/api/duty/check', auth, requireClass, (req, res) => {
  const { postId, studentId, status } = req.body || {};
  const day = today();
  const statuses = ['pending', 'done', 'miss'];
  const next = statuses.includes(status) ? status : 'done';
  db.prepare(
    `INSERT INTO duty_checks (class_id, day, post_id, student_id, status)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(class_id, day, post_id) DO UPDATE SET student_id=excluded.student_id, status=excluded.status`,
  ).run(req.classRow.id, day, postId, studentId || null, next);
  if (next === 'done' && studentId) {
    const stu = db.prepare('SELECT * FROM students WHERE id=?').get(studentId);
    if (stu) {
      db.prepare('UPDATE students SET points = points + 2 WHERE id=?').run(stu.id);
      db.prepare(
        'INSERT INTO points_log (class_id, student_id, student_name, delta, category, reason) VALUES (?, ?, ?, 2, ?, ?)',
      ).run(req.classRow.id, stu.id, stu.name, '值日', '值日完成');
    }
  }
  res.json({ ok: true });
});

app.post('/api/duty/posts', auth, requireClass, (req, res) => {
  const { posts = [] } = req.body || {};
  const classId = req.classRow.id;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM duty_posts WHERE class_id=?').run(classId);
    posts.forEach((name, i) => {
      if (!name) return;
      db.prepare('INSERT INTO duty_posts (class_id, name, sort_order) VALUES (?, ?, ?)').run(
        classId,
        name,
        i,
      );
    });
  });
  tx();
  res.json({ ok: true });
});

// ---------- Admin ----------
app.get('/api/admin/overview', auth, requireAdmin, (req, res) => {
  const range = req.query.range || '7';
  let sinceSql = `datetime('now','localtime','-7 days')`;
  if (range === '1') sinceSql = `datetime('now','localtime','-1 days')`;
  if (range === '30') sinceSql = `datetime('now','localtime','-30 days')`;
  if (range === 'all') sinceSql = `'1970-01-01'`;

  const classes = db
    .prepare('SELECT id, code, name, school, status, usage_count, last_used_at, created_at FROM classes ORDER BY usage_count DESC')
    .all();
  const usage = db
    .prepare(
      `SELECT c.id, c.name, c.code, m.module, COUNT(*) AS cnt
       FROM module_usage m JOIN classes c ON c.id=m.class_id
       WHERE m.created_at >= ${sinceSql}
       GROUP BY c.id, m.module`,
    )
    .all();
  const pending = classes.filter((c) => c.status === 'pending');
  res.json({
    classes,
    usage,
    pending,
    settings: { class_auto_approve: getSetting('class_auto_approve', '0') === '1' },
  });
});

app.post('/api/admin/classes/:id/status', auth, requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'pending', 'disabled'].includes(status)) {
    return res.status(400).json({ error: '状态无效' });
  }
  db.prepare('UPDATE classes SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});

// Serve built client if present
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistCandidates = [
  process.env.CLIENT_DIST,
  path.join(__dirname, '../client/dist'),
  path.join(__dirname, 'client/dist'),
  path.join(__dirname, 'public'),
].filter(Boolean);
const clientDist = clientDistCandidates.find((p) => fs.existsSync(p));
if (clientDist) {
  app.use(express.static(clientDist));
  // Express 5 不再支持 app.get('*')，改用中间件回退到 SPA
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
const wss = attachRealtime(server);

wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url || '', 'http://127.0.0.1');
    const token = url.searchParams.get('token') || '';
    const role = url.searchParams.get('role') || 'client';
    const row = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
    if (!row || row.kind !== 'class') {
      ws.close(4001, 'unauthorized');
      return;
    }
    bindWsSession(ws, row.ref_id, role);
  } catch {
    ws.close();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const net = buildNetInfo(PORT, getSetting('public_url', '') || process.env.PUBLIC_URL || '');
  console.log(`课堂智控台 Pro API 已启动: http://127.0.0.1:${PORT}`);
  if (net.lan.length) {
    console.log('局域网（优先）:');
    net.lan.forEach((u) => console.log(`  ${u}`));
  }
  if (net.publicUrl) console.log(`互联网回退: ${net.publicUrl}`);
  else console.log('互联网回退: 未配置（管理后台可填 public_url，或环境变量 PUBLIC_URL）');
  console.log(`WebSocket: ws://0.0.0.0:${PORT}/ws`);
  console.log('演示班级: DEMO01 / 123456   管理员: admin / admin123');
});
