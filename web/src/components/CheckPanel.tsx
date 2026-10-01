import type { LevelValue } from '../api/types';
import { CHECKLIST_EMPTY, LEVEL_LABEL, LEVELS } from '../lib/constants';
import { isPendingItem, useApp } from '../state/store';
import { CondPanel } from './CondPanel';
import { Check, X } from './icons';
import { Select } from './Select';

const OPTIONS = LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }));
const COUNT_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}개` }));

export function CheckPanel({ className }: { className: string }) {
  const { s, act, current } = useApp();
  const list = s.draft.checklist;
  const evalOf = (key: string) => current?.checklist_eval.find((e) => e.key === key) ?? null;

  const enabled = list.filter((i) => i.enabled);
  const satisfied = enabled.filter((i) => !isPendingItem(i, s.applied) && evalOf(i.key)?.satisfied === true).length;

  return (
    <section className={`card scroll ${className}`} aria-label="시간표 조건과 AI 체크리스트" style={{ gap: 12 }}>
      <CondPanel />
      <div aria-hidden="true" className="divider" style={{ margin: 0 }} />
      <div className="card-h" style={{ flex: 'none' }}>
        <h2 id="h-check">AI 체크리스트</h2>
        {enabled.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700 }} aria-live="polite">
            {satisfied}/{enabled.length} 충족
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <div className="notice notice-info" style={{ flex: 1, minHeight: 100, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
          {CHECKLIST_EMPTY}
        </div>
      ) : (
        <div className="scroll" style={{ flex: 1, minHeight: 130, display: 'flex', flexDirection: 'column', gap: 8, padding: 3, margin: -3 }}>
          {list.map((it) => {
            const pendingEval = isPendingItem(it, s.applied);
            const ev = pendingEval ? null : evalOf(it.key);
            return (
              <div key={it.key} className={`ck${it.enabled ? '' : ' off'}${s.flash.includes(it.key) ? ' flash' : ''}`}>
                <div className="ck-top">
                  <span className="ck-label" title={it.label}>
                    {it.label}
                  </span>
                  {it.type === 'level' && (
                    <Select compact ariaLabel={`${it.label} 정도`} value={it.level ?? 'mid'} onChange={(v) => act.setLevel(it.key, v as LevelValue)} options={OPTIONS} />
                  )}
                  {it.type === 'count' && (
                    <Select compact ariaLabel={`${it.label} 개수`} value={String(it.count ?? 1)} onChange={(v) => act.setCount(it.key, Number(v))} options={COUNT_OPTIONS} />
                  )}
                  {it.source === 'style' && <span className="tag tag-gray">스타일</span>}
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <button
                      className="ck-box"
                      role="checkbox"
                      aria-checked={it.enabled}
                      aria-label={`${it.label} 생성에 반영`}
                      title={it.enabled ? '체크를 풀면 다음 생성에서 빠져요' : '체크하면 다음 생성에 반영돼요'}
                      onClick={() => act.toggleItem(it.key)}
                    >
                      {it.enabled && <Check size={14} stroke={3} />}
                    </button>
                    <button className="icon-btn bare" aria-label={`${it.label} 항목 삭제`} onClick={() => act.removeItem(it.key)}>
                      <X size={14} />
                    </button>
                  </span>
                </div>
                <div className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {!it.enabled ? (
                    <span className="faint">체크 해제 · 생성에서 빠져요</span>
                  ) : pendingEval || !ev ? (
                    <span className="gray-text">생성하기 후 평가</span>
                  ) : (
                    <>
                      {ev.satisfied === true && <span className="ok-text">충족</span>}
                      {ev.satisfied === false && <span className="bad-text">미충족</span>}
                      {ev.satisfied === null && !ev.text.startsWith('판단 불가') && <span className="gray-text">판단 불가</span>}
                      <span className={ev.satisfied === null && ev.text.startsWith('판단 불가') ? 'gray-text' : undefined}>{ev.text}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
