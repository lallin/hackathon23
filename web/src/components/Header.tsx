import { useId } from 'react';
import { useApp } from '../state/store';
import { LogOut } from './icons';

/** 메이쿠 로고: 초록 그라데이션 바탕을 2×2 격자로 나눠 왼쪽 위에 K, 오른쪽 아래에 U, 나머지 두 칸은 옅은 시간표 칸 */
export function Logo({ size = 36 }: { size?: number }) {
  // 한 화면에 로고가 여러 개여도 그라데이션 id 가 겹치지 않게
  const id = `logo-g-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0A8048" />
          <stop offset="1" stopColor="#005430" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="9" fill={`url(#${id})`} />
      <rect x="19.5" y="5.5" width="11" height="11" rx="2.5" fill="#fff" fillOpacity="0.16" />
      <rect x="5.5" y="19.5" width="11" height="11" rx="2.5" fill="#fff" fillOpacity="0.16" />
      <path d="M8.2 6.6v8.8M14.2 6.6 9.3 11l5.1 4.4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.6 20.6v4.4a3.4 3.4 0 0 0 6.8 0v-4.4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Header() {
  const { s, act } = useApp();
  const who = s.user?.name || s.user?.email || '';
  return (
    <header className="hd">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <Logo />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>메이쿠</div>
          <div className="hide-m sub">졸업 요건 기반 수강신청 시간표 빌더</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {s.mode === 'mock' && (
          <span className="tag tag-gray hide-m" title="서버에 새 API가 아직 없어서 브라우저 안 모의 서버(같은 API 형식)로 동작 중이에요">
            모의 서버
          </span>
        )}
        <span style={{ fontSize: 13, fontWeight: 500, padding: '8px 12px', borderRadius: 99, background: '#fff', border: '1px solid var(--line)', whiteSpace: 'nowrap' }}>
          {s.meta?.semester ?? '2026학년도 2학기'}
        </span>
        <span className="hide-m sub" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {who}
        </span>
        <button className="btn" onClick={act.logout} aria-label="로그아웃">
          <LogOut size={15} />
          <span className="hide-m">로그아웃</span>
        </button>
      </div>
    </header>
  );
}
