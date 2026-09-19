import { useEffect, useRef, useState } from 'react';
import type { Store } from '../hooks/useAppStore';
import { speak } from '../lib/speech';

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function fmtStop(ms: number): string {
  const total = Math.floor(ms / 10);
  const cs = String(total % 100).padStart(2, '0');
  const sec = Math.floor(total / 100);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}.${cs}`;
}

const PRESETS = [1, 3, 5, 10, 15, 30];

export function TimerPanel({ store }: { store: Store }) {
  const { emitLive } = store;
  const [tab, setTab] = useState<'countdown' | 'stopwatch'>('countdown');
  const [minutes, setMinutes] = useState(5);
  const [remain, setRemain] = useState(5 * 60 * 1000);
  const [cdRunning, setCdRunning] = useState(false);
  const [swMs, setSwMs] = useState(0);
  const [swRunning, setSwRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const last = useRef(0);
  const remainRef = useRef(remain);
  const swRef = useRef(swMs);
  remainRef.current = remain;
  swRef.current = swMs;

  useEffect(() => {
    if (!cdRunning && !swRunning) return;
    last.current = performance.now();
    let raf = 0;
    let lastPublish = 0;
    const tick = (now: number) => {
      const dt = now - last.current;
      last.current = now;
      if (cdRunning) {
        const next = remainRef.current - dt;
        if (next <= 0) {
          remainRef.current = 0;
          setRemain(0);
          setCdRunning(false);
          speak('时间到');
          emitLive({ type: 'timer', title: '00:00', subtitle: '时间到', accent: '#b54a4a' });
        } else {
          remainRef.current = next;
          setRemain(next);
          if (now - lastPublish > 200) {
            lastPublish = now;
            emitLive({ type: 'timer', title: fmt(next), subtitle: '倒计时', accent: '#0b6e63' });
          }
        }
      }
      if (swRunning) {
        const next = swRef.current + dt;
        swRef.current = next;
        setSwMs(next);
        if (now - lastPublish > 100) {
          lastPublish = now;
          emitLive({ type: 'timer', title: fmtStop(next), subtitle: '秒表', accent: '#c9782c' });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cdRunning, swRunning, emitLive]);

  const applyPreset = (m: number) => {
    setMinutes(m);
    setRemain(m * 60 * 1000);
    setCdRunning(false);
  };

  return (
    <div className="panel controls">
      <div className="panel-head">
        <div>
          <h2>计时工具</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            倒计时到点播报，秒表支持记圈
          </p>
        </div>
      </div>
      <div className="panel-body">
        <div className="tabs">
          <button type="button" className={tab === 'countdown' ? 'on' : ''} onClick={() => setTab('countdown')}>
            倒计时
          </button>
          <button type="button" className={tab === 'stopwatch' ? 'on' : ''} onClick={() => setTab('stopwatch')}>
            秒表
          </button>
        </div>

        {tab === 'countdown' ? (
          <>
            <div className="roll-arena">
              <div className="live-timer" style={{ color: 'var(--teal-deep)' }}>
                {fmt(remain)}
              </div>
            </div>
            <div className="toolbar">
              {PRESETS.map((m) => (
                <button key={m} className="btn" type="button" onClick={() => applyPreset(m)}>
                  {m} 分
                </button>
              ))}
            </div>
            <div className="toolbar">
              <div className="field" style={{ maxWidth: 140 }}>
                <input
                  type="number"
                  min={1}
                  value={minutes}
                  onChange={(e) => {
                    const m = Math.max(1, Number(e.target.value) || 1);
                    setMinutes(m);
                    setRemain(m * 60 * 1000);
                  }}
                />
              </div>
              <button className="btn primary" type="button" onClick={() => setCdRunning(true)} disabled={cdRunning}>
                开始
              </button>
              <button className="btn" type="button" onClick={() => setCdRunning(false)}>
                暂停
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setCdRunning(false);
                  setRemain(minutes * 60 * 1000);
                }}
              >
                复位
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="roll-arena">
              <div className="live-timer" style={{ color: 'var(--amber)' }}>
                {fmtStop(swMs)}
              </div>
            </div>
            <div className="toolbar">
              <button className="btn primary" type="button" onClick={() => setSwRunning(true)} disabled={swRunning}>
                开始
              </button>
              <button className="btn" type="button" onClick={() => setSwRunning(false)}>
                暂停
              </button>
              <button className="btn amber" type="button" onClick={() => setLaps((l) => [swMs, ...l])}>
                记圈
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setSwRunning(false);
                  setSwMs(0);
                  setLaps([]);
                }}
              >
                复位
              </button>
            </div>
            <div className="stack">
              {laps.map((lap, i) => (
                <div key={`${lap}-${i}`} className="chip-row">
                  <span>圈 {laps.length - i}</span>
                  <strong>{fmtStop(lap)}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
