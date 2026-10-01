import { useApp } from '../state/store';
import { LogOut } from './icons';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    // 메이쿠 로고: 초록 바탕에 KU
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="#006B38" />
      <text
        x="18"
        y="18.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontFamily="'Noto Sans KR', system-ui, sans-serif"
        fontSize="17"
        fontWeight="700"
        letterSpacing="-0.5"
      >
        KU
      </text>
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
