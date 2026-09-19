import { useAppStore } from './hooks/useAppStore';
import type { ViewId } from './types';
import { CallPanel } from './components/CallPanel';
import { DisciplinePanel } from './components/DisciplinePanel';
import { HomeworkPanel } from './components/HomeworkPanel';
import { RollPanel } from './components/RollPanel';
import { TimerPanel } from './components/TimerPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { LiveStage } from './components/LiveStage';

const NAV: { id: ViewId; label: string; tip: string }[] = [
  { id: 'call', label: '远程叫人', tip: '语音呼叫' },
  { id: 'discipline', label: '纪律管理', tip: '违纪 / 表扬' },
  { id: 'homework', label: '作业布置', tip: '完成率追踪' },
  { id: 'roll', label: '随机点名', tip: '公平抽人' },
  { id: 'timer', label: '计时工具', tip: '倒计时 / 秒表' },
  { id: 'settings', label: '班级设置', tip: '名单与口令' },
];

const MOBILE_NAV: ViewId[] = ['call', 'discipline', 'homework', 'roll', 'timer'];

export default function App() {
  const store = useAppStore();
  const { state, setView, setMode, live, todayStats } = store;

  return (
    <div className={`app-shell ${state.mode === 'board' ? 'board-mode' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">课堂智控台</div>
          <div className="brand-sub">Classroom Command Deck</div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-btn ${state.view === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id)}
            >
              {item.label}
              <small>{item.tip}</small>
            </button>
          ))}
        </nav>
        <div className="room-chip">
          房间口令
          <strong>{state.roomCode}</strong>
          教室端与遥控端打开同一页面即可同步实况
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="top-title">
            <h1>{state.className}</h1>
            <p>把叫人、纪律、作业、点名、计时收进一块工作台</p>
          </div>
          <div className="stats">
            <span className="stat-pill">今日表扬 {todayStats.praise}</span>
            <span className="stat-pill">今日违纪 {todayStats.violation}</span>
            <button className="btn" type="button" onClick={() => setView('settings')}>
              设置
            </button>
            <div className="mode-switch">
              <button type="button" className={state.mode === 'remote' ? 'on' : ''} onClick={() => setMode('remote')}>
                手机遥控
              </button>
              <button type="button" className={state.mode === 'board' ? 'on' : ''} onClick={() => setMode('board')}>
                教室大屏
              </button>
            </div>
          </div>
        </header>

        <div className="workspace">
          {state.view === 'call' && <CallPanel store={store} />}
          {state.view === 'discipline' && <DisciplinePanel store={store} />}
          {state.view === 'homework' && <HomeworkPanel store={store} />}
          {state.view === 'roll' && <RollPanel store={store} />}
          {state.view === 'timer' && <TimerPanel store={store} />}
          {state.view === 'settings' && <SettingsPanel store={store} />}
          <LiveStage live={live} store={store} />
        </div>
      </div>

      <nav className="mobile-nav">
        {MOBILE_NAV.map((id) => {
          const item = NAV.find((n) => n.id === id)!;
          return (
            <button
              key={id}
              type="button"
              className={state.view === id ? 'on' : ''}
              onClick={() => setView(id)}
            >
              {item.label.replace('远程', '').replace('管理', '').replace('布置', '').replace('工具', '')}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
