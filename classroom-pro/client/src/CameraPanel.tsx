import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { connectLive } from './liveClient';
import { wakeBoard } from './boardWake';
import { getUserMediaSafe, micAvailableHint } from './mediaAccess';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

/** 教师端：查看教室摄像头 + 文字/麦克风实时喊话 */
export function CameraPanel({
  setLive,
  previewVideoRef,
}: {
  setLive: (v: any) => void;
  previewVideoRef?: { current: HTMLVideoElement | null };
}) {
  const [status, setStatus] = useState('未连接');
  const [watching, setWatching] = useState(false);
  const [camOnRemote, setCamOnRemote] = useState(false);
  const [shout, setShout] = useState('请同学们安静，注意听讲');
  const [talking, setTalking] = useState(false);
  const [talkHint, setTalkHint] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const voicePcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const connRef = useRef<ReturnType<typeof connectLive> | null>(null);
  const talkLock = useRef(false);
  const iceBuf = useRef<any[]>([]);
  const remoteReady = useRef(false);
  const watchTimer = useRef<number | null>(null);

  const attachStream = (stream: MediaStream) => {
    const play = (el: HTMLVideoElement | null) => {
      if (!el) return;
      el.srcObject = stream;
      el.muted = true;
      el.play().catch(() => {});
    };
    play(videoRef.current);
    play(previewVideoRef?.current || null);
    setWatching(true);
    setStatus('正在观看教室');
  };

  const clearVideo = () => {
    if (videoRef.current) videoRef.current.srcObject = null;
    if (previewVideoRef?.current) previewVideoRef.current.srcObject = null;
    setWatching(false);
  };

  const stopVoicePc = () => {
    voicePcRef.current?.close();
    voicePcRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    setTalking(false);
  };

  useEffect(() => {
    const conn = connectLive({
      role: 'teacher',
      onStatus: setStatus,
      onLive: (msg) => {
        if (msg.type === 'camera') {
          if (msg.payload?.action === 'start') {
            setCamOnRemote(true);
            setLive({ type: 'camera', title: '摄像头已开', subtitle: '可点击观看教室' });
          } else if (msg.payload?.action === 'stop') {
            setCamOnRemote(false);
            clearVideo();
            setLive({ type: 'camera', title: '摄像头已关', subtitle: '' });
          }
        }
      },
      onSignal: async (msg) => {
        const action = msg.action;
        const payload = msg.payload || {};
        if (action === 'camera-ready') {
          setStatus('教室摄像头就绪');
          setCamOnRemote(true);
        } else if (action === 'camera-error') {
          setStatus(payload.message || '教室摄像头打开失败');
          setLive({ type: 'camera', title: '摄像头未打开', subtitle: payload.message || '请检查一体机摄像头权限' });
        } else if (action === 'offer' && payload.sdp) {
          if (watchTimer.current) window.clearTimeout(watchTimer.current);
          pcRef.current?.close();
          remoteReady.current = false;
          iceBuf.current = [];
          const pc = new RTCPeerConnection(ICE);
          pcRef.current = pc;
          pc.ontrack = (ev) => {
            const stream = ev.streams[0] || new MediaStream(ev.track ? [ev.track] : []);
            attachStream(stream);
          };
          pc.onicecandidate = (ev) => {
            if (ev.candidate) connRef.current?.sendSignal('ice', { candidate: ev.candidate.toJSON() }, 'board');
          };
          pc.onconnectionstatechange = () => {
            const st = pc.connectionState;
            if (st === 'failed' || st === 'disconnected') setStatus('教室画面中断，请再点一次观看教室');
          };
          const desc = typeof payload.sdp === 'string' ? { type: 'offer' as const, sdp: payload.sdp } : payload.sdp;
          await pc.setRemoteDescription(desc);
          remoteReady.current = true;
          const queued = iceBuf.current.splice(0);
          for (const c of queued) {
            try {
              await pc.addIceCandidate(c);
            } catch {
              /* ignore */
            }
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          connRef.current?.sendSignal('answer', { sdp: pc.localDescription }, 'board');
        } else if (action === 'ice' && payload.candidate) {
          if (!remoteReady.current || !pcRef.current?.remoteDescription) {
            iceBuf.current.push(payload.candidate);
          } else {
            try {
              await pcRef.current.addIceCandidate(payload.candidate);
            } catch {
              /* ignore */
            }
          }
        } else if (action === 'voice-answer' && payload.sdp) {
          try {
            await voicePcRef.current?.setRemoteDescription(payload.sdp);
          } catch {
            /* ignore */
          }
        } else if (action === 'voice-ice' && payload.candidate) {
          try {
            await voicePcRef.current?.addIceCandidate(payload.candidate);
          } catch {
            /* ignore */
          }
        }
      },
    });
    connRef.current = conn;
    return () => {
      if (watchTimer.current) window.clearTimeout(watchTimer.current);
      conn.close();
      pcRef.current?.close();
      stopVoicePc();
    };
  }, [setLive]);

  const openCamera = async () => {
    await api('/api/camera/command', { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    setCamOnRemote(true);
    setLive({ type: 'camera', title: '已请求开启摄像头', subtitle: '教室大屏不显示人像' });
  };

  const closeCamera = async () => {
    await api('/api/camera/command', { method: 'POST', body: JSON.stringify({ action: 'stop' }) });
    pcRef.current?.close();
    pcRef.current = null;
    clearVideo();
    setCamOnRemote(false);
  };

  const startWatch = async () => {
    setStatus('正在请求教室摄像头…');
    if (!camOnRemote) await openCamera();
    connRef.current?.sendSignal('watch-request', {}, 'board');
    if (watchTimer.current) window.clearTimeout(watchTimer.current);
    watchTimer.current = window.setTimeout(() => {
      setStatus((s) => (s.startsWith('正在') ? '还没收到教室画面。请确认一体机已登录，并在弹窗里允许摄像头。' : s));
    }, 8000);
  };

  const stopWatch = () => {
    if (watchTimer.current) window.clearTimeout(watchTimer.current);
    pcRef.current?.close();
    pcRef.current = null;
    clearVideo();
    setStatus('已停止观看');
  };

  const doShout = async () => {
    await api('/api/camera/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'shout', text: shout }),
    });
    wakeBoard({ title: '教师喊话', subtitle: shout, type: 'shout' });
    setLive({ type: 'shout', title: '已喊话', subtitle: shout });
  };

  const startMicTalk = async () => {
    if (talkLock.current || talking) return;
    talkLock.current = true;
    try {
      const blocked = micAvailableHint();
      if (blocked) {
        setTalkHint(blocked);
        return;
      }
      setTalkHint('正在申请麦克风…');
      const mic = await getUserMediaSafe({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      micRef.current = mic;
      voicePcRef.current?.close();
      const pc = new RTCPeerConnection(ICE);
      voicePcRef.current = pc;
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          connRef.current?.sendSignal('voice-ice', { candidate: ev.candidate }, 'board');
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wakeBoard({ title: '教师语音', subtitle: '正在喊话…', type: 'voice' });
      connRef.current?.sendSignal('voice-offer', { sdp: offer }, 'board');
      setTalking(true);
      setTalkHint('麦克风已通 · 请对着手机/电脑说话');
      setLive({ type: 'voice', title: '语音喊话中', subtitle: '松开或点「结束」停止' });
    } catch (e: any) {
      setTalkHint(`麦克风失败：${e?.message || String(e)}`);
      stopVoicePc();
    } finally {
      talkLock.current = false;
    }
  };

  const stopMicTalk = () => {
    if (!talking && !micRef.current) return;
    connRef.current?.sendSignal('voice-stop', {}, 'board');
    stopVoicePc();
    setTalkHint('已结束语音喊话');
    setLive({ type: 'idle', title: '课堂就绪', subtitle: '语音喊话已结束' });
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>教室摄像头 / 喊话</h3>
        <span className="muted">{status}</span>
      </div>
      <div className="panel-b">
        <p className="muted">摄像头默认关闭，点「观看教室」后才会打开。画面只在本页显示，教室大屏不会弹出人像。</p>
        <div className="toolbar">
          <button className="btn primary" type="button" onClick={startWatch}>
            观看教室
          </button>
          <button className="btn" type="button" onClick={stopWatch} disabled={!watching}>
            停止观看
          </button>
          <button className="btn ok" type="button" onClick={openCamera}>
            打开摄像头
          </button>
          <button className="btn danger" type="button" onClick={closeCamera}>
            关闭摄像头
          </button>
        </div>
        <p className="muted">远程摄像头：{camOnRemote ? '开' : '关'} · 观看：{watching ? '中' : '未开始'}</p>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{
            width: '100%',
            minHeight: 220,
            maxHeight: 360,
            objectFit: 'cover',
            background: '#111',
            borderRadius: 12,
          }}
        />
        {!watching && <div className="muted">点击「观看教室」后，这里和右侧预览都会显示摄像头画面</div>}

        <h4>麦克风实时喊话</h4>
        <p className="muted" style={{ marginTop: 0 }}>
          按住或点「开始喊话」用手机/电脑麦克风对教室实时喊话。手机若用局域网 HTTP 打开，浏览器会禁止开麦，请改用文字喊话、电脑端，或配置 HTTPS。
        </p>
        {micAvailableHint() && <p className="err">{micAvailableHint()}</p>}
        <div className="toolbar">
          <button
            className={`btn ${talking ? 'danger' : 'primary'}`}
            type="button"
            style={{ minWidth: 160, minHeight: 48, userSelect: 'none', touchAction: 'none' }}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
              startMicTalk();
            }}
            onPointerUp={() => stopMicTalk()}
            onPointerCancel={() => stopMicTalk()}
            onPointerLeave={() => {
              if (talking) stopMicTalk();
            }}
          >
            {talking ? '松开结束…' : '按住说话'}
          </button>
          <button className={`btn ${talking ? 'danger' : 'amber'}`} type="button" onClick={() => (talking ? stopMicTalk() : startMicTalk())}>
            {talking ? '结束喊话' : '开始喊话（免按住）'}
          </button>
        </div>
        {talkHint && <p className="muted">{talkHint}</p>}

        <h4>文字喊话</h4>
        <div className="toolbar">
          <div className="field">
            <input value={shout} onChange={(e) => setShout(e.target.value)} />
          </div>
          <button className="btn amber" type="button" onClick={doShout}>
            发送文字喊话
          </button>
        </div>
      </div>
    </div>
  );
}
