import { useEffect, useRef, useState } from 'react';
import { api, buildCallSpeakParts, speak, speakQueue } from './api';
import { onBoardWake } from './boardWake';
import { connectLive } from './liveClient';
import { getUserMediaSafe } from './mediaAccess';

type Live = {
  type: string;
  title: string;
  subtitle?: string;
  flash?: boolean;
};

type TodaySlot = { period_key: string; subject: string; teacher: string; label?: string };
type SeatCell = {
  row_idx: number;
  col_idx: number;
  student_id: number | null;
  student_name?: string;
};

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const IDLE_HIDE_MS = 28000;

/**
 * 教室一体机专用全屏页（网页版 / Electron 托盘版共用）
 * 空闲可最小化；有任务再弹出。右侧常驻当天课表竖排。
 */
export function BoardPage({ className }: { className?: string }) {
  const [live, setLive] = useState<Live>({
    type: 'idle',
    title: className || '课堂智控台',
    subtitle: '等待教师端指令…',
  });
  const [sync, setSync] = useState('连接中…');
  const [clock, setClock] = useState('');
  const [todaySlots, setTodaySlots] = useState<TodaySlot[]>([]);
  const [todayDay, setTodayDay] = useState(0);
  const [ttEnabled, setTtEnabled] = useState(true);
  const [showSeats, setShowSeats] = useState(false);
  const [seatLayout, setSeatLayout] = useState({ rows: 6, cols: 8 });
  const [seatCells, setSeatCells] = useState<SeatCell[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const camJobRef = useRef<Promise<MediaStream | null> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceBufRef = useRef<any[]>([]);
  const remoteReadyRef = useRef(false);
  const voicePcRef = useRef<RTCPeerConnection | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const liveRef = useRef<ReturnType<typeof connectLive> | null>(null);
  const flashTimer = useRef<number | null>(null);
  const idleHideTimer = useRef<number | null>(null);
  const rollTimer = useRef<number | null>(null);
  const periodMap = useRef<Record<string, string>>({});
  const [railOnly, setRailOnly] = useState(false);

  const desktop = () => (window as any).classroomDesktop;
  const EXPAND_TYPES = new Set(['call', 'roll', 'timer', 'announce', 'homework', 'discipline', 'shout', 'seats', 'voice']);

  useEffect(() => {
    const off = desktop()?.onMode?.((mode: string) => {
      setRailOnly(mode === 'rail');
      if (mode === 'rail') loadToday();
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('ccp-rail-only', railOnly);
    document.body.classList.toggle('ccp-rail-only', railOnly);
    return () => {
      document.documentElement.classList.remove('ccp-rail-only');
      document.body.classList.remove('ccp-rail-only');
    };
  }, [railOnly]);

  const scheduleIdleHide = () => {
    if (idleHideTimer.current) window.clearTimeout(idleHideTimer.current);
    idleHideTimer.current = window.setTimeout(() => {
      setLive((s) => ({
        ...s,
        type: 'idle',
        title: className || s.title || '课堂智控台',
        subtitle: '课堂就绪 · 有任务时自动弹出',
        flash: false,
      }));
      setShowSeats(false);
      try {
        desktop()?.hideMain?.();
      } catch {
        /* ignore */
      }
      document.title = '教室大屏 · 待命';
    }, IDLE_HIDE_MS);
  };

  const flash = (next: Live, opts?: { expand?: boolean }) => {
    setLive({ ...next, flash: true });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setLive((s) => ({ ...s, flash: false })), 1200);
    document.title = `📣 ${next.title}`;
    const shouldExpand = opts?.expand !== false && EXPAND_TYPES.has(next.type);
    if (shouldExpand) {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      try {
        desktop()?.showMain?.({ title: next.title, subtitle: next.subtitle });
      } catch {
        /* ignore */
      }
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(next.title, { body: next.subtitle || '教室大屏有新任务' });
      }
      scheduleIdleHide();
    }
  };

  const playRoll = (p: any) => {
    const finals: string[] = Array.isArray(p.names) && p.names.length ? p.names : p.name ? [String(p.name)] : [];
    if (!finals.length) return;
    const pool: string[] =
      Array.isArray(p.candidates) && p.candidates.length ? p.candidates.map(String) : finals;
    const spinMs = Math.max(800, Math.min(8000, Number(p.spinMs) || 2000));
    if (rollTimer.current) window.clearTimeout(rollTimer.current);
    flash({ type: 'roll', title: '点名中…', subtitle: '名字滚动抽取中' });
    const started = Date.now();
    const tick = () => {
      const n = finals.length;
      const shown = Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)] || '·');
      setLive({
        type: 'roll',
        title: shown.join('　'),
        subtitle: n > 1 ? `抽取 ${n} 人中…` : '抽取中…',
        flash: true,
      });
      if (Date.now() - started < spinMs) {
        rollTimer.current = window.setTimeout(tick, 55);
        return;
      }
      const title = finals.join(finals.length > 3 ? '、' : '　');
      setLive({
        type: 'roll',
        title,
        subtitle: finals.length > 1 ? `共 ${finals.length} 人 · 请回答` : '请回答',
        flash: true,
      });
      speakQueue(
        finals.map((name) => `${name}同学`),
        { times: 1 },
      );
      scheduleIdleHide();
    };
    tick();
  };

  const loadToday = async () => {
    try {
      const d = await api('/api/timetable/today');
      const periods: { key: string; label: string }[] = d.periods || [];
      const map: Record<string, string> = {};
      periods.forEach((p) => {
        map[p.key] = p.label;
      });
      if (d.settings?.morning_label) map.morning = d.settings.morning_label;
      if (d.settings?.evening_label) map.evening = d.settings.evening_label;
      periodMap.current = map;
      setTodayDay(d.day || 0);
      setTtEnabled(d.enabled !== false);
      setTodaySlots(
        (d.slots || []).map((s: TodaySlot) => ({
          ...s,
          label: map[s.period_key] || s.period_key,
        })),
      );
    } catch {
      /* ignore */
    }
  };

  const loadSeats = async () => {
    try {
      const d = await api('/api/seats');
      setSeatLayout(d.layout);
      setSeatCells(d.cells || []);
    } catch {
      /* ignore */
    }
  };

  const stopCamera = () => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const stopVoiceRecv = () => {
    voicePcRef.current?.close();
    voicePcRef.current = null;
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current.srcObject = null;
    }
  };

  const startCamera = () => {
    if (streamRef.current) {
      liveRef.current?.sendSignal('camera-ready', {}, 'teacher');
      return Promise.resolve(streamRef.current);
    }
    if (camJobRef.current) return camJobRef.current;
    camJobRef.current = (async () => {
      const tries: MediaStreamConstraints[] = [
        { video: true, audio: false },
        { video: { facingMode: 'user' }, audio: false },
        { video: { facingMode: 'environment' }, audio: false },
      ];
      let last = '';
      for (const c of tries) {
        try {
          const stream = await getUserMediaSafe(c);
          streamRef.current = stream;
          liveRef.current?.sendSignal('camera-ready', {}, 'teacher');
          return stream;
        } catch (e: any) {
          last = e?.message || String(e);
        }
      }
      liveRef.current?.sendSignal('camera-error', { message: last || '无法打开摄像头' }, 'teacher');
      return null;
    })().finally(() => {
      camJobRef.current = null;
    });
    return camJobRef.current;
  };

  const flushBoardIce = async () => {
    const pc = pcRef.current;
    if (!pc || !remoteReadyRef.current) return;
    const queued = iceBufRef.current.splice(0);
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* ignore */
      }
    }
  };

  const playCall = (p: any) => {
    const names: string[] = p.names || [];
    const texts: string[] = p.texts || [];
    const parts: string[] =
      Array.isArray(p.speakParts) && p.speakParts.length
        ? p.speakParts
        : buildCallSpeakParts(names, p.template || texts[0] || '');
    const title = names.length > 1 ? names.join('、') : names[0] || '呼叫';
    const subtitle =
      names.length > 1
        ? parts.slice(1).join(' ') || texts[0] || ''
        : texts[0] || parts[0] || '';
    flash({ type: 'call', title, subtitle });
    speakQueue(parts, {
      times: p.repeat || 1,
      rate: p.rate || 1,
      pitch: p.pitch || 1,
    });
  };

  const handleLive = (msg: { type: string; payload?: any }) => {
    const p = msg.payload || {};
    if (msg.type === 'wake') {
      // 登录连线 / 摄像头不弹大屏
      if (p.type === 'link' || p.type === 'camera' || p.action === 'start' || p.action === 'stop') return;
      if (p.type === 'call' || p.names) {
        const names: string[] = p.names || [];
        flash({
          type: 'call',
          title: names.length > 1 ? names.join('、') : names[0] || p.title || '呼叫',
          subtitle: p.subtitle || (p.speakParts || []).slice(1).join(' ') || p.texts?.[0] || '',
        });
        return;
      }
      if (p.type === 'roll') {
        playRoll(p);
        return;
      }
      if (p.type && EXPAND_TYPES.has(p.type) && p.title) {
        flash({ type: p.type, title: p.title, subtitle: p.subtitle || p.text || '' });
      }
      return;
    }
    if (msg.type === 'call') {
      playCall(p);
    } else if (msg.type === 'roll') {
      playRoll(p);
    } else if (msg.type === 'timer') {
      flash({ type: 'timer', title: p.display, subtitle: p.subtitle || '计时' });
      if (p.display === '00:00' || p.subtitle === '时间到') speak('时间到');
    } else if (msg.type === 'announce') {
      flash({ type: 'announce', title: '班级公告', subtitle: p.content });
      speak(`公告：${p.content}`);
    } else if (msg.type === 'homework') {
      flash({ type: 'homework', title: '作业更新', subtitle: '请查看完成进度' });
    } else if (msg.type === 'discipline') {
      flash({
        type: 'discipline',
        title: p.name,
        subtitle: p.kind === 'praise' ? '受到表扬' : '请注意纪律',
      });
    } else if (msg.type === 'camera') {
      // 摄像头只在后台打开，大屏仍显示课表，不弹出黑板页
      if (p.action === 'start') {
        startCamera();
      } else if (p.action === 'stop') {
        stopCamera();
      } else if (p.action === 'shout') {
        flash({ type: 'shout', title: '教师喊话', subtitle: p.text || '请注意听讲' });
        speak(p.text || '请同学们注意听讲');
      }
    } else if (msg.type === 'seats') {
      loadSeats().then(() => {
        setShowSeats(true);
        flash({ type: 'seats', title: '座位表', subtitle: '请对照入座' });
      });
    } else if (msg.type === 'timetable') {
      loadToday();
    }
  };

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString('zh-CN'));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    loadToday();
    const id = window.setInterval(loadToday, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    scheduleIdleHide();
    return () => {
      if (idleHideTimer.current) window.clearTimeout(idleHideTimer.current);
    };
  }, []);

  useEffect(() => {
    const role = desktop() ? 'desktop' : 'board';
    const conn = connectLive({
      role,
      onStatus: setSync,
      onLive: handleLive,
      onSignal: async (msg) => {
        const action = msg.action;
        const payload = msg.payload || {};
        if (action === 'watch-request') {
          const stream = await startCamera();
          if (!stream) return;
          pcRef.current?.close();
          remoteReadyRef.current = false;
          iceBufRef.current = [];
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          });
          pcRef.current = pc;
          stream.getTracks().forEach((t) => pc.addTrack(t, stream));
          pc.onicecandidate = (ev) => {
            if (ev.candidate) {
              liveRef.current?.sendSignal('ice', { candidate: ev.candidate.toJSON() }, 'teacher');
            }
          };
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          liveRef.current?.sendSignal('offer', { sdp: pc.localDescription }, 'teacher');
        } else if (action === 'answer' && payload.sdp) {
          const desc = typeof payload.sdp === 'string' ? { type: 'answer' as const, sdp: payload.sdp } : payload.sdp;
          await pcRef.current?.setRemoteDescription(desc);
          remoteReadyRef.current = true;
          await flushBoardIce();
        } else if (action === 'ice' && payload.candidate) {
          if (!remoteReadyRef.current || !pcRef.current?.remoteDescription) {
            iceBufRef.current.push(payload.candidate);
          } else {
            try {
              await pcRef.current.addIceCandidate(payload.candidate);
            } catch {
              /* ignore */
            }
          }
        } else if (action === 'voice-offer' && payload.sdp) {
          stopVoiceRecv();
          flash({ type: 'voice', title: '教师语音喊话', subtitle: '请注意听讲' });
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          });
          voicePcRef.current = pc;
          pc.ontrack = (ev) => {
            const el = voiceAudioRef.current;
            if (!el) return;
            el.srcObject = ev.streams[0] || new MediaStream(ev.track ? [ev.track] : []);
            el.play().catch(() => {});
          };
          pc.onicecandidate = (ev) => {
            if (ev.candidate) {
              liveRef.current?.sendSignal('voice-ice', { candidate: ev.candidate }, 'teacher');
            }
          };
          await pc.setRemoteDescription(payload.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          liveRef.current?.sendSignal('voice-answer', { sdp: answer }, 'teacher');
        } else if (action === 'voice-ice' && payload.candidate) {
          try {
            await voicePcRef.current?.addIceCandidate(payload.candidate);
          } catch {
            /* ignore */
          }
        } else if (action === 'voice-stop') {
          stopVoiceRecv();
          flash({ type: 'idle', title: className || '课堂智控台', subtitle: '语音喊话结束' });
        }
      },
    });
    liveRef.current = conn;
    return () => {
      conn.close();
      stopCamera();
      stopVoiceRecv();
    };
  }, []);

  useEffect(() => {
    return onBoardWake((payload) => {
      if (payload?.type === 'call' || payload?.names) {
        const names: string[] = payload.names || [];
        flash({
          type: 'call',
          title: names.length > 1 ? names.join('、') : names[0] || payload.title || '呼叫',
          subtitle: payload.subtitle || '',
        });
        return;
      }
      if (payload?.type === 'camera' || payload?.type === 'link') return;
      if (payload?.type === 'roll') {
        playRoll(payload);
        return;
      }
      if (payload?.type && EXPAND_TYPES.has(payload.type) && payload?.title) {
        flash({
          type: payload.type,
          title: payload.title,
          subtitle: payload.subtitle || '教师端有新任务',
        });
      } else if (!payload?.type && payload?.title) {
        // 无类型的旧唤醒：不当作连线弹窗
        return;
      } else {
        try {
          window.focus();
          desktop()?.showMain?.({});
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  useEffect(() => {
    api('/api/me')
      .then((d) => {
        setLive((s) =>
          s.type === 'idle'
            ? { ...s, title: d.class?.name || className || '课堂智控台', subtitle: '等待教师端指令…' }
            : s,
        );
      })
      .catch(() => {});
  }, [className]);

  const seatMap = new Map(seatCells.map((c) => [`${c.row_idx}-${c.col_idx}`, c]));

  return (
    <div className={`board-page board-with-tt ${live.flash ? 'is-flash' : ''} ${railOnly ? 'rail-only' : ''}`}>
      <div className="board-main-col">
        <div className="board-top">
          <div>
            <strong>教室大屏</strong>
            <span className="muted"> · {sync}</span>
          </div>
          <div className="board-clock">{clock}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {showSeats && (
              <button className="btn" type="button" onClick={() => setShowSeats(false)}>
                关闭座位表
              </button>
            )}
            <button
              className="btn"
              type="button"
              onClick={() => {
                loadSeats().then(() => setShowSeats(true));
              }}
            >
              座位表
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                const el = document.documentElement as any;
                if (!document.fullscreenElement) el.requestFullscreen?.();
                else document.exitFullscreen?.();
              }}
            >
              全屏
            </button>
          </div>
        </div>

        {showSeats ? (
          <div
            className="board-seat-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${seatLayout.cols}, minmax(0, 1fr))`,
              gap: 8,
              padding: 16,
              flex: 1,
              overflow: 'auto',
            }}
          >
            {Array.from({ length: seatLayout.rows }).map((_, r) =>
              Array.from({ length: seatLayout.cols }).map((__, c) => {
                const cell = seatMap.get(`${r}-${c}`);
                return (
                  <div key={`${r}-${c}`} className="board-seat-cell">
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r + 1}-{c + 1}
                    </div>
                    <div style={{ fontWeight: 700 }}>{cell?.student_name || '·'}</div>
                  </div>
                );
              }),
            )}
          </div>
        ) : (
          <div className="board-stage">
            <div className="k">{(live.type || 'idle').toUpperCase()}</div>
            <div className="t">{live.title}</div>
            {live.subtitle && <div className="s">{live.subtitle}</div>}
          </div>
        )}

        <audio ref={voiceAudioRef} autoPlay playsInline />
        <div className="board-tip muted">
          {railOnly
            ? '右侧课表中 · 最小化进托盘；最大化或教师发任务时展示大屏'
            : '大屏展示中 · 最小化/关闭可隐藏到托盘待命'}
        </div>
      </div>

      <aside className="board-tt-rail" aria-label="当天课表">
        <div className="board-tt-head">
          今日课表
          {todayDay ? ` · 周${DAY_LABELS[todayDay - 1]}` : ''}
        </div>
        {!ttEnabled && <div className="board-tt-empty">今日无课表安排</div>}
        {ttEnabled && todaySlots.length === 0 && (
          <div className="board-tt-empty">暂无课程，请在教师端「周课表」填写</div>
        )}
        <div className="board-tt-list">
          {todaySlots.map((s) => (
            <div key={s.period_key} className="board-tt-item">
              <div className="board-tt-period">{s.label || s.period_key}</div>
              <div className="board-tt-subject">{s.subject || '—'}</div>
              {s.teacher ? <div className="board-tt-teacher">{s.teacher}</div> : null}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
