import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

type Period = { key: string; label: string; sort: number; section?: string; start?: string; end?: string };
type Slot = { day: number; period_key: string; subject: string; teacher: string };
type PeriodTime = { start: string; end: string };
type Settings = {
  enable_morning: number;
  enable_evening: number;
  enable_saturday: number;
  enable_sunday: number;
  morning_label: string;
  evening_label: string;
  morning_count: number;
  am_count: number;
  pm_count: number;
  evening_count: number;
};

function timesFromPeriods(periods: Period[]): Record<string, PeriodTime> {
  const out: Record<string, PeriodTime> = {};
  periods.forEach((p) => {
    out[p.key] = { start: p.start || '', end: p.end || '' };
  });
  return out;
}

export function TimetableMod() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodTimes, setPeriodTimes] = useState<Record<string, PeriodTime>>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [editDay, setEditDay] = useState(1);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const d = await api('/api/timetable');
    const s = d.settings || {};
    setSettings({
      enable_morning: s.enable_morning ? 1 : 0,
      enable_evening: s.enable_evening ? 1 : 0,
      enable_saturday: s.enable_saturday ? 1 : 0,
      enable_sunday: s.enable_sunday ? 1 : 0,
      morning_label: s.morning_label || '早自习',
      evening_label: s.evening_label || '晚自习',
      morning_count: Number(s.morning_count ?? (s.enable_morning ? 1 : 0)),
      am_count: Number(s.am_count ?? 4),
      pm_count: Number(s.pm_count ?? 4),
      evening_count: Number(s.evening_count ?? (s.enable_evening ? 1 : 0)),
    });
    const ps: Period[] = d.periods || [];
    setPeriods(ps);
    const fromApi = (s.period_times || {}) as Record<string, PeriodTime>;
    const merged = timesFromPeriods(ps);
    Object.keys(fromApi).forEach((k) => {
      merged[k] = {
        start: fromApi[k]?.start || merged[k]?.start || '',
        end: fromApi[k]?.end || merged[k]?.end || '',
      };
    });
    setPeriodTimes(merged);
    setSlots(d.slots || []);
  }, []);

  useEffect(() => {
    load().catch((e) => setMsg(e.message || '加载失败'));
  }, [load]);

  const visibleDays = useMemo(() => {
    const days = [1, 2, 3, 4, 5];
    if (settings?.enable_saturday) days.push(6);
    if (settings?.enable_sunday) days.push(7);
    return days;
  }, [settings]);

  const getSlot = (day: number, period_key: string) =>
    slots.find((s) => s.day === day && s.period_key === period_key) || {
      day,
      period_key,
      subject: '',
      teacher: '',
    };

  const setField = (day: number, period_key: string, field: 'subject' | 'teacher', value: string) => {
    setSlots((prev) => {
      const rest = prev.filter((s) => !(s.day === day && s.period_key === period_key));
      const cur = getSlot(day, period_key);
      return [...rest, { ...cur, [field]: value }];
    });
  };

  const setTime = (period_key: string, field: 'start' | 'end', value: string) => {
    setPeriodTimes((prev) => ({
      ...prev,
      [period_key]: {
        start: field === 'start' ? value : prev[period_key]?.start || '',
        end: field === 'end' ? value : prev[period_key]?.end || '',
      },
    }));
  };

  const saveSettings = async () => {
    if (!settings) return;
    const d = await api('/api/timetable/settings', {
      method: 'PUT',
      body: JSON.stringify({
        enable_saturday: !!settings.enable_saturday,
        enable_sunday: !!settings.enable_sunday,
        morning_label: settings.morning_label,
        evening_label: settings.evening_label,
        morning_count: settings.morning_count,
        am_count: settings.am_count,
        pm_count: settings.pm_count,
        evening_count: settings.evening_count,
        period_times: periodTimes,
      }),
    });
    if (d.periods) {
      setPeriods(d.periods);
      setPeriodTimes((prev) => {
        const next = timesFromPeriods(d.periods);
        Object.keys(prev).forEach((k) => {
          if (next[k]) next[k] = prev[k];
        });
        return next;
      });
    }
    setMsg('节次与上课时间已保存');
    await load();
  };

  const saveSlots = async () => {
    await api('/api/timetable/slots', {
      method: 'PUT',
      body: JSON.stringify({ slots, period_times: periodTimes }),
    });
    setMsg('课表与上课时间已保存，大屏将刷新');
    await load();
  };

  if (!settings) return <div className="mod-card">加载课表…</div>;

  return (
    <div className="mod-card">
      <div className="mod-head">
        <h2>周课表</h2>
        <p className="muted">可设节数与每节上课时间（全班共用）；教室大屏显示当天课程与时间</p>
      </div>

      <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <label>
          早自习
          <input
            type="number"
            min={0}
            max={4}
            value={settings.morning_count}
            onChange={(e) =>
              setSettings({ ...settings, morning_count: Math.max(0, Math.min(4, Number(e.target.value) || 0)) })
            }
            style={{ width: 64, marginLeft: 6 }}
          />
          节
        </label>
        <label>
          上午
          <input
            type="number"
            min={0}
            max={8}
            value={settings.am_count}
            onChange={(e) =>
              setSettings({ ...settings, am_count: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })
            }
            style={{ width: 64, marginLeft: 6 }}
          />
          节
        </label>
        <label>
          下午
          <input
            type="number"
            min={0}
            max={8}
            value={settings.pm_count}
            onChange={(e) =>
              setSettings({ ...settings, pm_count: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })
            }
            style={{ width: 64, marginLeft: 6 }}
          />
          节
        </label>
        <label>
          晚自习
          <input
            type="number"
            min={0}
            max={6}
            value={settings.evening_count}
            onChange={(e) =>
              setSettings({ ...settings, evening_count: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })
            }
            style={{ width: 64, marginLeft: 6 }}
          />
          节
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!settings.enable_saturday}
            onChange={(e) => setSettings({ ...settings, enable_saturday: e.target.checked ? 1 : 0 })}
          />{' '}
          星期六
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!settings.enable_sunday}
            onChange={(e) => setSettings({ ...settings, enable_sunday: e.target.checked ? 1 : 0 })}
          />{' '}
          星期天
        </label>
        <button className="btn" type="button" onClick={saveSettings}>
          保存节次/时间
        </button>
        <button className="btn primary" type="button" onClick={saveSlots}>
          保存课表
        </button>
      </div>

      <div className="row gap" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        {visibleDays.map((d) => (
          <button
            key={d}
            type="button"
            className={`btn ${editDay === d ? 'primary' : ''}`}
            onClick={() => setEditDay(d)}
          >
            周{DAY_LABELS[d - 1]}
          </button>
        ))}
      </div>

      <table className="tt-table">
        <thead>
          <tr>
            <th>节次</th>
            <th>开始</th>
            <th>结束</th>
            <th>科目</th>
            <th>教师</th>
          </tr>
        </thead>
        <tbody>
          {periods.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                当前节数为 0，请先设置上午/下午/晚自习节数并点「保存节次/时间」
              </td>
            </tr>
          )}
          {periods.map((p) => {
            const slot = getSlot(editDay, p.key);
            const t = periodTimes[p.key] || { start: '', end: '' };
            return (
              <tr key={p.key}>
                <td>{p.label}</td>
                <td>
                  <input
                    type="time"
                    value={t.start || ''}
                    onChange={(e) => setTime(p.key, 'start', e.target.value)}
                    title="上课开始时间（各天共用）"
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={t.end || ''}
                    onChange={(e) => setTime(p.key, 'end', e.target.value)}
                    title="上课结束时间（各天共用）"
                  />
                </td>
                <td>
                  <input
                    value={slot.subject}
                    placeholder="科目"
                    onChange={(e) => setField(editDay, p.key, 'subject', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    value={slot.teacher}
                    placeholder="教师"
                    onChange={(e) => setField(editDay, p.key, 'teacher', e.target.value)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {msg && (
        <p className="muted" style={{ marginTop: 10 }}>
          {msg}
        </p>
      )}
    </div>
  );
}
