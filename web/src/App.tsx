import { useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { ChatPanel } from './components/ChatPanel';
import { CheckPanel } from './components/CheckPanel';
import { CondPanel } from './components/CondPanel';
import { GradPanel } from './components/GradPanel';
import { Header } from './components/Header';
import { LectureModal } from './components/LectureModal';
import { ListPanel } from './components/ListPanel';
import { TablePanel } from './components/TablePanel';
import { AppProvider, useApp } from './state/store';

type Tab = 'table' | 'list' | 'cond';

const TABS: [Tab, string][] = [
  ['table', '시간표'],
  ['list', '과목'],
  ['cond', '조건']
];

function Builder() {
  const { s } = useApp();
  // 좁은 화면에서는 탭으로 패널 묶음을 바꿔 본다
  const [tab, setTab] = useState<Tab>('table');
  const cls = (name: string, on: boolean) => `${name}${on ? '' : ' is-off'}`;

  return (
    <div className="app">
      <Header />
      <main className="shell">
        <GradPanel className={cls('p-grad', tab === 'cond')} />
        <TablePanel className={cls('p-table', tab === 'table')} />
        <CheckPanel className={cls('p-check', tab === 'list')} />
        <CondPanel className={cls('p-cond', tab === 'cond')} />
        <ChatPanel className={cls('p-chat', tab === 'table')} />
        <ListPanel className={cls('p-list', tab === 'list')} />
      </main>
      <nav className="mobnav" aria-label="화면 전환">
        {TABS.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>
      <LectureModal />
      {s.toast && (
        <div key={s.toast.id} className="toast" role="status">
          {s.toast.text}
        </div>
      )}
    </div>
  );
}

function Root() {
  const { s } = useApp();
  return s.phase === 'app' ? <Builder /> : <AuthScreen />;
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
