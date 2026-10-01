import { DAYS, STYLE_FALLBACK, TARGET_MAX, TARGET_MIN, TIME_LABEL, TIME_OPTIONS } from '../lib/constants';
import { useApp } from '../state/store';
import { Check, Minus, Plus } from './icons';

const rowLabel = { flex: 'none', width: 64, fontSize: 12, fontWeight: 700 } as const;

/** 시간표 조건. 카드는 CheckPanel 이 만들고, 이 컴포넌트는 그 안의 윗부분만 그린다 */
export function CondPanel() {
  const { s, act } = useApp();
  const c = s.draft.conditions;
  const a = s.applied?.conditions;
  const fl = (k: string) => (s.flash.includes(k) ? ' flash' : '');
  const styles = s.meta?.styles.map((x) => ({ id: x.id, name: x.name })) ?? STYLE_FALLBACK;
  const changed = (k: keyof typeof c) => !!a && JSON.stringify(a[k]) !== JSON.stringify(c[k]);
  const dot = (on: boolean) => (on ? <span title="생성하기 전 변경" style={{ width: 6, height: 6, borderRadius: 99, background: '#E0A100', display: 'inline-block', marginLeft: 4 }} /> : null);

  return (
    <section aria-labelledby="h-cond" style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 'none' }}>
      <div className="card-h">
        <h2 id="h-cond">시간표 조건</h2>
        <div role="group" aria-label="목표 학점" className={fl('cond.target_credits')} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10 }}>
          <button className="icon-btn" aria-label="목표 학점 줄이기" disabled={c.target_credits <= TARGET_MIN} onClick={() => act.setTarget(c.target_credits - 1)}>
            <Minus />
          </button>
          <span style={{ minWidth: 60, textAlign: 'center', fontSize: 15, fontWeight: 700 }} aria-live="polite">
            {c.target_credits}학점
            {dot(changed('target_credits'))}
          </span>
          <button className="icon-btn" aria-label="목표 학점 늘리기" disabled={c.target_credits >= TARGET_MAX} onClick={() => act.setTarget(c.target_credits + 1)}>
            <Plus />
          </button>
        </div>
      </div>

      <div className={fl('cond.free_days')} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10 }}>
        <span style={rowLabel}>
          공강 요일
          {dot(changed('free_days'))}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DAYS.map((d) => {
            const on = c.free_days.includes(d);
            return (
              <button key={d} className="chip" aria-pressed={on} onClick={() => act.toggleFreeDay(d)}>
                {on && <Check size={13} stroke={2.5} />}
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <div className={fl('cond.preferred_time')} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10 }}>
        <span style={rowLabel}>
          선호 시간
          {dot(changed('preferred_time'))}
        </span>
        <div role="radiogroup" aria-label="선호 시간" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TIME_OPTIONS.map((t) => {
            const on = c.preferred_time === t;
            return (
              <button key={t} className="chip" role="radio" aria-checked={on} aria-pressed={on} onClick={() => act.setTime(t)}>
                {on && <Check size={13} stroke={2.5} />}
                {TIME_LABEL[t]}
              </button>
            );
          })}
        </div>
      </div>

      <div className={fl('cond.style')} style={{ borderRadius: 10 }}>
        <div style={{ ...rowLabel, width: 'auto', marginBottom: 6 }}>
          대학 스타일 <span className="sub" style={{ fontWeight: 400 }}>· 하나만 골라요</span>
          {dot(changed('style'))}
        </div>
        <div role="radiogroup" aria-label="대학 스타일" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {styles.map((st) => {
            const on = c.style === st.id;
            return (
              <button key={st.id} className="chip" role="radio" aria-checked={on} aria-pressed={on} onClick={() => act.setStyle(st.id)}>
                {on && <Check size={13} stroke={2.5} />}
                {st.name}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
