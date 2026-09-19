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

/**
 * 教室一体机专用全屏页（网页版 / Electron 托盘版共用）
 * 摄像头默认开启供教师端远程观看，本页不显示人像预览。
 */
export function BoardPage({ className }: { className?: string }) {
  const [live, setLive] = useState<Live>({
    type: 'idle',
    title: className || '课堂智控台',
    subtitle: '等待教师端指令…',
  });
  const [sync, setSync] = useState('连接中…');
  const [clock, setClock] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const voicePcRef = useRef<RTCPeerConnection | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const liveRef = useRef<ReturnType<typeof connectLive> | null>(null);
  const flashTimer = useRef<number | null>(null);

  const flash = (next: Live) => {
    setLive({ ...next, flash: true });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setLive((s) => ({ ...s, flash: false })), 1200);
    document.title = `📣 ${next.title}`;
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    try {
      (window as any).classroomDesktop?.showMain?.({ title: next.title, subtitle: next.subtitle });
    } catch {
      /* ignore */
    }
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(next.title, { body: next.subtitle || '教室大屏有新任务' });
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

  const startCamera = async () => {
    if (streamRef.current) {
      liveRef.current?.sendSignal('camera-ready', {}, 'teacher');
      return;
    }
    try {
      const stream = await getUserMediaSafe({
        video: { facingMode: 'environment' },
        audio: true,
      });
      streamRef.current = stream;
      liveRef.current?.sendSignal('camera-ready', {}, 'teacher');
    } catch {
      /* 教师端观看时再提示；大屏不展示摄像头文案 */
    }
  };

  const ensurePc = () => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        liveRef.current?.sendSignal('ice', { candidate: ev.candidate }, 'teacher');
      }
    };
    streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
    pcRef.current = pc;
    return pc;
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
      // 呼叫播报只走 call 事件，wake 仅唤起窗口，避免重复播报
      if (p.type === 'call' || p.names) {
        const names: string[] = p.names || [];
        flash({
          type: 'call',
          title: names.length > 1 ? names.join('、') : names[0] || p.title || '呼叫',
          subtitle: p.subtitle || (p.speakParts || []).slice(1).join(' ') || p.texts?.[0] || '',
        });
        return;
      }
      if (p.title) flash({ type: p.type || 'wake', title: p.title, subtitle: p.subtitle || p.text || '' });
      return;
    }
    if (msg.type === 'call') {
      playCall(p);
    } else if (msg.type === 'roll') {
      flash({ type: 'roll', title: p.name, subtitle: '请回答' });
      speak(`${p.name}同学`);
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
      if (p.action === 'start') {
        flash({ type: 'camera', title: '开启摄像头', subtitle: '教师端远程观看中' });
        startCamera();
      } else if (p.action === 'stop') {
        stopCamera();
        flash({ type: 'camera', title: '关闭摄像头', subtitle: '' });
      } else if (p.action === 'shout') {
        flash({ type: 'shout', title: '教师喊话', subtitle: p.text || '请注意听讲' });
        speak(p.text || '请同学们注意听讲');
      }
    }
  };

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(d.toLocaleString('zh-CN'));
    };
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
    const role = (window as any).classroomDesktop ? 'desktop' : 'board';
    const conn = connectLive({
      role,
      onStatus: setSync,
      onLive: handleLive,
      onSignal: async (msg) => {
        const action = msg.action;
        const payload = msg.payload || {};
        if (action === 'watch-request') {
          if (!streamRef.current) await startCamera();
          pcRef.current?.close();
          pcRef.current = null;
          const pc = ensurePc();
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          liveRef.current?.sendSignal('offer', { sdp: offer }, 'teacher');
        } else if (action === 'answer' && payload.sdp) {
          await pcRef.current?.setRemoteDescription(payload.sdp);
        } else if (action === 'ice' && payload.candidate) {
          try {
            await pcRef.current?.addIceCandidate(payload.candidate);
          } catch {
            /* ignore */
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
    // 默认打开摄像头（本屏不预览画面）
    startCamera();
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
      if (payload?.title) {
        flash({
          type: payload.type || 'wake',
          title: payload.title,
          subtitle: payload.subtitle || '教师端有新任务',
        });
      } else {
        try {
          window.focus();
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

  return (
    <div className={`board-page ${live.flash ? 'is-flash' : ''}`}>
      <div className="board-top">
        <div>
          <strong>教室大屏</strong>
          <span className="muted"> · {sync}</span>
        </div>
        <div className="board-clock">{clock}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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

      <div className="board-stage">
        <div className="k">{(live.type || 'idle').toUpperCase()}</div>
        <div className="t">{live.title}</div>
        {live.subtitle && <div className="s">{live.subtitle}</div>}
      </div>

      {/* 接收教师麦克风实时喊话，不画面预览 */}
      <audio ref={voiceAudioRef} autoPlay playsInline />

      <div className="board-tip muted">保持本窗口打开，即可自动接收教师端指令。</div>
    </div>
  );
}
