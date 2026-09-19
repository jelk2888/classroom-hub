import { useEffect, useState } from 'react';
import { LoginPage } from './LoginPage';
import { AdminPage } from './AdminPage';
import { Workspace } from './Workspace';
import { BoardPage } from './BoardPage';
import { api, clearToken, getToken } from './api';

type Phase = 'login' | 'class' | 'admin';

function modeParam() {
  return new URLSearchParams(window.location.search).get('mode') || '';
}

function isBoardMode() {
  return modeParam() === 'board';
}

/** 一体机 EXE：可本机登录后进大屏 */
function isDesktopMode() {
  return modeParam() === 'desktop' || !!(window as any).classroomDesktop;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('login');
  const [cls, setCls] = useState<any>(null);
  const [booting, setBooting] = useState(true);
  const boardMode = isBoardMode();
  const desktopMode = isDesktopMode();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBooting(false);
      return;
    }
    const board = isBoardMode() || isDesktopMode();
    api('/api/me')
      .then((d) => {
        setCls({ class: d.class });
        setPhase('class');
      })
      .catch(() => {
        if (board) {
          clearToken();
          return;
        }
        return api('/api/admin/overview?range=7')
          .then(() => setPhase('admin'))
          .catch(() => clearToken());
      })
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <div className="auth-page">加载中…</div>;

  // 一体机 EXE / ?mode=desktop：登录后直接进大屏（含右侧课表）
  if (desktopMode && !boardMode) {
    if (phase === 'class' && cls) {
      return <BoardPage className={cls.class?.name} />;
    }
    return (
      <LoginPage
        desktopBoard
        onClassLogin={(payload) => {
          setCls(payload);
          setPhase('class');
          try {
            (window as any).classroomDesktop?.notifyReady?.();
          } catch {
            /* ignore */
          }
        }}
        onAdminLogin={() => setPhase('admin')}
      />
    );
  }

  if (boardMode) {
    if (phase !== 'class' || !cls) {
      return (
        <div className="auth-page">
          <div className="auth-card">
            <h1>教室大屏</h1>
            <p className="sub">
              请先登录本班级。一体机推荐使用 EXE（托盘待命），或打开{' '}
              <code>?mode=desktop</code> 在本机登录。
            </p>
            <a className="btn primary" href="/?mode=desktop">
              一体机登录进大屏
            </a>
            <a className="btn" href="/" style={{ marginLeft: 8 }}>
              去教师端
            </a>
          </div>
        </div>
      );
    }
    return <BoardPage className={cls.class?.name} />;
  }

  if (phase === 'admin') return <AdminPage onLogout={() => setPhase('login')} />;
  if (phase === 'class' && cls)
    return (
      <Workspace
        cls={cls}
        onLogout={() => {
          setCls(null);
          setPhase('login');
        }}
      />
    );
  return (
    <LoginPage
      onClassLogin={(payload) => {
        setCls(payload);
        setPhase('class');
      }}
      onAdminLogin={() => setPhase('admin')}
    />
  );
}
