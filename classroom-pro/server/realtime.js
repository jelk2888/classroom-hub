import { WebSocketServer } from 'ws';

/** @type {Map<number, Set<import('ws').WebSocket>>} */
const wsByClass = new Map();
/** @type {Map<number, Set<import('express').Response>>} */
const sseByClass = new Map();

export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url || '', 'http://127.0.0.1');
      const token = url.searchParams.get('token') || '';
      const role = url.searchParams.get('role') || 'client'; // board | teacher | client
      ws._meta = { token, role, classId: null, authed: false };

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        // 信令转发：摄像头 WebRTC / 喊话
        if (msg.type === 'signal' && ws._meta.classId) {
          forwardSignal(ws._meta.classId, ws, msg);
          return;
        }
        if (msg.type === 'ping') {
          wsSend(ws, { type: 'pong' });
        }
      });

      ws.on('close', () => {
        if (ws._meta?.classId) {
          const cid = ws._meta.classId;
          wsByClass.get(cid)?.delete(ws);
          broadcastPresence(cid);
        }
      });
    } catch {
      ws.close();
    }
  });

  return wss;
}

function isBoardRole(role) {
  return role === 'board' || role === 'desktop';
}

export function getClassPresence(classId) {
  const set = wsByClass.get(Number(classId));
  let boards = 0;
  let teachers = 0;
  if (set) {
    for (const peer of set) {
      const role = peer._meta?.role;
      if (isBoardRole(role)) boards += 1;
      else if (role === 'teacher') teachers += 1;
    }
  }
  return { boards, teachers, boardOnline: boards > 0 };
}

function broadcastPresence(classId) {
  const id = Number(classId);
  const presence = getClassPresence(id);
  const raw = JSON.stringify({ type: 'presence', payload: presence });
  const set = wsByClass.get(id);
  if (!set) return;
  for (const peer of set) {
    try {
      if (peer.readyState === 1) peer.send(raw);
    } catch {
      /* ignore */
    }
  }
}

export function bindWsSession(ws, classId, role) {
  const id = Number(classId);
  ws._meta = { ...(ws._meta || {}), classId: id, role, authed: true };
  if (!wsByClass.has(id)) wsByClass.set(id, new Set());
  wsByClass.get(id).add(ws);
  wsSend(ws, { type: 'hello', payload: { classId: id, role, presence: getClassPresence(id) } });
  broadcastPresence(id);

  // 教师端重新上线时轻量唤醒大屏，提示已自动连上
  if (role === 'teacher' && getClassPresence(id).boardOnline) {
    wakeBoards(id, { title: '教师端已连接', subtitle: '可直接发任务', type: 'link' });
  }
}

export function addSseClient(classId, res) {
  const id = Number(classId);
  if (!sseByClass.has(id)) sseByClass.set(id, new Set());
  sseByClass.get(id).add(res);
}

export function removeSseClient(classId, res) {
  sseByClass.get(Number(classId))?.delete(res);
}

function wsSend(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function roleMatches(peerRole, targetRole) {
  if (!targetRole || targetRole === 'all') return true;
  if (targetRole === 'board') return peerRole === 'board' || peerRole === 'desktop';
  return peerRole === targetRole;
}

function forwardSignal(classId, from, msg) {
  const set = wsByClass.get(Number(classId));
  if (!set) return;
  const targetRole = msg.to; // 'board' | 'teacher' | 'all'
  for (const peer of set) {
    if (peer === from) continue;
    if (!roleMatches(peer._meta?.role, targetRole)) continue;
    wsSend(peer, {
      type: 'signal',
      from: from._meta?.role,
      payload: msg.payload,
      action: msg.action,
    });
  }
}

/** 广播课堂实况到 SSE + WebSocket（含 Electron 托盘端） */
export function broadcastLive(classId, event) {
  const id = Number(classId);
  const sse = sseByClass.get(id);
  if (sse) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of sse) {
      try {
        res.write(data);
      } catch {
        /* ignore */
      }
    }
  }
  const wss = wsByClass.get(id);
  if (wss) {
    const raw = JSON.stringify({ channel: 'live', event });
    for (const ws of wss) {
      try {
        if (ws.readyState === 1) ws.send(raw);
      } catch {
        /* ignore */
      }
    }
  }
}

export function wakeBoards(classId, payload = {}) {
  const set = wsByClass.get(Number(classId));
  if (!set) return;
  const raw = JSON.stringify({ type: 'wake', payload });
  for (const ws of set) {
    if (ws._meta?.role === 'board' || ws._meta?.role === 'desktop') {
      try {
        if (ws.readyState === 1) ws.send(raw);
      } catch {
        /* ignore */
      }
    }
  }
}
