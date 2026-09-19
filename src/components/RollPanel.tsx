import { useEffect, useRef, useState } from 'react';
import type { Store } from '../hooks/useAppStore';
import { speak } from '../lib/speech';

export function RollPanel({ store }: { store: Store }) {
  const { state, markPicked, clearPicked, emitLive } = store;
  const [scope, setScope] = useState<'all' | 'unpicked'>('all');
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string>('准备就绪');
  const [winner, setWinner] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const pool = state.students.filter((s) =>
    scope === 'all' ? true : !state.pickedIds.includes(s.id),
  );

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  const start = () => {
    if (!pool.length) {
      setCurrent('名单已空');
      return;
    }
    setWinner(null);
    setRunning(true);
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setCurrent(pick.name);
      emitLive({ type: 'roll', title: pick.name, subtitle: '随机点名中…', accent: '#c9782c' });
    }, 80);
  };

  const stop = () => {
    if (!running) return;
    if (timer.current) window.clearInterval(timer.current);
    setRunning(false);
    const finalPool = pool.length ? pool : state.students;
    const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
    setCurrent(pick.name);
    setWinner(pick.name);
    markPicked(pick.id);
    emitLive({ type: 'roll', title: pick.name, subtitle: '请回答', accent: '#c9782c' });
    speak(`${pick.name}同学`);
  };

  return (
    <div className="panel controls">
      <div className="panel-head">
        <div>
          <h2>随机点名</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            公平滚动抽取，已点名单可避免重复
          </p>
        </div>
      </div>
      <div className="panel-body">
        <div className="roll-arena">
          <div className="roll-name">{current}</div>
        </div>
        <div className="toolbar">
          <button className="btn" type="button" onClick={() => setScope('all')}>
            范围：{scope === 'all' ? '全班' : '未点到'}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => setScope((s) => (s === 'all' ? 'unpicked' : 'all'))}
          >
            切换范围
          </button>
          {!running ? (
            <button className="btn primary" type="button" onClick={start}>
              开始
            </button>
          ) : (
            <button className="btn amber" type="button" onClick={stop}>
              停止
            </button>
          )}
          <button className="btn" type="button" onClick={clearPicked}>
            清空已点
          </button>
        </div>
        {winner && <p className="muted">本轮抽中：{winner}</p>}
        <p className="muted">已点 {state.pickedIds.length} 人 / 共 {state.students.length} 人</p>
        <div className="student-grid">
          {state.students.map((s) => (
            <div
              key={s.id}
              className={`stu-card ${state.pickedIds.includes(s.id) ? 'selected' : ''}`}
              style={{ opacity: state.pickedIds.includes(s.id) ? 0.55 : 1 }}
            >
              <div className="no">{s.no}</div>
              <div className="name">{s.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
