import { useState } from 'react';
import type { FormEvent } from 'react';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../lib/constants';
import { useApp } from '../state/store';
import { Logo } from './Header';

export function AuthScreen() {
  const { s, act } = useApp();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    if (signup && password.length < 6) {
      setError('비밀번호는 6자 이상으로 정해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await act.login(email.trim(), password, signup);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '로그인하지 못했어요.');
      setBusy(false);
    }
  };

  const booting = s.phase === 'boot';

  return (
    <main className="auth">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo size={44} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>에타빌더</div>
            <div className="sub">졸업 요건 기반 수강신청 시간표 빌더 · {s.meta?.semester ?? '2026학년도 2학기'}</div>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="로그인 또는 회원가입">
          <button role="tab" aria-selected={!signup} onClick={() => { setSignup(false); setError(null); }}>
            로그인
          </button>
          <button role="tab" aria-selected={signup} onClick={() => { setSignup(true); setError(null); }}>
            회원가입
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700 }}>
            이메일
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@konkuk.ac.kr" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700 }}>
            비밀번호
            <input
              className="input"
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={signup ? '6자 이상' : ''}
            />
          </label>
          {error && <div className="notice notice-bad" role="alert">{error}</div>}
          {s.bootError && <div className="notice notice-warn">{s.bootError}</div>}
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy || booting}>
            {(busy || booting) && <span className="spinner" />}
            {booting ? '서버 연결 중…' : signup ? '가입하고 시작하기' : '로그인'}
          </button>
        </form>

        <div className="notice notice-info" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            시연용 계정 <b>{DEMO_EMAIL}</b> / {DEMO_PASSWORD}
          </span>
          <button
            className="btn-link btn"
            type="button"
            onClick={() => {
              setSignup(false);
              setEmail(DEMO_EMAIL);
              setPassword(DEMO_PASSWORD);
              setError(null);
            }}
          >
            채우기
          </button>
        </div>
        <p className="sub" style={{ margin: 0 }}>
          성적표 PDF는 한 번 읽고 버려요. 학번·이름은 읽지 않고, 들은 과목 목록만 계정에 저장해요.
        </p>
        {booting && <p className="sub faint" style={{ margin: 0 }}>무료 서버가 잠들어 있으면 깨우는 데 최대 1분 걸려요.</p>}
      </div>
    </main>
  );
}
