import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, clearToken, speak } from './api';
import { isBoardWindowAlive, openBoardWindow, wakeBoard } from './boardWake';
import { connectLive } from './liveClient';
import { CameraPanel } from './CameraPanel';
import { SeatMod } from './SeatMod';
import { TimetableMod } from './TimetableMod';

type Tab =
  | 'calling'
  | 'discipline'
  | 'homework'
  | 'picker'
  | 'timer'
  | 'log'
  | 'pet'
  | 'duty'
  | 'points'
  | 'camera'
  | 'seats'
  | 'timetable'
  | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'calling', label: '远程叫人' },
  { id: 'discipline', label: '纪律管理' },
  { id: 'homework', label: '作业布置' },
  { id: 'picker', label: '随机点名' },
  { id: 'timer', label: '计时工具' },
  { id: 'camera', label: '摄像头喊话' },
  { id: 'seats', label: '座位编排' },
  { id: 'timetable', label: '周课表' },
  { id: 'log', label: '班级日志' },
  { id: 'pet', label: '班级宠物' },
  { id: 'duty', label: '值日轮值' },
  { id: 'points', label: '班级积分' },
  { id: 'settings', label: '设置名单' },
];

function fmt(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** 跨设备大屏在线状态（由 Workspace 的 presence 更新） */
let remoteBoardOnline = false;
export function setRemoteBoardOnline(v: boolean) {
  remoteBoardOnline = !!v;
}

/** 教师端推任务：唤醒大屏；若大屏未开则本机播报兜底 */
function pushToBoard(opts: {
  title: string;
  subtitle?: string;
  type?: string;
  speakText?: string;
  speakOpts?: { rate?: number; pitch?: number; times?: number };
}) {
  wakeBoard({ title: opts.title, subtitle: opts.subtitle, type: opts.type });
  const boardAlive = isBoardWindowAlive() || remoteBoardOnline;
  if (!boardAlive && opts.speakText) speak(opts.speakText, opts.speakOpts);
  return boardAlive;
}

export function Workspace({ cls, onLogout }: { cls: any; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('calling');
  const [students, setStudents] = useState<any[]>([]);
  const [live, setLive] = useState({ type: 'idle', title: '课堂就绪', subtitle: '等待指令 · 请先打开教室大屏' });
  const [announce, setAnnounce] = useState<any[]>([]);
  const [cols, setCols] = useState(6);
  const [classInfo, setClassInfo] = useState(cls.class || cls);
  const [syncOk, setSyncOk] = useState(false);
  const [boardOnline, setBoardOnline] = useState(false);
  const [netLabel, setNetLabel] = useState('');

  const loadStudents = useCallback(async () => {
    const d = await api('/api/students');
    setStudents(d.students);
  }, []);

  useEffect(() => {
    loadStudents();
    api('/api/announcements').then((d) => setAnnounce(d.list || [])).catch(() => {});
    import('./netPrefer').then(({ netPathLabel, getNetPath }) => setNetLabel(netPathLabel(getNetPath())));
  }, [loadStudents]);

  // WebSocket 实时同步；教师端再次打开会自动加入同班通道并感知大屏在线
  useEffect(() => {
    const conn = connectLive({
      role: 'teacher',
      onStatus: (s) => setSyncOk(s.includes('已') || s.includes('连接')),
      onPresence: (p) => {
        setBoardOnline(!!p.boardOnline);
        setRemoteBoardOnline(!!p.boardOnline);
        if (p.boardOnline) {
          setLive((s) =>
            s.type === 'idle'
              ? { type: 'idle', title: '课堂就绪', subtitle: '教室大屏已在线 · 可直接发任务' }
              : s,
          );
        }
      },
      onLive: (msg) => {
        const p = msg.payload || {};
        if (msg.type === 'call') {
          const names = p.names || [];
          setLive({
            type: 'call',
            title: names.length > 1 ? names.join('、') : names[0] || '呼叫',
            subtitle:
              names.length > 1
                ? (p.speakParts || []).slice(1).join(' ') || p.texts?.[0] || ''
                : p.texts?.[0] || '',
          });
          wakeBoard({ title: names[0], subtitle: p.texts?.[0], type: 'call', names, speakParts: p.speakParts });
        } else if (msg.type === 'roll') {
          setLive({ type: 'roll', title: p.name, subtitle: '请回答' });
          wakeBoard({ title: p.name, subtitle: '请回答', type: 'roll' });
        } else if (msg.type === 'timer') {
          setLive({ type: 'timer', title: p.display, subtitle: p.subtitle || p.mode });
          wakeBoard({ title: p.display, subtitle: p.subtitle, type: 'timer' });
        } else if (msg.type === 'announce') {
          setAnnounce((a) => [{ content: p.content, created_at: new Date().toISOString() }, ...a]);
          setLive({ type: 'announce', title: '公告', subtitle: p.content });
          wakeBoard({ title: '班级公告', subtitle: p.content, type: 'announce' });
        } else if (msg.type === 'homework' || msg.type === 'discipline') {
          loadStudents();
        } else if (msg.type === 'camera') {
          setLive({
            type: 'camera',
            title: p.action === 'shout' ? '喊话' : '摄像头',
            subtitle: p.text || p.action,
          });
        }
      },
    });
    // HTTP 兜底拉一次 presence
    api('/api/presence')
      .then((p) => {
        setBoardOnline(!!p.boardOnline);
        setRemoteBoardOnline(!!p.boardOnline);
      })
      .catch(() => {});
    return () => conn.close();
  }, [loadStudents]);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          看班智控台
          <small>教师端 · {classInfo.code}</small>
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          {classInfo.school} · {classInfo.name}
          <br />
          同步：{syncOk ? '已连接' : '重连中'}
          <br />
          大屏：{boardOnline ? '在线（已自动连接）' : '离线（一体机 EXE 或网页大屏）'}
          <br />
          网络：{netLabel || '…'}（局域网优先）
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <div>
            <h2>{classInfo.name}</h2>
            <p>
              教师端发任务 → 教室大屏自动显示并播报
              {boardOnline ? ' · 大屏已在线' : ' · 大屏未在线'}
            </p>
          </div>
          <div className="top-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                openBoardWindow();
                setLive({ type: 'idle', title: '大屏已打开', subtitle: '可最小化大屏；发任务时会自动唤起' });
              }}
            >
              打开教室大屏
            </button>
            <a
              className="btn"
              href={`/downloads/${encodeURIComponent('教室大屏智控-安装程序.exe')}`}
              download="教室大屏智控-安装程序.exe"
              title="下载一体机安装程序，安装后托盘待命、右侧今日课表"
            >
              下载一体机安装程序
            </a>
            <button className="btn" type="button" onClick={() => wakeBoard({ title: '测试唤醒', subtitle: '若看到本提示说明联动正常', type: 'wake' })}>
              测试唤醒大屏
            </button>
            <button className="btn" type="button" onClick={() => setTab('settings')}>
              设置
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={async () => {
                try {
                  await api('/api/auth/logout', { method: 'POST' });
                } catch {
                  /* ignore */
                }
                clearToken();
                onLogout();
              }}
            >
              退出班级
            </button>
          </div>
        </header>

        {announce[0] && (
          <div className="banner" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              📢 {announce[0].content}
              {announce[0].link && (
                <>
                  {' '}
                  <a href={announce[0].link} target="_blank" rel="noreferrer">
                    打开链接
                  </a>
                </>
              )}
            </div>
            <button
              className="btn"
              type="button"
              title="清除这条公告显示"
              onClick={async () => {
                try {
                  if (announce[0].id) {
                    await api(`/api/announcements/${announce[0].id}`, { method: 'DELETE' });
                  }
                  const d = await api('/api/announcements');
                  setAnnounce(d.list || []);
                } catch (e: any) {
                  alert(e.message || '清除失败');
                }
              }}
            >
              清除公告
            </button>
          </div>
        )}

        <div className="workspace">
          <div className="controls">
            {tab === 'calling' && (
              <CallMod
                students={students}
                cols={cols}
                setCols={setCols}
                classInfo={classInfo}
                setClassInfo={setClassInfo}
                setLive={setLive}
                reload={loadStudents}
              />
            )}
            {tab === 'discipline' && (
              <DisciplineMod students={students} cols={cols} setCols={setCols} reload={loadStudents} setLive={setLive} />
            )}
            {tab === 'homework' && <HomeworkMod students={students} setLive={setLive} />}
            {tab === 'picker' && (
              <PickerMod students={students} cols={cols} setCols={setCols} setLive={setLive} />
            )}
            {tab === 'timer' && <TimerMod setLive={setLive} />}
            {tab === 'camera' && <CameraPanel setLive={setLive} />}
            {tab === 'seats' && (
              <SeatMod
                students={students}
                onPushBoard={(title, subtitle) =>
                  pushToBoard({ title, subtitle, type: 'seats' })
                }
              />
            )}
            {tab === 'timetable' && <TimetableMod />}
            {tab === 'log' && <LogMod students={students} />}
            {tab === 'pet' && <PetMod />}
            {tab === 'duty' && <DutyMod />}
            {tab === 'points' && <PointsMod students={students} reload={loadStudents} />}
            {tab === 'settings' && (
              <SettingsMod
                students={students}
                classInfo={classInfo}
                setClassInfo={setClassInfo}
                reload={loadStudents}
                announceList={announce}
                setAnnounce={setAnnounce}
              />
            )}
          </div>
          <div className="panel">
            <div className="panel-h">
              <h3>教师端实况预览</h3>
              <button className="btn" type="button" onClick={() => openBoardWindow()}>
                弹出大屏
              </button>
            </div>
            <div className="live">
              <div>
                <div className="k">{live.type.toUpperCase()}</div>
                <div className="t">{live.title}</div>
                <div className="s">{live.subtitle}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav className="mobile-nav" aria-label="教师端功能">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label.replace(/管理|工具|布置|名单|喊话/, '').slice(0, 4) || t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function CallMod({ students, cols, setCols, classInfo, setClassInfo, setLive, reload }: any) {
  const [multi, setMulti] = useState(false);
  const [queue, setQueue] = useState<number[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [tpl, setTpl] = useState(classInfo.call_template || '{name}同学，请到办公室来一趟。');
  const [preview, setPreview] = useState('点击学生查看播报预览');

  useEffect(() => {
    api('/api/call/history').then((d) => setHistory(d.history));
  }, []);

  const call = async (ids: number[]) => {
    const d = await api('/api/call', { method: 'POST', body: JSON.stringify({ studentIds: ids, text: tpl }) });
    const title = d.names.length > 1 ? d.names.join('、') : d.names[0];
    const subtitle =
      d.names.length > 1
        ? (d.speakParts || []).slice(1).join(' ') || d.texts?.[0] || ''
        : d.texts?.[0] || '';
    setLive({ type: 'call', title, subtitle });
    const { buildCallSpeakParts, speakQueue } = await import('./api');
    const parts =
      Array.isArray(d.speakParts) && d.speakParts.length
        ? d.speakParts
        : buildCallSpeakParts(d.names, tpl);
    const boardAlive = pushToBoard({
      title,
      subtitle,
      type: 'call',
      speakText: undefined,
    });
    // 大屏未开时本机按「先姓名后事项」完整播报
    if (!boardAlive) {
      speakQueue(parts, {
        times: classInfo.voice_repeat || 1,
        rate: classInfo.voice_rate || 1,
        pitch: classInfo.voice_pitch || 1,
      });
    }
    setQueue([]);
    setMulti(false);
    setHistory((await api('/api/call/history')).history);
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>远程叫人</h3>
        <select value={cols} onChange={(e) => setCols(Number(e.target.value))}>
          {[4, 5, 6, 7, 8, 10, 12].map((n) => (
            <option key={n} value={n}>
              每行 {n}
            </option>
          ))}
        </select>
      </div>
      <div className="panel-b">
        <div className="toolbar">
          <button className={`btn ${multi ? 'active' : ''}`} type="button" onClick={() => setMulti((v) => !v)}>
            多选模式
          </button>
          {multi && (
            <>
              <button className="btn" type="button" onClick={() => setQueue(students.map((s: any) => s.id))}>
                全选
              </button>
              <button className="btn" type="button" onClick={() => setQueue([])}>
                清空
              </button>
              <button className="btn primary" type="button" disabled={!queue.length} onClick={() => call(queue)}>
                立即呼叫（{queue.length}）
              </button>
            </>
          )}
          <button className="btn" type="button" onClick={() => openBoardWindow()}>
            打开教室大屏
          </button>
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <textarea rows={3} value={tpl} onChange={(e) => setTpl(e.target.value)} placeholder="播报内容，{name} 代表姓名" />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          播报预览：{preview}
        </p>
        <div className="toolbar">
          <span className="muted">语速</span>
          <input
            type="number"
            step="0.1"
            min="0.5"
            max="2"
            style={{ width: 70 }}
            value={classInfo.voice_rate}
            onChange={(e) => setClassInfo({ ...classInfo, voice_rate: Number(e.target.value) })}
          />
          <span className="muted">音调</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            style={{ width: 70 }}
            value={classInfo.voice_pitch}
            onChange={(e) => setClassInfo({ ...classInfo, voice_pitch: Number(e.target.value) })}
          />
          <span className="muted">次数</span>
          <input
            type="number"
            min="1"
            max="10"
            style={{ width: 70 }}
            value={classInfo.voice_repeat}
            onChange={(e) => setClassInfo({ ...classInfo, voice_repeat: Number(e.target.value) })}
          />
          <button
            className="btn ok"
            type="button"
            onClick={() =>
              speak(tpl.replaceAll('{name}', '张三').replaceAll('{姓名}', '张三'), {
                times: classInfo.voice_repeat || 1,
                rate: classInfo.voice_rate || 1,
                pitch: classInfo.voice_pitch || 1,
              })
            }
          >
            试听
          </button>
          <button className="btn" type="button" onClick={() => window.speechSynthesis?.cancel()}>
            停止
          </button>
          <button
            className="btn"
            type="button"
            onClick={() =>
              api('/api/settings', {
                method: 'PUT',
                body: JSON.stringify({
                  call_template: tpl,
                  voice_rate: classInfo.voice_rate,
                  voice_pitch: classInfo.voice_pitch,
                  voice_repeat: classInfo.voice_repeat,
                }),
              }).then(() => setClassInfo({ ...classInfo, call_template: tpl }))
            }
          >
            保存语音设置
          </button>
        </div>
        <div className="grid" style={{ ['--cols' as any]: cols }}>
          {students.map((s: any) => (
            <button
              key={s.id}
              type="button"
              className={`stu ${queue.includes(s.id) ? 'on' : ''}`}
              onClick={() => {
                setPreview(tpl.replaceAll('{name}', s.name).replaceAll('{姓名}', s.name));
                if (multi) setQueue((q) => (q.includes(s.id) ? q.filter((x) => x !== s.id) : [...q, s.id]));
                else call([s.id]);
              }}
            >
              <div className="no">{s.student_no}</div>
              <div className="nm">{s.name}</div>
            </button>
          ))}
        </div>
        <h4 style={{ marginTop: 16 }}>快速呼叫记录</h4>
        <div className="list">
          {history.map((h) => (
            <div className="row" key={h.id}>
              <span>
                {h.names} · {h.created_at}
              </span>
            </div>
          ))}
        </div>
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              try {
                await api('/api/call/history/clear', { method: 'POST', body: '{}' });
                setHistory([]);
              } catch (e: any) {
                try {
                  await api('/api/call/history', { method: 'DELETE' });
                  setHistory([]);
                } catch (e2: any) {
                  alert(e2.message || e.message || '清空失败');
                }
              }
            }}
          >
            清空记录
          </button>
          <button className="btn" type="button" onClick={reload}>
            刷新名单
          </button>
        </div>
      </div>
    </div>
  );
}

function DisciplineMod({ students, cols, setCols, reload, setLive }: any) {
  const [sel, setSel] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [range, setRange] = useState('today');
  const [filter, setFilter] = useState('all');
  const [records, setRecords] = useState<any[]>([]);

  const load = async () => {
    setRecords((await api(`/api/disciplines?range=${range}`)).records);
  };
  useEffect(() => {
    load();
  }, [range]);

  const add = async (kind: 'warn' | 'praise') => {
    if (!sel) return alert('请先选学生');
    await api('/api/disciplines', {
      method: 'POST',
      body: JSON.stringify({ studentId: sel.id, kind, reason }),
    });
    setLive({
      type: 'discipline',
      title: sel.name,
      subtitle: kind === 'praise' ? '受到表扬' : '请注意纪律',
    });
    pushToBoard({
      title: sel.name,
      subtitle: kind === 'praise' ? `表扬：${reason || '表现优秀'}` : `违纪：${reason || '请注意'}`,
      type: 'discipline',
    });
    setReason('');
    load();
    reload();
  };

  const warns = records.filter((r) => r.kind === 'warn');
  const praises = records.filter((r) => r.kind === 'praise');
  const involved = new Set(records.map((r) => r.student_name)).size;
  const shown = filter === 'all' ? records : records.filter((r) => r.kind === filter);

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>纪律管理</h3>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="today">今日</option>
          <option value="week">本周</option>
          <option value="all">全部</option>
        </select>
      </div>
      <div className="panel-b">
        <div className="toolbar">
          <span className="muted">当前：{sel ? sel.name : '未选择'}</span>
          <div className="field">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="事项（讲话/主动回答…）" />
          </div>
          <button className="btn danger" type="button" onClick={() => add('warn')}>
            违纪
          </button>
          <button className="btn ok" type="button" onClick={() => add('praise')}>
            表扬
          </button>
          <select value={cols} onChange={(e) => setCols(Number(e.target.value))}>
            {[4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                每行{n}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar">
          <span className="muted">
            涉及 {involved} 人 · 违纪 {warns.length} · 表扬 {praises.length}
          </span>
          <button className="btn" type="button" onClick={() => api('/api/disciplines?scope=today', { method: 'DELETE' }).then(load)}>
            清空当日
          </button>
          <button className="btn danger" type="button" onClick={() => api('/api/disciplines?scope=all', { method: 'DELETE' }).then(load)}>
            清空全部
          </button>
        </div>
        <div className="grid" style={{ ['--cols' as any]: cols, marginBottom: 12 }}>
          {students.map((s: any) => (
            <button key={s.id} type="button" className={`stu ${sel?.id === s.id ? 'on' : ''}`} onClick={() => setSel(s)}>
              <div className="no">{s.student_no}</div>
              <div className="nm">{s.name}</div>
            </button>
          ))}
        </div>
        <div className="dual">
          <div>
            <h4>违纪 {warns.length}</h4>
            <div className="list">
              {warns.map((r) => (
                <div className="row" key={r.id}>
                  <span>
                    {r.student_name} · {r.reason}
                  </span>
                  <button className="btn" type="button" onClick={() => api(`/api/disciplines/${r.id}`, { method: 'DELETE' }).then(load)}>
                    删
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4>表扬 {praises.length}</h4>
            <div className="list">
              {praises.map((r) => (
                <div className="row" key={r.id}>
                  <span>
                    {r.student_name} · {r.reason}
                  </span>
                  <button className="btn" type="button" onClick={() => api(`/api/disciplines/${r.id}`, { method: 'DELETE' }).then(load)}>
                    删
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <span>详细记录筛选</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">全部</option>
            <option value="warn">仅违纪</option>
            <option value="praise">仅表扬</option>
          </select>
        </div>
        <div className="list">
          {shown.map((r) => (
            <div className="row" key={`d-${r.id}`}>
              <span>
                [{r.kind === 'warn' ? '违纪' : '表扬'}] {r.student_name} · {r.reason}
              </span>
              <span className="muted">{r.created_at}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeworkMod({ students, setLive }: any) {
  const [list, setList] = useState<any[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('全部');
  const [layout, setLayout] = useState<'lr' | 'tb'>('lr');

  const load = async () => {
    const d = await api('/api/homeworks');
    setList(d.homeworks);
    if (!active && d.homeworks[0]) setActive(d.homeworks[0].id);
  };
  useEffect(() => {
    load();
  }, []);

  const hw = list.find((h) => h.id === active);
  const done = new Set(hw?.doneIds || []);
  const undone = students.filter((s: any) => !done.has(s.id));
  const finished = students.filter((s: any) => done.has(s.id));
  const rate = students.length ? Math.round((finished.length / students.length) * 100) : 0;

  const exportStats = () => {
    if (!hw) return;
    const lines = [
      `作业,${hw.title}`,
      `学科,${hw.subject}`,
      `完成率,${rate}%`,
      `学号,姓名,状态`,
      ...students.map((s: any) => `${s.student_no},${s.name},${done.has(s.id) ? '已完成' : '未完成'}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${hw.title}-统计.csv`;
    a.click();
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>作业布置</h3>
        <span className="muted">{hw ? `完成率 ${rate}%` : '未选择作业'}</span>
      </div>
      <div className="panel-b">
        <div className="toolbar">
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {['全部', '语文', '数学', '英语', '科学', '道德与法治', '其他'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <div className="field">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="作业名称" />
          </div>
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              const d = await api('/api/homeworks', { method: 'POST', body: JSON.stringify({ title, subject }) });
              setTitle('');
              await load();
              setActive(d.id);
              setLive({ type: 'homework', title: '新作业', subtitle: title });
              pushToBoard({ title: '新作业', subtitle: title, type: 'homework' });
            }}
          >
            新建
          </button>
          <button className={`btn ${layout === 'lr' ? 'active' : ''}`} type="button" onClick={() => setLayout('lr')}>
            左右
          </button>
          <button className={`btn ${layout === 'tb' ? 'active' : ''}`} type="button" onClick={() => setLayout('tb')}>
            上下
          </button>
          <button className="btn" type="button" onClick={exportStats} disabled={!hw}>
            导出统计
          </button>
        </div>
        <div className="toolbar">
          {list.map((h) => (
            <button key={h.id} type="button" className={`btn ${h.id === active ? 'active' : ''}`} onClick={() => setActive(h.id)}>
              {h.title}
            </button>
          ))}
          {hw && (
            <button
              className="btn danger"
              type="button"
              onClick={async () => {
                await api(`/api/homeworks/${hw.id}`, { method: 'DELETE' });
                setActive(null);
                load();
              }}
            >
              删除当前
            </button>
          )}
        </div>
        {hw && (
          <>
            <div className="toolbar">
              <span className="muted">
                总 {students.length} · 已完成 {finished.length} · 未完成 {undone.length} · {rate}%
              </span>
            </div>
            <div className="dual" style={layout === 'tb' ? { gridTemplateColumns: '1fr' } : undefined}>
              <div>
                <h4>未完成 {undone.length}</h4>
                <div className="list">
                  {undone.map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      className="row"
                      onClick={() =>
                        api(`/api/homeworks/${hw.id}/toggle`, { method: 'POST', body: JSON.stringify({ studentId: s.id }) }).then(load)
                      }
                    >
                      <span>
                        {s.student_no} {s.name}
                      </span>
                      <span className="muted">完成</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h4>已完成 {finished.length}</h4>
                <div className="list">
                  {finished.map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      className="row"
                      onClick={() =>
                        api(`/api/homeworks/${hw.id}/toggle`, { method: 'POST', body: JSON.stringify({ studentId: s.id }) }).then(load)
                      }
                    >
                      <span>
                        {s.student_no} {s.name}
                      </span>
                      <span className="muted">撤销</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PickerMod({ students, cols, setCols, setLive }: any) {
  const [cur, setCur] = useState('— 点击点名 —');
  const [busy, setBusy] = useState(false);
  /** 允许重复点名：默认关（从未点过的同学中抽） */
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const load = async () => setHistory((await api('/api/picker/history')).history);
  useEffect(() => {
    load();
  }, []);

  const picked = useMemo(() => new Set(history.map((h) => h.student_id)), [history]);
  const pool = students.filter((s: any) => (allowRepeat ? true : !picked.has(s.id)));

  const pickOnce = async () => {
    if (busy) return;
    if (!pool.length) {
      alert(allowRepeat ? '暂无学生' : '本轮已全部点过，请点「重置已点」或打开「允许重复点名」');
      return;
    }
    const p = pool[Math.floor(Math.random() * pool.length)];
    if (!p) return;
    setBusy(true);
    try {
      // 只展示最终结果，不滚动中间过程
      setCur(p.name);
      await api('/api/picker', { method: 'POST', body: JSON.stringify({ studentId: p.id }) });
      setLive({ type: 'roll', title: p.name, subtitle: '请回答' });
      pushToBoard({
        title: p.name,
        subtitle: '请回答',
        type: 'roll',
        speakText: `${p.name}同学`,
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>随机点名</h3>
      </div>
      <div className="panel-b">
        <div className="live" style={{ minHeight: 160, marginBottom: 12, borderRadius: 14 }}>
          <div className="t">{cur}</div>
        </div>
        <div className="toolbar">
          <button className="btn primary" type="button" disabled={busy} onClick={pickOnce}>
            {busy ? '点名中…' : '点名'}
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              await api('/api/picker/history', { method: 'DELETE' });
              setCur('— 点击点名 —');
              load();
            }}
          >
            重置已点
          </button>
          <button
            className={`btn ${allowRepeat ? 'active' : ''}`}
            type="button"
            title={allowRepeat ? '当前允许抽到已点过的同学' : '当前只从未点过的同学中抽'}
            onClick={() => setAllowRepeat((v) => !v)}
          >
            允许重复点名：{allowRepeat ? '开' : '关'}
          </button>
          <select value={cols} onChange={(e) => setCols(Number(e.target.value))}>
            {[4, 5, 6, 7, 8, 10].map((n) => (
              <option key={n} value={n}>
                每行{n}
              </option>
            ))}
          </select>
          <span className="muted">
            已点 {picked.size} / {students.length}
            {!allowRepeat && pool.length === 0 && picked.size > 0 ? ' · 请重置或开重复' : ''}
          </span>
        </div>
        <div className="grid" style={{ ['--cols' as any]: cols }}>
          {students.map((s: any) => (
            <div key={s.id} className={`stu ${picked.has(s.id) ? 'on' : ''}`} style={{ opacity: picked.has(s.id) ? 0.55 : 1 }}>
              <div className="no">{s.student_no}</div>
              <div className="nm">{s.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimerMod({ setLive }: any) {
  const [remain, setRemain] = useState(5 * 60 * 1000);
  const [mins, setMins] = useState(5);
  const [secs, setSecs] = useState(0);
  const [running, setRunning] = useState(false);
  const [sw, setSw] = useState(0);
  const [swRun, setSwRun] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const last = useRef(0);

  useEffect(() => {
    if (!running && !swRun) return;
    last.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - last.current;
      last.current = now;
      if (running) {
        setRemain((r) => {
          const n = r - dt;
          if (n <= 0) {
            setRunning(false);
            setLive({ type: 'timer', title: '00:00', subtitle: '时间到' });
            api('/api/timer/live', { method: 'POST', body: JSON.stringify({ mode: 'countdown', display: '00:00', subtitle: '时间到' }) });
            pushToBoard({ title: '00:00', subtitle: '时间到', type: 'timer', speakText: '时间到' });
            return 0;
          }
          if (Math.floor(n / 200) !== Math.floor(r / 200)) {
            const display = fmt(n);
            setLive({ type: 'timer', title: display, subtitle: '倒计时' });
            api('/api/timer/live', { method: 'POST', body: JSON.stringify({ mode: 'countdown', display, subtitle: '倒计时' }) });
            wakeBoard({ title: display, subtitle: '倒计时', type: 'timer' });
          }
          return n;
        });
      }
      if (swRun) {
        setSw((v) => {
          const n = v + dt;
          if (Math.floor(n / 100) !== Math.floor(v / 100)) {
            const display = fmt(n) + '.' + String(Math.floor((n % 1000) / 100));
            setLive({ type: 'timer', title: display, subtitle: '秒表' });
          }
          return n;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, swRun, setLive]);

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>计时工具</h3>
      </div>
      <div className="panel-b dual">
        <div>
          <h4>倒计时 {fmt(remain)}</h4>
          <div className="toolbar">
            {[1, 3, 5, 10, 15, 30].map((m) => (
              <button
                key={m}
                className="btn"
                type="button"
                onClick={() => {
                  setMins(m);
                  setSecs(0);
                  setRemain(m * 60000);
                  setRunning(false);
                }}
              >
                {m}分
              </button>
            ))}
          </div>
          <div className="toolbar">
            <input type="number" style={{ width: 70 }} value={mins} onChange={(e) => setMins(Number(e.target.value))} /> 分
            <input type="number" style={{ width: 70 }} value={secs} onChange={(e) => setSecs(Number(e.target.value))} /> 秒
            <button className="btn" type="button" onClick={() => setRemain((mins * 60 + secs) * 1000)}>
              设置
            </button>
            <button className="btn primary" type="button" onClick={() => setRunning(true)}>
              开始
            </button>
            <button className="btn" type="button" onClick={() => setRunning(false)}>
              暂停
            </button>
          </div>
        </div>
        <div>
          <h4>
            秒表 {fmt(sw)}.{Math.floor((sw % 1000) / 100)}
          </h4>
          <div className="toolbar">
            <button className="btn primary" type="button" onClick={() => setSwRun(true)}>
              开始
            </button>
            <button className="btn" type="button" onClick={() => setSwRun(false)}>
              暂停
            </button>
            <button className="btn amber" type="button" onClick={() => setLaps((l) => [sw, ...l])}>
              记圈
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setSwRun(false);
                setSw(0);
                setLaps([]);
              }}
            >
              重置
            </button>
          </div>
          <div className="list">
            {laps.map((l, i) => (
              <div className="row" key={i}>
                <span>圈 {laps.length - i}</span>
                <strong>{fmt(l)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LogMod({ students }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const [type, setType] = useState('event');
  const [filter, setFilter] = useState('all');
  const [studentId, setStudentId] = useState('');
  const [content, setContent] = useState('');
  const load = async () => setLogs((await api(`/api/logs?type=${filter}`)).logs);
  useEffect(() => {
    load();
  }, [filter]);
  return (
    <div className="panel">
      <div className="panel-h">
        <h3>班级日志</h3>
      </div>
      <div className="panel-b">
        <div className="toolbar">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="event">事件</option>
            <option value="remind">提醒</option>
            <option value="note">备忘</option>
            <option value="incident">突发</option>
          </select>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">通用</option>
            {students.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="记录今天课堂…" style={{ width: '100%', marginBottom: 8 }} />
        <button
          className="btn primary"
          type="button"
          onClick={async () => {
            await api('/api/logs', {
              method: 'POST',
              body: JSON.stringify({ type, studentId: studentId ? Number(studentId) : null, content }),
            });
            setContent('');
            load();
          }}
        >
          记录
        </button>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">全部</option>
            <option value="event">事件</option>
            <option value="remind">提醒</option>
            <option value="note">备忘</option>
            <option value="incident">突发</option>
          </select>
          <button className="btn danger" type="button" onClick={() => api('/api/logs', { method: 'DELETE' }).then(load)}>
            清空全部
          </button>
        </div>
        <div className="list">
          {logs.map((l) => (
            <div className="row" key={l.id}>
              <span>
                [{l.type}] {l.student_name || '通用'} · {l.content}
              </span>
              <span className="muted">{l.created_at}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PetMod() {
  const [data, setData] = useState<any>(null);
  const [rank, setRank] = useState<any[]>([]);
  const load = async () => {
    setData(await api('/api/pet'));
    try {
      const pts = await api('/api/points');
      setRank((pts.rank || []).slice(0, 5));
    } catch {
      setRank([]);
    }
  };
  useEffect(() => {
    load();
  }, []);
  if (!data) return <div className="panel"><div className="panel-b">加载中…</div></div>;
  const { pet, today } = data;
  return (
    <div className="panel">
      <div className="panel-h">
        <h3>
          班级宠物 Lv.{pet.level}
        </h3>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const name = prompt('新名字', pet.name);
            if (!name) return;
            await api('/api/pet/rename', { method: 'PUT', body: JSON.stringify({ name }) });
            load();
          }}
        >
          改名
        </button>
      </div>
      <div className="panel-b">
        <div className="pet-stage">
          {pet.stage.emoji}
          <div>
            {pet.name} · {pet.stage.name} · ⭐{pet.stars}
          </div>
        </div>
        <p className="muted">经验 {pet.exp_cur}/{pet.exp_need}</p>
        <div className="bar"><i style={{ width: `${(pet.exp_cur / pet.exp_need) * 100}%` }} /></div>
        <p className="muted">心情 {pet.mood} · 饱食 {pet.food} · 活力 {pet.energy}</p>
        <div className="toolbar">
          {(['feed', 'pat', 'play', 'clean'] as const).map((a) => (
            <button
              key={a}
              className="btn"
              type="button"
              onClick={async () => {
                try {
                  await api('/api/pet/act', { method: 'POST', body: JSON.stringify({ action: a }) });
                  load();
                } catch (e: any) {
                  alert(e.message);
                }
              }}
            >
              {a === 'feed' ? '喂食5★' : a === 'pat' ? '抚摸1★' : a === 'play' ? '玩耍3★' : '清洁2★'}
            </button>
          ))}
          <button className="btn primary" type="button" onClick={() => api('/api/pet/settle', { method: 'POST' }).then(load)}>
            一键结算
          </button>
        </div>
        <p className="muted">
          今日：表扬 {today.praise} · 作业 {today.hw} · 违纪 {today.warn}
        </p>
        <h4>学生贡献榜 TOP5</h4>
        <div className="list">
          {rank.map((s: any, i: number) => (
            <div className="row" key={s.id}>
              <span>
                {i + 1}. {s.name}
              </span>
              <strong>{s.points} 分</strong>
            </div>
          ))}
          {!rank.length && <p className="muted">暂无积分数据</p>}
        </div>
        <h4>宠物动态</h4>
        <div className="list">
          {(pet.feed || []).map((f: any, i: number) => (
            <div className="row" key={i}>
              <span>{f.m}</span>
              <span className="muted">{f.t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DutyMod() {
  const [data, setData] = useState<any>(null);
  const [postText, setPostText] = useState('');
  const load = async () => setData(await api('/api/duty'));
  useEffect(() => {
    load();
  }, []);
  if (!data) return null;
  const { posts, active, checks, groups } = data;
  const members = active?.members || [];
  return (
    <div className="panel">
      <div className="panel-h">
        <h3>今日值日 · {active?.name || '未分组'}</h3>
        <div>
          <button className="btn" type="button" onClick={() => api('/api/duty/rotate', { method: 'POST', body: JSON.stringify({ dir: 'prev' }) }).then(load)}>
            上一组
          </button>{' '}
          <button className="btn primary" type="button" onClick={() => api('/api/duty/rotate', { method: 'POST', body: JSON.stringify({ dir: 'next' }) }).then(load)}>
            下一组
          </button>
        </div>
      </div>
      <div className="panel-b">
        <div className="dual">
          {posts.map((p: any, i: number) => {
            const m = members[i % Math.max(members.length, 1)];
            const ck = checks.find((c: any) => c.post_id === p.id);
            const status = ck?.status || 'pending';
            return (
              <button
                key={p.id}
                type="button"
                className="row"
                onClick={async () => {
                  const order = ['pending', 'done', 'miss'];
                  const next = order[(order.indexOf(status) + 1) % 3];
                  await api('/api/duty/check', {
                    method: 'POST',
                    body: JSON.stringify({ postId: p.id, studentId: m?.id, status: next }),
                  });
                  load();
                }}
              >
                <span>
                  {p.name} · {m?.name || '待分配'}
                </span>
                <strong>{status === 'done' ? '已完成' : status === 'miss' ? '未完成' : '待完成'}</strong>
              </button>
            );
          })}
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          共 {groups.length} 个值日组，点卡片切换状态；完成自动 +2 积分。
        </p>
        <h4>岗位设置</h4>
        <div className="toolbar">
          <div className="field">
            <input
              value={postText || posts.map((p: any) => p.name).join(',')}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="用逗号分隔，如：黑板,扫地,倒垃圾,窗户"
            />
          </div>
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              const postsArr = (postText || posts.map((p: any) => p.name).join(','))
                .split(/[,，]/)
                .map((x: string) => x.trim())
                .filter(Boolean);
              await api('/api/duty/posts', { method: 'POST', body: JSON.stringify({ posts: postsArr }) });
              load();
            }}
          >
            保存岗位
          </button>
        </div>
        <h4>值日组一览</h4>
        <div className="list">
          {groups.map((g: any) => (
            <div className="row" key={g.id}>
              <span>
                {g.name}（{g.members?.length || 0} 人）
              </span>
              <span className="muted">{(g.members || []).map((m: any) => m.name).join('、')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PointsMod({ students, reload }: any) {
  const [data, setData] = useState<any>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [category, setCategory] = useState('其他');
  const [reason, setReason] = useState('');
  const load = async () => setData(await api('/api/points'));
  useEffect(() => {
    load();
  }, []);
  if (!data) return null;
  const apply = async (delta: number) => {
    if (!sel.length) return alert('先选择学生');
    await api('/api/points', { method: 'POST', body: JSON.stringify({ studentIds: sel, delta, category, reason }) });
    setSel([]);
    load();
    reload();
  };
  return (
    <div className="panel">
      <div className="panel-h">
        <h3>班级积分 · 总分 {data.summary.total}</h3>
      </div>
      <div className="panel-b">
        <div className="grid" style={{ ['--cols' as any]: 6, marginBottom: 12 }}>
          {students.map((s: any) => (
            <button
              key={s.id}
              type="button"
              className={`stu ${sel.includes(s.id) ? 'on' : ''}`}
              onClick={() => setSel((q) => (q.includes(s.id) ? q.filter((x) => x !== s.id) : [...q, s.id]))}
            >
              <div className="no">{s.points}分</div>
              <div className="nm">{s.name}</div>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {['作业', '纪律', '卫生', '助人', '进步', '值日', '其他'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="field">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由" />
          </div>
          {[1, 2, 3, 5, -1, -2, -3, -5].map((n) => (
            <button key={n} className={`btn ${n > 0 ? 'ok' : 'danger'}`} type="button" onClick={() => apply(n)}>
              {n > 0 ? `+${n}` : n}
            </button>
          ))}
        </div>
        <div className="dual">
          <div>
            <h4>排行</h4>
            <div className="list">
              {data.rank.slice(0, 20).map((s: any, i: number) => (
                <div className="row" key={s.id}>
                  <span>
                    {i + 1}. {s.name}
                  </span>
                  <strong>{s.points}</strong>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4>兑换商城</h4>
            <div className="toolbar">
              <input id="shopName" placeholder="商品名" style={{ width: 100 }} />
              <input id="shopCost" type="number" placeholder="积分" style={{ width: 70 }} defaultValue={10} />
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  const name = (document.getElementById('shopName') as HTMLInputElement).value;
                  const cost = Number((document.getElementById('shopCost') as HTMLInputElement).value || 10);
                  if (!name) return;
                  await api('/api/shop', { method: 'POST', body: JSON.stringify({ name, cost, stock: 99 }) });
                  load();
                }}
              >
                添加商品
              </button>
            </div>
            <div className="list">
              {data.shop.map((item: any) => (
                <div className="row" key={item.id}>
                  <span>
                    {item.name} · {item.cost}分 · 库存{item.stock}
                  </span>
                  <span>
                    <button
                      className="btn"
                      type="button"
                      onClick={async () => {
                        if (sel.length !== 1) return alert('请只选 1 名学生兑换');
                        try {
                          await api(`/api/shop/${item.id}/redeem`, {
                            method: 'POST',
                            body: JSON.stringify({ studentId: sel[0] }),
                          });
                          load();
                          reload();
                        } catch (e: any) {
                          alert(e.message);
                        }
                      }}
                    >
                      兑换
                    </button>{' '}
                    <button className="btn danger" type="button" onClick={() => api(`/api/shop/${item.id}`, { method: 'DELETE' }).then(load)}>
                      删
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <h4>流水</h4>
        <div className="list">
          {data.log.map((l: any) => (
            <div className="row" key={l.id}>
              <span>
                {l.student_name} {l.delta > 0 ? '+' : ''}
                {l.delta} · {l.category} {l.reason}
              </span>
              <span className="muted">{l.created_at}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsMod({ students, classInfo, setClassInfo, reload, announceList = [], setAnnounce }: any) {
  const [csv, setCsv] = useState('');
  const [ann, setAnn] = useState('');
  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '' });
  const announceRows = Array.isArray(announceList) ? announceList : [];

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>设置 / 名单 / 公告 / 备份</h3>
      </div>
      <div className="panel-b stack">
        <label>班级昵称</label>
        <input
          value={classInfo.name}
          onChange={(e) => setClassInfo({ ...classInfo, name: e.target.value })}
          onBlur={() => api('/api/settings', { method: 'PUT', body: JSON.stringify({ name: classInfo.name }) })}
        />
        <label>语速 / 音调 / 播报次数</label>
        <div className="toolbar">
          <input
            type="number"
            step="0.1"
            value={classInfo.voice_rate}
            onChange={(e) => setClassInfo({ ...classInfo, voice_rate: Number(e.target.value) })}
          />
          <input
            type="number"
            step="0.1"
            value={classInfo.voice_pitch}
            onChange={(e) => setClassInfo({ ...classInfo, voice_pitch: Number(e.target.value) })}
          />
          <input
            type="number"
            value={classInfo.voice_repeat}
            onChange={(e) => setClassInfo({ ...classInfo, voice_repeat: Number(e.target.value) })}
          />
          <button
            className="btn primary"
            type="button"
            onClick={() =>
              api('/api/settings', {
                method: 'PUT',
                body: JSON.stringify({
                  voice_rate: classInfo.voice_rate,
                  voice_pitch: classInfo.voice_pitch,
                  voice_repeat: classInfo.voice_repeat,
                }),
              })
            }
          >
            保存语音
          </button>
        </div>

        <label>导入名单（学号,姓名,性别）覆盖</label>
        <textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div className="toolbar">
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              await api('/api/students/import', { method: 'POST', body: JSON.stringify({ text: csv }) });
              setCsv('');
              reload();
            }}
          >
            粘贴导入
          </button>
          <a className="btn" href="/api/students/template">
            下载 Excel 模板
          </a>
          <label className="btn">
            上传 Excel
            <input
              hidden
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('file', file);
                await api('/api/students/import', { method: 'POST', body: fd });
                reload();
              }}
            />
          </label>
          <button className="btn danger" type="button" onClick={() => api('/api/students', { method: 'DELETE' }).then(reload)}>
            清空名单
          </button>
        </div>

        <label>发布公告</label>
        <textarea rows={2} value={ann} onChange={(e) => setAnn(e.target.value)} />
        <div className="toolbar">
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              await api('/api/announcements', { method: 'POST', body: JSON.stringify({ content: ann }) });
              setAnn('');
              setAnnounce((await api('/api/announcements')).list);
              pushToBoard({ title: '班级公告', subtitle: ann, type: 'announce', speakText: `公告：${ann}` });
            }}
          >
            发布并推送到大屏
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={async () => {
              const rows = (await api('/api/announcements')).list || [];
              for (const a of rows) {
                if (a.id) await api(`/api/announcements/${a.id}`, { method: 'DELETE' });
              }
              setAnnounce([]);
              alert('已清空全部公告');
            }}
          >
            清空全部公告
          </button>
        </div>
        {announceRows.length > 0 && (
          <div className="panel-block" style={{ marginTop: 8 }}>
            <strong>当前公告</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {announceRows.slice(0, 8).map((a: any) => (
                <li key={a.id || a.content}>
                  {a.content}{' '}
                  <button
                    className="btn"
                    type="button"
                    style={{ padding: '2px 8px', fontSize: 12 }}
                    onClick={async () => {
                      if (a.id) await api(`/api/announcements/${a.id}`, { method: 'DELETE' });
                      setAnnounce((await api('/api/announcements')).list || []);
                    }}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label>修改密码</label>
        <div className="toolbar">
          <input type="password" placeholder="原密码" value={pwd.oldPassword} onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })} />
          <input type="password" placeholder="新密码" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
          <button
            className="btn"
            type="button"
            onClick={async () => {
              try {
                await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify(pwd) });
                alert('已修改');
              } catch (e: any) {
                alert(e.message);
              }
            }}
          >
            修改
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const data = await api('/api/backup');
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${classInfo.code}-backup.json`;
              a.click();
            }}
          >
            备份导出
          </button>
          <label className="btn">
            恢复备份
            <input
              hidden
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const data = JSON.parse(text);
                  const r = await api('/api/backup/restore', { method: 'POST', body: JSON.stringify(data) });
                  alert(`已恢复 ${r.count} 名学生`);
                  reload();
                } catch (err: any) {
                  alert(err.message || '恢复失败');
                }
              }}
            />
          </label>
        </div>

        <label>添加单个学生</label>
        <div className="toolbar">
          <input id="addNo" placeholder="学号" style={{ width: 80 }} />
          <input id="addName" placeholder="姓名" />
          <select id="addGender" defaultValue="男">
            <option>男</option>
            <option>女</option>
            <option value="">-</option>
          </select>
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              const no = (document.getElementById('addNo') as HTMLInputElement).value;
              const name = (document.getElementById('addName') as HTMLInputElement).value;
              const gender = (document.getElementById('addGender') as HTMLSelectElement).value;
              if (!name) return alert('请填姓名');
              await api('/api/students', { method: 'POST', body: JSON.stringify({ student_no: no, name, gender }) });
              reload();
            }}
          >
            添加
          </button>
        </div>

        <p className="muted">当前 {students.length} 名学生 · 可打开教室大屏窗口后最小化，教师端发任务会自动唤起</p>
        <button className="btn primary" type="button" onClick={() => openBoardWindow()}>
          打开教室大屏窗口
        </button>
      </div>
    </div>
  );
}
