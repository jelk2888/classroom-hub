import { useEffect, useState } from 'react';
import { api, clearToken } from './api';

export function AdminPage({ onLogout }: { onLogout: () => void }) {
  const [range, setRange] = useState('7');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [lanList, setLanList] = useState<string[]>([]);

  const load = async () => {
    try {
      const d = await api(`/api/admin/overview?range=${range}`);
      setData(d);
      setAutoApprove(!!d.settings?.class_auto_approve);
      const s = await api('/api/admin/settings');
      setAutoApprove(!!s.class_auto_approve);
      setPublicUrl(s.public_url || '');
      setLanList(s.lan || []);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [range]);

  const setStatus = async (id: number, status: string) => {
    await api(`/api/admin/classes/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    load();
  };

  const toggleAuto = async () => {
    const next = !autoApprove;
    const r = await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ class_auto_approve: next }),
    });
    setAutoApprove(!!r.class_auto_approve);
  };

  const savePublicUrl = async () => {
    const r = await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ public_url: publicUrl.trim() }),
    });
    setPublicUrl(r.public_url || '');
    setLanList(r.lan || []);
    try {
      const { setPublicUrlHint } = await import('./netPrefer');
      setPublicUrlHint(r.public_url || '');
    } catch {
      /* ignore */
    }
    alert('已保存互联网回退地址');
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <div className="top" style={{ padding: 0 }}>
        <div>
          <h2>班级使用数据总览</h2>
          <p>审核班级 · 审核开关 · 模块统计（SQLite）</p>
        </div>
        <div className="top-actions">
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="1">今天</option>
            <option value="7">近 7 天</option>
            <option value="30">近 30 天</option>
            <option value="all">全部</option>
          </select>
          <button className="btn" type="button" onClick={load}>
            刷新
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              clearToken();
              onLogout();
            }}
          >
            退出
          </button>
        </div>
      </div>
      {err && <div className="err">{err}</div>}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-h">
          <h3>注册审核开关</h3>
        </div>
        <div className="panel-b">
          <p className="muted">
            手动审核：新班级注册后需管理员通过才能登录。自动通过：注册后立即可用。
          </p>
          <button className={`btn ${autoApprove ? 'primary' : 'amber'}`} type="button" onClick={toggleAuto}>
            {autoApprove ? '当前：自动通过（点击改为手动）' : '当前：手动审核（点击改为自动）'}
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-h">
          <h3>网络：局域网优先 / 互联网回退</h3>
        </div>
        <div className="panel-b">
          <p className="muted">教师端启动时会先探测局域网 API，不通再使用下方互联网地址。</p>
          <p style={{ marginBottom: 8 }}>
            <strong>本机局域网：</strong>
            {lanList.length ? lanList.join(' · ') : '（服务器未检测到局域网 IP）'}
          </p>
          <label>互联网回退地址（公网 / 内网穿透 URL，可空）</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input
              style={{ flex: 1 }}
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              placeholder="如 https://class.example.com 或 http://外网IP:3789"
            />
            <button className="btn primary" type="button" onClick={savePublicUrl}>
              保存
            </button>
          </div>
        </div>
      </div>

      {data && (
        <>
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-h">
              <h3>待审核（{data.pending.length}）</h3>
            </div>
            <div className="panel-b">
              {!data.pending.length && <p className="muted">暂无待审核班级</p>}
              {data.pending.map((c: any) => (
                <div className="row" key={c.id}>
                  <span>
                    {c.code} · {c.name} · {c.school}
                  </span>
                  <span>
                    <button className="btn ok" type="button" onClick={() => setStatus(c.id, 'active')}>
                      通过
                    </button>{' '}
                    <button className="btn danger" type="button" onClick={() => setStatus(c.id, 'disabled')}>
                      禁用
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-h">
              <h3>各班使用次数排行</h3>
            </div>
            <div className="panel-b">
              <table className="table">
                <thead>
                  <tr>
                    <th>班级码</th>
                    <th>昵称</th>
                    <th>学校</th>
                    <th>状态</th>
                    <th>使用次数</th>
                    <th>最后使用</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.classes.map((c: any) => (
                    <tr key={c.id}>
                      <td>{c.code}</td>
                      <td>{c.name}</td>
                      <td>{c.school}</td>
                      <td>{c.status}</td>
                      <td>{c.usage_count}</td>
                      <td>{c.last_used_at || '-'}</td>
                      <td>
                        {c.status !== 'active' && (
                          <button className="btn ok" type="button" onClick={() => setStatus(c.id, 'active')}>
                            启用
                          </button>
                        )}{' '}
                        {c.status !== 'disabled' && (
                          <button className="btn danger" type="button" onClick={() => setStatus(c.id, 'disabled')}>
                            禁用
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-h">
              <h3>模块使用明细</h3>
            </div>
            <div className="panel-b">
              <table className="table">
                <thead>
                  <tr>
                    <th>班级</th>
                    <th>模块</th>
                    <th>次数</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usage.map((u: any, i: number) => (
                    <tr key={i}>
                      <td>
                        {u.code} {u.name}
                      </td>
                      <td>{u.module}</td>
                      <td>{u.cnt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
