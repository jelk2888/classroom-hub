import { useState } from 'react';
import type { Student } from '../types';
import type { Store } from '../hooks/useAppStore';
import { genRoomCode, uid } from '../data/defaults';
import { downloadText } from '../lib/storage';

export function SettingsPanel({ store }: { store: Store }) {
  const { state, patch, upsertStudent, removeStudent, replaceStudents } = store;
  const [draft, setDraft] = useState({ no: '', name: '', gender: '男' as Student['gender'] });
  const [csv, setCsv] = useState('');

  const add = () => {
    if (!draft.name.trim()) return;
    upsertStudent({
      id: uid('s'),
      no: draft.no.trim() || String(state.students.length + 1).padStart(2, '0'),
      name: draft.name.trim(),
      gender: draft.gender,
    });
    setDraft({ no: '', name: '', gender: '男' });
  };

  const importCsv = () => {
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const rows = lines[0]?.includes('姓名') ? lines.slice(1) : lines;
    const students: Student[] = rows.map((line, i) => {
      const [no, name, gender] = line.split(/[,，\t]/).map((x) => x.trim());
      return {
        id: uid('s'),
        no: no || String(i + 1).padStart(2, '0'),
        name: name || no || `学生${i + 1}`,
        gender: gender === '女' || gender === '男' ? gender : '',
      };
    });
    if (students.length) replaceStudents(students);
  };

  return (
    <div className="panel controls">
      <div className="panel-head">
        <div>
          <h2>班级设置</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            名单导入、房间口令、班级信息
          </p>
        </div>
      </div>
      <div className="panel-body">
        <div className="toolbar">
          <div className="field">
            <input
              value={state.className}
              onChange={(e) => patch({ className: e.target.value })}
              placeholder="班级名称"
            />
          </div>
          <button className="btn" type="button" onClick={() => patch({ roomCode: genRoomCode() })}>
            刷新口令 {state.roomCode}
          </button>
        </div>

        <h3>添加学生</h3>
        <div className="toolbar">
          <div className="field" style={{ maxWidth: 100 }}>
            <input
              value={draft.no}
              onChange={(e) => setDraft((d) => ({ ...d, no: e.target.value }))}
              placeholder="学号"
            />
          </div>
          <div className="field">
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="姓名"
            />
          </div>
          <div className="field" style={{ maxWidth: 100 }}>
            <select
              value={draft.gender}
              onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value as Student['gender'] }))}
            >
              <option value="男">男</option>
              <option value="女">女</option>
              <option value="">-</option>
            </select>
          </div>
          <button className="btn primary" type="button" onClick={add}>
            添加
          </button>
        </div>

        <h3>CSV 导入</h3>
        <p className="muted">格式：学号,姓名,性别（可先下载模板）</p>
        <div className="toolbar">
          <button
            className="btn"
            type="button"
            onClick={() => downloadText('学生名单模板.csv', '学号,姓名,性别\n01,张三,男\n02,李四,女\n')}
          >
            下载模板
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              const body = ['学号,姓名,性别', ...state.students.map((s) => `${s.no},${s.name},${s.gender}`)].join(
                '\n',
              );
              downloadText(`${state.className}-名单.csv`, body);
            }}
          >
            导出当前名单
          </button>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <textarea
            rows={5}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={'01,陈思远,男\n02,林晓萱,女'}
          />
        </div>
        <button className="btn primary" type="button" onClick={importCsv}>
          粘贴导入（覆盖）
        </button>

        <h3 style={{ marginTop: 20 }}>当前名单（{state.students.length}）</h3>
        <table className="table">
          <thead>
            <tr>
              <th>学号</th>
              <th>姓名</th>
              <th>性别</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.students.map((s) => (
              <tr key={s.id}>
                <td>{s.no}</td>
                <td>{s.name}</td>
                <td>{s.gender || '-'}</td>
                <td>
                  <button className="btn danger" type="button" onClick={() => removeStudent(s.id)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
