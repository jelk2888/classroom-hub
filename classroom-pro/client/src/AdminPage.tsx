import { useEffect, useState } from 'react';
import { api, clearToken } from './api';

export function AdminPage({ onLogout }: { onLogout: () => void }) {
  const [range, setRange] = useState('7');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [lanList, setLanList] = useState<string[]>([]);
  const [adminName, setAdminName] = useState('admin');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const [editPwd, setEditPwd] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setErr('');
      const d = await api(`/api/admin/overview?range=${range}`);
      setData(d);
      setAutoApprove(!!d.settings?.class_auto_approve);
      const s = await api('/api/admin/settings');
      setAutoApprove(!!s.class_auto_approve);
      setPublicUrl(s.public_url || '');
      setLanList(s.lan || []);
      try {
        const me = await api('/api/admin/me');
        if (me.admin?.username) setAdminName(me.admin.username);
      } catch {
        /* ignore */
      }
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

  const changeAdminPwd = async () => {
    if (newPwd.length < 6) return alert('新密码至少 6 位');
    if (newPwd !== newPwd2) return alert('两次新密码不一致');
    setBusy(true);
    try {
      await api('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      });
      setOldPwd('');
      setNewPwd('');
      setNewPwd2('');
      alert('管理员密码已修改');
    } catch (e: any) {
      alert(e.message || '修改失败');
    } finally {
      setBusy(false);
    }
  };

  const saveClass = async () => {
    if (!edit) return;
    if (editPwd && editPwd.length < 6) return alert('班级密码至少 6 位');
    setBusy(true);
    try {
      await api(`/api/admin/classes/${edit.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          code: edit.code,
          name: edit.name,
          school: edit.school,
          status: edit.status,
          password: editPwd || undefined,
        }),
      });
      setEdit(null);
      setEditPwd('');
      await load();
      alert('班级信息已保存');
    } catch (e: any) {
      alert(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const summary = data?.summary;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <div className="top" style={{ padding: 0 }}>
        <div>
          <h2>管理后台</h2>
          <p>
            管理员 {adminName} · 审核班级 · 改密 · 全班使用情况
          </p>
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

      {summary && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-h">
            <h3>全部班级使用概况</h3>
          </div>
          <div className="panel-b" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <span>班级总数 <strong>{summary.class_total}</strong></span>
            <span>启用 <strong>{summary.active}</strong></span>
            <span>待审 <strong>{summary.pending}</strong></span>
            <span>禁用 <strong>{summary.disabled}</strong></span>
            <span>学生合计 <strong>{summary.student_total}</strong></span>
            <span>
              选定时段操作次数 <strong>{summary.usage_total}</strong>
            </span>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-h">
          <h3>修改管理员密码</h3>
        </div>
        <div className="panel-b stack" style={{ maxWidth: 420 }}>
          <label>原密码</label>
          <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
          <label>新密码（至少 6 位）</label>
          <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          <label>确认新密码</label>
          <input type="password" value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} />
          <button className="btn primary" type="button" disabled={busy} onClick={changeAdminPwd}>
            保存管理员密码
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-h">
          <h3>注册审核开关</h3>
        </div>
        <div className="panel-b">
          <p className="muted">手动审核：新班级注册后需管理员通过才能登录。自动通过：注册后立即可用。</p>
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
              <h3>全部班级（信息 / 密码 / 使用）</h3>
            </div>
            <div className="panel-b">
              <table className="table">
                <thead>
                  <tr>
                    <th>班级码</th>
                    <th>昵称</th>
                    <th>学校</th>
                    <th>状态</th>
                    <th>学生数</th>
                    <th>累计使用</th>
                    <th>时段操作</th>
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
                      <td>{c.student_count ?? 0}</td>
                      <td>{c.usage_count}</td>
                      <td>{c.range_usage ?? 0}</td>
                      <td>{c.last_used_at || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            setEdit({ ...c });
                            setEditPwd('');
                          }}
                        >
                          编辑
                        </button>{' '}
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
              <h3>模块使用明细（选定时段 · 全部班级）</h3>
            </div>
            <div className="panel-b">
              {!data.usage?.length && <p className="muted">该时段暂无模块使用记录</p>}
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

      {edit && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => setEdit(null)}
        >
          <div className="panel" style={{ width: 'min(480px, 100%)', margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="panel-h">
              <h3>编辑班级</h3>
              <button className="btn" type="button" onClick={() => setEdit(null)}>
                关闭
              </button>
            </div>
            <div className="panel-b stack">
              <label>班级码</label>
              <input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
              <label>班级昵称</label>
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <label>学校</label>
              <input value={edit.school} onChange={(e) => setEdit({ ...edit, school: e.target.value })} />
              <label>状态</label>
              <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                <option value="active">启用 active</option>
                <option value="pending">待审 pending</option>
                <option value="disabled">禁用 disabled</option>
              </select>
              <label>新登录密码（留空则不改）</label>
              <input
                type="password"
                value={editPwd}
                onChange={(e) => setEditPwd(e.target.value)}
                placeholder="至少 6 位"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" type="button" disabled={busy} onClick={saveClass}>
                  保存
                </button>
                <button className="btn" type="button" onClick={() => setEdit(null)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
