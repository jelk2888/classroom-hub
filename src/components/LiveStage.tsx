import type { LiveSignal } from '../types';
import type { Store } from '../hooks/useAppStore';

export function LiveStage({ live, store }: { live: LiveSignal; store: Store }) {
  const { state, activeHomework, todayStats } = store;
  const hwRate =
    activeHomework && state.students.length
      ? Math.round((activeHomework.doneIds.length / state.students.length) * 100)
      : null;

  return (
    <div className="panel live-panel">
      <div className="panel-head">
        <div>
          <h2>教室大屏实况</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {state.className} · 口令 {state.roomCode}
          </p>
        </div>
      </div>
      <div className="live-stage">
        <div className="live-kicker">
          {live.type === 'idle' && 'READY'}
          {live.type === 'call' && 'CALL'}
          {live.type === 'roll' && 'ROLL CALL'}
          {live.type === 'timer' && 'TIMER'}
        </div>
        {live.type === 'timer' ? (
          <div className="live-timer">{live.title}</div>
        ) : (
          <div className="live-title" key={live.updatedAt}>
            {live.title}
          </div>
        )}
        {live.subtitle && <div className="live-sub">{live.subtitle}</div>}
        <div style={{ marginTop: 28, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span className="stat-pill" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'transparent', color: '#fff' }}>
            表扬 {todayStats.praise}
          </span>
          <span className="stat-pill" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'transparent', color: '#fff' }}>
            违纪 {todayStats.violation}
          </span>
          {hwRate !== null && (
            <span className="stat-pill" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'transparent', color: '#fff' }}>
              作业 {hwRate}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
