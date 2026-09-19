import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';

type Cell = {
  row_idx: number;
  col_idx: number;
  student_id: number | null;
  student_name?: string;
  student_no?: string;
};

type Student = { id: number; name: string; student_no?: string };

export function SeatMod({
  students,
  onPushBoard,
}: {
  students: Student[];
  onPushBoard?: (title: string, subtitle?: string) => void;
}) {
  const [rows, setRows] = useState(6);
  const [cols, setCols] = useState(8);
  const [cells, setCells] = useState<Cell[]>([]);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [dragFrom, setDragFrom] = useState<{ r: number; c: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const map = useMemo(() => {
    const m = new Map<string, Cell>();
    cells.forEach((c) => m.set(`${c.row_idx}-${c.col_idx}`, c));
    return m;
  }, [cells]);

  const seatedIds = useMemo(
    () => new Set(cells.filter((c) => c.student_id).map((c) => c.student_id!)),
    [cells],
  );
  const unseated = students.filter((s) => !seatedIds.has(s.id));

  const load = useCallback(async () => {
    const d = await api('/api/seats');
    setRows(d.layout.rows);
    setCols(d.layout.cols);
    setCells(d.cells || []);
  }, []);

  useEffect(() => {
    load().catch((e) => setMsg(e.message || '加载失败'));
  }, [load]);

  /** 保存行列后立即按学号自动排座 */
  const saveLayout = async () => {
    setBusy(true);
    try {
      const d = await api('/api/seats/layout', {
        method: 'PUT',
        body: JSON.stringify({ rows, cols, autoArrange: true }),
      });
      await load();
      setSelected(null);
      setMsg(`行列已保存，已自动安排 ${d.arranged ?? 0} 人入座（可点击或拖拽调换）`);
    } catch (e: any) {
      setMsg(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  };

  /** 教师可随时按名单重新自动排座 */
  const reAutoArrange = async () => {
    if (!confirm('将按学号顺序重新自动排座，当前手动调整会被覆盖。确定？')) return;
    setBusy(true);
    try {
      const d = await api('/api/seats/auto-arrange', {
        method: 'POST',
        body: JSON.stringify({ force: true }),
      });
      setCells(d.cells || []);
      setRows(d.layout.rows);
      setCols(d.layout.cols);
      setSelected(null);
      setMsg(`已重新自动排座 ${d.arranged ?? 0} 人，可继续手动调换`);
    } catch (e: any) {
      setMsg(e.message || '自动排座失败');
    } finally {
      setBusy(false);
    }
  };

  const assign = async (r: number, c: number, studentId: number | null) => {
    await api('/api/seats/assign', {
      method: 'PUT',
      body: JSON.stringify({ row: r, col: c, studentId }),
    });
    await load();
  };

  const onCellClick = async (r: number, c: number) => {
    if (selected && (selected.r !== r || selected.c !== c)) {
      await api('/api/seats/swap', {
        method: 'POST',
        body: JSON.stringify({
          from: { row: selected.r, col: selected.c },
          to: { row: r, col: c },
        }),
      });
      setSelected(null);
      await load();
      setMsg('已交换座位');
      return;
    }
    setSelected({ r, c });
  };

  const showOnBoard = async () => {
    await api('/api/seats/show', { method: 'POST', body: JSON.stringify({}) });
    onPushBoard?.('座位表', '请同学对照入座');
    setMsg('已推送到教室大屏');
  };

  return (
    <div className="mod-card">
      <div className="mod-head">
        <h2>学生座位编排</h2>
        <p className="muted">设定行列并保存 → 自动按学号排座 → 再点击/拖拽手动调换；可推到大屏</p>
      </div>

      <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <label>
          行{' '}
          <input
            type="number"
            min={1}
            max={20}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value) || 1)}
            style={{ width: 64 }}
            disabled={busy}
          />
        </label>
        <label>
          列{' '}
          <input
            type="number"
            min={1}
            max={16}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value) || 1)}
            style={{ width: 64 }}
            disabled={busy}
          />
        </label>
        <button className="btn primary" type="button" onClick={saveLayout} disabled={busy}>
          保存行列并自动排座
        </button>
        <button className="btn" type="button" onClick={reAutoArrange} disabled={busy}>
          重新自动排座
        </button>
        <button className="btn primary" type="button" onClick={showOnBoard} disabled={busy}>
          大屏显示座位表
        </button>
        {selected && (
          <button className="btn" type="button" onClick={() => setSelected(null)}>
            取消选中
          </button>
        )}
      </div>

      {msg && <p className="muted">{msg}</p>}

      <div
        className="seat-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(72px, 1fr))`,
          gap: 8,
          marginBottom: 16,
        }}
      >
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((__, c) => {
            const cell = map.get(`${r}-${c}`);
            const on = selected?.r === r && selected?.c === c;
            return (
              <div
                key={`${r}-${c}`}
                className={`seat-cell ${on ? 'on' : ''} ${cell?.student_id ? 'filled' : ''}`}
                draggable={!!cell?.student_id}
                onDragStart={() => setDragFrom({ r, c })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async () => {
                  if (!dragFrom) return;
                  await api('/api/seats/swap', {
                    method: 'POST',
                    body: JSON.stringify({
                      from: { row: dragFrom.r, col: dragFrom.c },
                      to: { row: r, col: c },
                    }),
                  });
                  setDragFrom(null);
                  await load();
                  setMsg('已拖拽换座');
                }}
                onClick={() => onCellClick(r, c)}
              >
                <div className="seat-pos">
                  {r + 1}-{c + 1}
                </div>
                <div className="seat-name">{cell?.student_name || '空'}</div>
              </div>
            );
          }),
        )}
      </div>

      {selected && (
        <div className="panel-block" style={{ marginBottom: 12 }}>
          <strong>
            座位 {selected.r + 1}-{selected.c + 1} 指定学生
          </strong>
          <div className="row gap" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await assign(selected.r, selected.c, null);
                setMsg('已清空座位');
              }}
            >
              清空
            </button>
            {unseated.map((s) => (
              <button
                key={s.id}
                className="btn"
                type="button"
                onClick={async () => {
                  await assign(selected.r, selected.c, s.id);
                  setSelected(null);
                  setMsg(`已安排 ${s.name}`);
                }}
              >
                {s.student_no ? `${s.student_no} ` : ''}
                {s.name}
              </button>
            ))}
            {unseated.length === 0 && <span className="muted">学生都已入座（可先清空某座再分配）</span>}
          </div>
        </div>
      )}

      <p className="muted">
        提示：保存行列后会按学号自动入座；之后先点一个座位再点另一个可交换，也可直接拖名字换座。
      </p>
    </div>
  );
}
