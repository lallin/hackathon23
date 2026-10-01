import type { ChangeEvent, CSSProperties } from 'react';
import { ChevronDown } from './icons';

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
  /** 체크리스트처럼 작은 셀렉트 */
  compact?: boolean;
  style?: CSSProperties;
}

/** 화살표가 달린 드롭박스 (기본 select 의 모양만 다듬음) */
export function Select({ id, value, onChange, options, ariaLabel, compact, style }: Props) {
  const base: CSSProperties = compact
    ? { minHeight: 32, padding: '0 26px 0 10px', borderRadius: 8, border: '1px solid #121826', color: '#121826', fontSize: 13, fontWeight: 700 }
    : { width: '100%', minHeight: 40, padding: '0 30px 0 12px', borderRadius: 10, border: '1px solid #CBD2E3', color: '#121826', fontSize: 14, fontWeight: 500 };
  return (
    <div className="select-wrap" style={compact ? undefined : { width: '100%' }}>
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        style={{ ...base, background: '#fff', ...style }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={compact ? 14 : 16}
        stroke={compact ? 2.2 : 2}
        style={{ right: compact ? 7 : 9, marginTop: compact ? -7 : -8, color: compact ? '#121826' : '#566079' }}
      />
    </div>
  );
}
