import { useMemo, useState } from 'react';
import type { Store } from '../hooks/useAppStore';

export function HomeworkPanel({ store }: { store: Store }) {
  const {
    state,
    activeHomework,
    createHomework,
    toggleHomeworkDone,
    deleteHomework,
    patch,
  } = store;
  const [title, setTitle] = useState('');

  const { undone, done, rate } = useMemo(() => {
    if (!activeHomework) return { undone: state.students, done: [], rate: 0 };
    const doneList = state.students.filter((s) => activeHomework.doneIds.includes(s.id));
    const undoneList = state.students.filter((s) => !activeHomework.doneIds.includes(s.id));
    const r = state.students.length
      ? Math.round((doneList.length / state.students.length) * 100)
      : 0;
    return { undone: undoneList, done: doneList, rate: r };
  }, [activeHomework, state.students]);

  return (
    <div className="panel controls">
      <div className="panel-head">
        <div>
          <h2>作业布置</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {activeHomework
              ? `已完成 ${done.length} 人 · 完成率 ${rate}%`
              : '新建作业后点选学生切换完成状态'}
          </p>
        </div>
      </div>
      <div className="panel-body">
        <div className="toolbar">
          <div className="field">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="作业名称，如：《劝学》背诵"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  createHomework(title);
                  setTitle('');
                }
              }}
            />
          </div>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              createHomework(title);
              setTitle('');
            }}
          >
            新建
          </button>
        </div>

        {state.homeworks.length > 0 && (
          <div className="tabs">
            {state.homeworks.map((hw) => (
              <button
                key={hw.id}
                type="button"
                className={hw.id === state.activeHomeworkId ? 'on' : ''}
                onClick={() => patch({ activeHomeworkId: hw.id })}
              >
                {hw.title}
              </button>
            ))}
            {activeHomework && (
              <button className="btn danger" type="button" onClick={() => deleteHomework(activeHomework.id)}>
                删除当前
              </button>
            )}
          </div>
        )}

        {!activeHomework ? (
          <p className="muted">还没有作业，先新建一份吧。</p>
        ) : (
          <div className="dual-lists">
            <div className="list-col">
              <h3>
                <span>未完成</span>
                <span>{undone.length}</span>
              </h3>
              <div className="stack">
                {undone.map((s) => (
                  <button key={s.id} type="button" className="chip-row" onClick={() => toggleHomeworkDone(s.id)}>
                    <span>
                      {s.no} {s.name}
                    </span>
                    <span className="muted">标记完成</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="list-col">
              <h3>
                <span>已完成</span>
                <span>{done.length}</span>
              </h3>
              <div className="stack">
                {done.map((s) => (
                  <button key={s.id} type="button" className="chip-row" onClick={() => toggleHomeworkDone(s.id)}>
                    <span>
                      {s.no} {s.name}
                    </span>
                    <span className="muted">撤销</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
