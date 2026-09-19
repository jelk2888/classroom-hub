import type { Store } from '../hooks/useAppStore';

export function CallPanel({ store }: { store: Store }) {
  const { state, multiCall, setMultiCall, callQueue, toggleCallSelect, callStudents, patch } = store;

  return (
    <div className="panel controls">
      <div className="panel-head">
        <div>
          <h2>远程叫人</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            点选学生，教室大屏播报
          </p>
        </div>
      </div>
      <div className="panel-body">
        <div className="toolbar">
          <button
            className={`btn ${multiCall ? 'active' : ''}`}
            onClick={() => setMultiCall((v) => !v)}
            type="button"
          >
            {multiCall ? '多选中' : '多选模式'}
          </button>
          {multiCall && (
            <button
              className="btn primary"
              type="button"
              disabled={!callQueue.length}
              onClick={() => callStudents(callQueue)}
            >
              立即呼叫（{callQueue.length}）
            </button>
          )}
          <div className="field" style={{ flex: 1.4 }}>
            <input
              value={state.callTemplate}
              onChange={(e) => patch({ callTemplate: e.target.value })}
              placeholder="播报文案，可用 {姓名}"
            />
          </div>
        </div>
        <div className="student-grid">
          {state.students.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`stu-card ${callQueue.includes(s.id) ? 'selected' : ''}`}
              onClick={() => toggleCallSelect(s.id)}
            >
              <div className="no">{s.no}</div>
              <div className="name">{s.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
