import { useMemo, useState } from 'react';
import type { Store } from '../hooks/useAppStore';
import { todayStr } from '../data/defaults';

export function DisciplinePanel({ store }: { store: Store }) {
  const { state, addDiscipline, removeDiscipline } = store;
  const [studentId, setStudentId] = useState(state.students[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [tab, setTab] = useState<'violation' | 'praise'>('violation');

  const today = todayStr();
  const list = useMemo(
    () => state.disciplines.filter((d) => d.date === today && d.kind === tab),
    [state.disciplines, tab, today],
  );

  const rank = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of list) map.set(d.studentName, (map.get(d.studentName) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);

  return (
    <div className="panel controls">
      <div className="panel-head">
        <div>
          <h2>纪律管理</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            违纪 / 表扬一键记录，按日归档
          </p>
        </div>
      </div>
      <div className="panel-body">
        <div className="toolbar">
          <div className="field">
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              {state.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.no} {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="事由，如：讲话 / 主动回答"
            />
          </div>
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              addDiscipline(studentId, 'violation', reason || '违纪');
              setReason('');
            }}
          >
            违纪
          </button>
          <button
            className="btn amber"
            type="button"
            onClick={() => {
              addDiscipline(studentId, 'praise', reason || '表现优秀');
              setReason('');
            }}
          >
            表扬
          </button>
        </div>

        <div className="student-grid" style={{ marginBottom: 14 }}>
          {state.students.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`stu-card ${studentId === s.id ? 'selected' : ''}`}
              onClick={() => setStudentId(s.id)}
            >
              <div className="no">{s.no}</div>
              <div className="name">{s.name}</div>
            </button>
          ))}
        </div>

        <div className="tabs">
          <button type="button" className={tab === 'violation' ? 'on' : ''} onClick={() => setTab('violation')}>
            今日违纪榜
          </button>
          <button type="button" className={tab === 'praise' ? 'on' : ''} onClick={() => setTab('praise')}>
            今日表扬榜
          </button>
        </div>

        {rank.length > 0 && (
          <p className="muted" style={{ marginTop: 0 }}>
            {rank.slice(0, 5).map(([n, c]) => `${n}×${c}`).join(' · ')}
          </p>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>学生</th>
              <th>事由</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <td>{d.time}</td>
                <td>{d.studentName}</td>
                <td>{d.reason}</td>
                <td>
                  <button className="btn" type="button" onClick={() => removeDiscipline(d.id)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={4} className="muted">
                  暂无记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
