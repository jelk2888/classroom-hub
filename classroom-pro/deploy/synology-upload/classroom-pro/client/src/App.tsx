import { useEffect, useState } from 'react';
import { LoginPage } from './LoginPage';
import { AdminPage } from './AdminPage';
import { Workspace } from './Workspace';
import { BoardPage } from './BoardPage';
import { api, clearToken, getToken } from './api';

type Phase = 'login' | 'class' | 'admin';

function isBoardMode() {
  return new URLSearchParams(window.location.search).get('mode') === 'board';
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('login');
  const [cls, setCls] = useState<any>(null);
  const [booting, setBooting] = useState(true);
  const boardMode = isBoardMode();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBooting(false);
      return;
    }
    const board = isBoardMode();
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

  if (boardMode) {
    if (phase !== 'class' || !cls) {
      return (
        <div className="auth-page">
          <div className="auth-card">
            <h1>教室大屏</h1>
            <p className="sub">请先在教师端登录同一班级，再点击「打开教室大屏」。</p>
            <a className="btn primary" href="/">
              去教师端登录
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
