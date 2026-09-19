import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, setToken } from './api';
import { getNetPath, getPublicUrlHint, netPathLabel, setPublicUrlHint } from './netPrefer';

type Mode = 'login' | 'register' | 'admin';

export function LoginPage({
  onClassLogin,
  onAdminLogin,
  desktopBoard,
}: {
  onClassLogin: (payload: any) => void;
  onAdminLogin: () => void;
  /** 一体机 EXE：登录后进入大屏待命 */
  desktopBoard?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [netLabel, setNetLabel] = useState(netPathLabel());
  const [publicHint, setPublicHint] = useState(getPublicUrlHint());

  useEffect(() => {
    setNetLabel(netPathLabel(getNetPath()));
  }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr('');
    setOk('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      if (mode === 'login') {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            code: fd.get('code'),
            password: fd.get('password'),
          }),
        });
        setToken(data.token);
        onClassLogin(data);
      } else if (mode === 'register') {
        const data = await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            code: fd.get('code'),
            name: fd.get('name'),
            school: fd.get('school'),
            password: fd.get('password'),
          }),
        });
        setOk(data.message || '注册成功，等待审核');
        setMode('login');
      } else {
        const data = await api('/api/auth/admin-login', {
          method: 'POST',
          body: JSON.stringify({
            username: fd.get('username'),
            password: fd.get('password'),
          }),
        });
        setToken(data.token);
        onAdminLogin();
      }
    } catch (ex: any) {
      setErr(ex.message || '失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img
          src="/logo.png"
          alt=""
          width={72}
          height={72}
          style={{ display: 'block', margin: '0 auto 10px', objectFit: 'contain' }}
        />
        <h1>{desktopBoard ? '教室一体机登录' : '看班智控台 Pro'}</h1>
        <p className="sub">
          {desktopBoard
            ? '登录后进入大屏待命：托盘最小化，有任务自动弹出；右侧显示当天课表'
            : 'SQLite 本地版 · 叫人 · 纪律 · 作业 · 点名 · 计时 · 座位 · 课表 · 宠物 · 值日 · 积分'}
        </p>
        <p className="muted" style={{ marginTop: -6 }}>
          当前链路：{netLabel}（局域网优先，不通再走互联网）
        </p>
        <div className="tabs-row">
          <button type="button" className={`tab-pill ${mode === 'login' ? 'on' : ''}`} onClick={() => setMode('login')}>
            班级登录
          </button>
          {!desktopBoard && (
            <>
              <button type="button" className={`tab-pill ${mode === 'register' ? 'on' : ''}`} onClick={() => setMode('register')}>
                注册新班级
              </button>
              <button type="button" className={`tab-pill ${mode === 'admin' ? 'on' : ''}`} onClick={() => setMode('admin')}>
                管理后台
              </button>
            </>
          )}
        </div>
        <form className="stack" onSubmit={submit}>
          {mode !== 'admin' ? (
            <>
              <label>班级码</label>
              <input name="code" required placeholder="如 DEMO01" defaultValue="DEMO01" />
              {mode === 'register' && (
                <>
                  <label>班级昵称</label>
                  <input name="name" required placeholder="显示名称" />
                  <label>所在学校</label>
                  <input name="school" required placeholder="学校名称" />
                </>
              )}
              <label>{mode === 'register' ? '登录密码（至少6位）' : '访问密码'}</label>
              <input name="password" type="password" required defaultValue={mode === 'login' ? '123456' : ''} />
            </>
          ) : (
            <>
              <label>管理员用户名</label>
              <input name="username" required defaultValue="admin" />
              <label>后台密码</label>
              <input name="password" type="password" required defaultValue="admin123" />
            </>
          )}
          {mode === 'login' && (
            <>
              <label>互联网回退地址（可选，手机 4G 时用）</label>
              <input
                value={publicHint}
                onChange={(e) => setPublicHint(e.target.value)}
                placeholder="https://你的公网或穿透地址"
              />
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setPublicUrlHint(publicHint);
                  setOk(publicHint ? '已记住互联网地址，下次启动会优先试局域网' : '已清除互联网地址');
                }}
              >
                保存网络偏好
              </button>
            </>
          )}
          {err && <div className="err">{err}</div>}
          {ok && <div className="okmsg">{ok}</div>}
          <button className="btn primary" disabled={busy} type="submit">
            {busy
              ? '处理中…'
              : mode === 'login'
                ? desktopBoard
                  ? '登录并进入大屏待命'
                  : '进入班级'
                : mode === 'register'
                  ? '提交注册'
                  : '进入后台'}
          </button>
        </form>
      </div>
    </div>
  );
}
