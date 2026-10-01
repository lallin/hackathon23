import type { SectionInfo } from '../api/types';
import { CATEGORY_COLOR, DAYS, GRID_END, GRID_START, isOnline, toMin } from '../lib/constants';
import { useApp } from '../state/store';
import { Alert, Ban, ChevronLeft, ChevronRight, Pin, Refresh, X } from './icons';


/** 같은 이수구분 안에서 과목마다 두 가지 색을 번갈아 쓴다 */
function colorMap(sections: SectionInfo[]): Record<string, string> {
  const seen: Record<string, number> = {};
  const out: Record<string, string> = {};
  sections.forEach((x) => {
    if (out[x.course_id]) return;
    const n = seen[x.category] ?? 0;
    const c = CATEGORY_COLOR[x.category] ?? CATEGORY_COLOR.전선;
    out[x.course_id] = n % 2 ? c.alt : c.main;
    seen[x.category] = n + 1;
  });
  return out;
}

export function TablePanel({ className }: { className: string }) {
  const { s, act, current, pending } = useApp();
  const n = s.combos.length;
  const sections = current?.sections ?? [];
  const colors = colorMap(sections);
  // 기본 9~18시, 더 늦게 끝나는 수업(야간 등)이 있으면 그만큼 늘린다
  const lastEnd = Math.max(GRID_END * 60, ...s.combos.flatMap((c) => c.sections.flatMap((x) => x.times.map((t) => toMin(t.end)))));
  const gridEnd = Math.ceil(lastEnd / 60);
  const SPAN = (gridEnd - GRID_START) * 60;
  const HOURS = Array.from({ length: gridEnd - GRID_START }, (_, i) => GRID_START + i);
  const free = s.draft.conditions.free_days;
  // 강의 시간이 없는 분반(e-러닝)은 요일 칸 대신 시간표 아래 이러닝 자리에 놓는다
  const online = sections.filter(isOnline);
  const sel = sections.find((x) => x.section_id === s.selected) ?? null;
  const selPinned = !!sel && s.draft.pinned.includes(sel.section_id);
  const selExcluded = !!sel && s.draft.excluded.includes(sel.course_id);
  const canGenerate = s.reqStatus === 'ready' && !s.generating;

  return (
    <section className={`card ${className}`} aria-labelledby="h-table">
      <div className="card-h">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          <h2 id="h-table">추천 시간표</h2>
          <span className="tag tag-green" style={{ fontSize: 12, padding: '4px 10px' }}>
            추천 순위 {n ? s.rank + 1 : 0} / {n}
          </span>
          <button className="icon-btn" aria-label="이전 순위" disabled={n < 2} onClick={() => act.step(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn" aria-label="다음 순위" disabled={n < 2} onClick={() => act.step(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {pending > 0 && (
            <span className="tag" style={{ background: 'var(--warn-tint)', color: 'var(--warn)', fontSize: 12, padding: '4px 10px' }} aria-live="polite">
              변경 {pending}개 대기 중
            </span>
          )}
          <button className="btn btn-primary" onClick={act.generate} disabled={!canGenerate} style={{ minHeight: 38, fontSize: 14 }}>
            {s.generating ? <span className="spinner" /> : <Refresh />}
            {s.generating ? '생성 중…' : '생성하기'}
          </button>
        </div>
      </div>

      {current && (
        <div className="sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', alignItems: 'baseline' }}>
          <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
            {current.total_credits}학점 · 점수 {current.score}
            {current.enabled_count > 0 && ` · 체크리스트 ${current.satisfied_count}/${current.enabled_count} 충족`}
          </span>
          {current.reason && s.rank === 0 && <span style={{ color: 'var(--ok)', fontWeight: 500 }}>{current.reason}</span>}
          {!sel && <span className="faint" style={{ marginLeft: 'auto' }}>블록을 눌러 고정·제한</span>}
        </div>
      )}

      {s.draft.excluded.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>제한한 과목</span>
          {s.draft.excluded.map((id) => (
            <button key={id} className="btn btn-sm btn-danger" onClick={() => act.unexclude(id)} aria-label={`${s.names[id] ?? id} 제한 풀기`}>
              {s.names[id] ?? id}
              <X size={12} stroke={2.4} />
            </button>
          ))}
        </div>
      )}

      {sel && (
        <div className="blk-bar" aria-live="polite">
          <span style={{ fontWeight: 700 }}>
            {sel.course} {sel.section_id.split('-').pop()}분반 · {sel.professor}
          </span>
          <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button className="btn btn-sm" aria-pressed={selPinned} onClick={() => act.pin(sel.section_id)} disabled={selExcluded}>
              <Pin size={13} />
              {selPinned ? '고정 풀기' : '고정'}
            </button>
            {selExcluded ? (
              <button className="btn btn-sm" onClick={() => act.unexclude(sel.course_id)}>
                제한 풀기
              </button>
            ) : (
              <button className="btn btn-sm btn-danger" onClick={() => act.exclude(sel.course_id, sel.course)}>
                <Ban size={13} />
                제한
              </button>
            )}
            <button className="btn btn-sm" onClick={() => act.openDetail(sel.lecture_id)}>
              상세
            </button>
            <button className="icon-btn bare" aria-label="선택 해제" onClick={() => act.select(null)}>
              <X size={14} />
            </button>
          </span>
        </div>
      )}

      {s.infeasible && (
        <div className="notice notice-bad" role="alert" style={{ flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Alert style={{ flex: 'none', marginTop: 2 }} />
            <span>
              <b>{s.infeasible.message}</b> 시간표는 이전 결과 그대로예요.
            </span>
          </div>
          {s.infeasible.suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 24 }}>
              {s.infeasible.suggestions.map((g) => (
                <button key={g.text} className="btn btn-sm" title={g.hint} onClick={() => act.applySuggestion(g)}>
                  {g.text}
                  <span className="faint">· 조합 {g.found}개</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {s.genError && (
        <div className="notice notice-bad" role="alert">
          시간표를 만들지 못했어요. {s.genError}
        </div>
      )}
      {s.warnings.map((w) => (
        <div key={w} className="notice notice-warn">
          {w}
        </div>
      ))}

      <div className="ttg-wrap">
        <div className="ttg">
          <div className="ttg-head">
            <div />
            {DAYS.map((d) => (
              <div key={d}>
                <span>{d}</span>
                {free.includes(d) && <span className="tag tag-dark" style={{ fontSize: 10, padding: '1px 5px' }}>공강</span>}
              </div>
            ))}
          </div>
          <div className="ttg-body">
            <div className="ttg-hours">
              {HOURS.map((h, i) => (
                <span key={h} style={{ top: `${((i * 100) / HOURS.length).toFixed(3)}%` }}>
                  {h}
                </span>
              ))}
            </div>
            {DAYS.map((d) => (
              <div key={d} className={`ttg-col${free.includes(d) ? ' free' : ''}`} style={{ backgroundSize: `100% ${(100 / HOURS.length).toFixed(4)}%` }}>
                {sections.flatMap((x) =>
                  x.times
                    .filter((t) => t.day === d)
                    .map((t) => {
                      const top = ((toMin(t.start) - GRID_START * 60) / SPAN) * 100;
                      const h = ((toMin(t.end) - toMin(t.start)) / SPAN) * 100;
                      const pinned = s.draft.pinned.includes(x.section_id);
                      const excluded = s.draft.excluded.includes(x.course_id);
                      const tall = toMin(t.end) - toMin(t.start) >= 90;
                      return (
                        <button
                          key={`${x.section_id}-${t.day}-${t.start}`}
                          className={`blk${s.selected === x.section_id ? ' sel' : ''}${pinned ? ' pinned' : ''}${excluded ? ' excluded' : ''}`}
                          aria-pressed={s.selected === x.section_id}
                          aria-label={`${x.course} ${x.professor}, ${t.day}요일 ${t.start}~${t.end}${pinned ? ', 고정됨' : ''}${excluded ? ', 제한됨' : ''}`}
                          onClick={() => act.select(x.section_id)}
                          style={{ top: `${top}%`, height: `${h}%`, backgroundColor: colors[x.course_id], paddingRight: pinned ? 22 : 5 }}
                        >
                          <span className="nm" style={tall ? undefined : { WebkitLineClamp: 1, fontSize: 11 }}>
                            {x.course}
                          </span>
                          {tall && <span className="pf">{x.professor}</span>}
                          {pinned && (
                            <span className="pin">
                              <Pin size={10} stroke={2.4} />
                            </span>
                          )}
                        </button>
                      );
                    })
                )}
              </div>
            ))}
          </div>
          {online.length > 0 && (
            <div className="ttg-online">
              <div className="ttg-online-h">이러닝</div>
              <div className="ttg-online-list">
                {online.map((x) => {
                  const pinned = s.draft.pinned.includes(x.section_id);
                  const excluded = s.draft.excluded.includes(x.course_id);
                  return (
                    <button
                      key={x.section_id}
                      className={`blk blk-online${s.selected === x.section_id ? ' sel' : ''}${pinned ? ' pinned' : ''}${excluded ? ' excluded' : ''}`}
                      aria-pressed={s.selected === x.section_id}
                      aria-label={`${x.course} ${x.professor}, 이러닝(시간 없음)${pinned ? ', 고정됨' : ''}${excluded ? ', 제한됨' : ''}`}
                      onClick={() => act.select(x.section_id)}
                      style={{ backgroundColor: colors[x.course_id], paddingRight: pinned ? 22 : 8 }}
                    >
                      <span className="nm">{x.course}</span>
                      <span className="pf">{`${x.professor} · ${x.credits}학점`}</span>
                      {pinned && (
                        <span className="pin">
                          <Pin size={10} stroke={2.4} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {(s.generating || !current) && (
          <div className="ttg-over" role="status">
            {s.generating ? (
              <>
                <span className="spinner" style={{ width: 22, height: 22, color: 'var(--green)' }} />
                시간표를 짜는 중이에요…
              </>
            ) : s.reqStatus === 'unsupported' ? (
              '지원하는 학과를 고르면 시간표를 만들 수 있어요.'
            ) : !s.transcript ? (
              <>
                <b style={{ color: 'var(--ink)' }}>성적표 PDF를 올리면 기본 추천 시간표가 여기에 떠요</b>
                <span>왼쪽 [샘플 성적표로 시작]으로 바로 써 볼 수도 있어요.</span>
              </>
            ) : (
              '[생성하기]를 누르면 시간표를 만들어요.'
            )}
          </div>
        )}
      </div>

    </section>
  );
}
