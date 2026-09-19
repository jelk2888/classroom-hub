import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

type Period = { key: string; label: string; sort: number };
type Slot = { day: number; period_key: string; subject: string; teacher: string };
type Settings = {
  enable_morning: number;
  enable_evening: number;
  enable_saturday: number;
  enable_sunday: number;
  morning_label: string;
  evening_label: string;
};

export function TimetableMod() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [editDay, setEditDay] = useState(1);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const d = await api('/api/timetable');
    setSettings(d.settings);
    setPeriods(d.periods || []);
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

  const visiblePeriods = useMemo(() => {
    return periods.filter((p) => {
      if (p.key === 'morning' && !settings?.enable_morning) return false;
      if (p.key === 'evening' && !settings?.enable_evening) return false;
      return true;
    });
  }, [periods, settings]);

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

  const saveSettings = async () => {
    if (!settings) return;
    await api('/api/timetable/settings', {
      method: 'PUT',
      body: JSON.stringify({
        enable_morning: !!settings.enable_morning,
        enable_evening: !!settings.enable_evening,
        enable_saturday: !!settings.enable_saturday,
        enable_sunday: !!settings.enable_sunday,
        morning_label: settings.morning_label,
        evening_label: settings.evening_label,
      }),
    });
    setMsg('课表开关已保存');
    await load();
  };

  const saveSlots = async () => {
    await api('/api/timetable/slots', {
      method: 'PUT',
      body: JSON.stringify({ slots }),
    });
    setMsg('课表已保存，大屏将刷新当天课表');
    await load();
  };

  if (!settings) return <div className="mod-card">加载课表…</div>;

  return (
    <div className="mod-card">
      <div className="mod-head">
        <h2>周课表</h2>
        <p className="muted">设定早晚自习与周末；教室大屏右侧自动竖排显示「当天」课程，尽量少点屏</p>
      </div>

      <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <label>
          <input
            type="checkbox"
            checked={!!settings.enable_morning}
            onChange={(e) => setSettings({ ...settings, enable_morning: e.target.checked ? 1 : 0 })}
          />{' '}
          早自习
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!settings.enable_evening}
            onChange={(e) => setSettings({ ...settings, enable_evening: e.target.checked ? 1 : 0 })}
          />{' '}
          晚自习
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
          保存开关
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
            <th>科目</th>
            <th>教师</th>
          </tr>
        </thead>
        <tbody>
          {visiblePeriods.map((p) => {
            const label =
              p.key === 'morning'
                ? settings.morning_label || p.label
                : p.key === 'evening'
                  ? settings.evening_label || p.label
                  : p.label;
            const slot = getSlot(editDay, p.key);
            return (
              <tr key={p.key}>
                <td>{label}</td>
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

      {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
