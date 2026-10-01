import type { SectionInfo } from '../api/types';
import { CATEGORY_COLOR, DAYS, GRID_END, GRID_START, isOnline, toMin } from '../lib/constants';
import { useApp } from '../state/store';
import { useHighlighted } from '../state/useHighlight';
import { Alert, Ban, ChevronLeft, ChevronRight, Pin, Refresh, X } from './icons';


/** 이수구분마다 한 가지 색 (졸업 요건 막대와 같은 색)과 그 위 글자색 */
function colorMap(sections: SectionInfo[]): Record<string, { bg: string; fg: string }> {
  const out: Record<string, { bg: string; fg: string }> = {};
  sections.forEach((x) => {
    const c = CATEGORY_COLOR[x.category] ?? CATEGORY_COLOR.전선;
    out[x.course_id] = { bg: c.main, fg: c.text };
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
  const online = sections.filter(isOnline);
  const highlighted = useHighlighted();
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
          {current.reason && s.rank === 0 && <span style={{ color: 'var(--ok)', fontWeight: 500 }}>{current.reason}</span>}
          <span className="faint" style={{ marginLeft: 'auto' }}>블록을 누르면 상세 정보 표시</span>
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
                      const minutes = toMin(t.end) - toMin(t.start);
                      const tall = minutes >= 90;
                      const open = () => {
                        act.select(x.section_id);
                        act.openDetail(x.lecture_id);
                      };
                      return (
                        // 안에 고정·제한 버튼이 있어서 블록 자체는 button 대신 role="button"
                        <div
                          key={`${x.section_id}-${t.day}-${t.start}`}
                          role="button"
                          tabIndex={0}
                          className={`blk${s.selected === x.section_id ? ' sel' : ''}${pinned ? ' pinned' : ''}${excluded ? ' excluded' : ''}${highlighted.has(x.section_id) ? ' hl' : ''}`}
                          aria-label={`${x.course} ${x.professor}, ${t.day}요일 ${t.start}~${t.end}${pinned ? ', 고정됨' : ''}${excluded ? ', 제한됨' : ''}. 누르면 상세 정보`}
                          onClick={open}
                          onKeyDown={(e) => {
                            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              open();
                            }
                          }}
                          style={{ top: `${top}%`, height: `${h}%`, backgroundColor: colors[x.course_id].bg, color: colors[x.course_id].fg, paddingRight: pinned ? 22 : 5 }}
                        >
                          {/* 마우스를 올리면: 위 고정, 아래 제한. 짧은 블록은 둘 다 맨 위에 */}
                          <span className={`blk-act${minutes < 90 ? ' row' : ''}`}>
                            <button
                              type="button"
                              className={`blk-btn${pinned ? ' on' : ''}`}
                              aria-pressed={pinned}
                              disabled={excluded}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.currentTarget.blur();
                                act.pin(x.section_id);
                              }}
                            >
                              <Pin size={11} stroke={2.4} />
                              {pinned ? '고정 해제' : '고정'}
                            </button>
                            <button
                              type="button"
                              className={`blk-btn ban${excluded ? ' on' : ''}`}
                              aria-pressed={excluded}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.currentTarget.blur();
                                if (excluded) act.unexclude(x.course_id);
                                else act.exclude(x.course_id, x.course);
                              }}
                            >
                              <Ban size={11} stroke={2.4} />
                              {excluded ? '제한 해제' : '제한'}
                            </button>
                          </span>
                          <span className="nm" style={tall ? undefined : { WebkitLineClamp: 1, fontSize: 11 }}>
                            {x.course}
                          </span>
                          {tall && <span className="pf">{x.professor}</span>}
                          {pinned && (
                            <span className="pin">
                              <Pin size={10} stroke={2.4} />
                            </span>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            ))}
          </div>
          {/* 이러닝 과목: 요일·시간이 없어서 그리드 아래에 한 줄씩 */}
          {online.map((x) => {
            const pinned = s.draft.pinned.includes(x.section_id);
            const excluded = s.draft.excluded.includes(x.course_id);
            const open = () => {
              act.select(x.section_id);
              act.openDetail(x.lecture_id);
            };
            return (
              <div
                key={x.section_id}
                role="button"
                tabIndex={0}
                className={`ttg-online${pinned ? ' pinned' : ''}${excluded ? ' excluded' : ''}${highlighted.has(x.section_id) ? ' hl' : ''}`}
                aria-label={`이러닝 ${x.course} ${x.professor}${pinned ? ', 고정됨' : ''}${excluded ? ', 제한됨' : ''}. 누르면 상세 정보`}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    open();
                  }
                }}
              >
                <span className="ttg-online-tag">이러닝</span>
                <span className="ttg-online-name">
                  <i style={{ background: colors[x.course_id].bg }} />
                  <b>{x.course}</b>
                  <span className="faint">{x.professor}</span>
                  {pinned && <Pin size={12} stroke={2.4} />}
                </span>
                <span className="blk-act row">
                  <button
                    type="button"
                    className={`blk-btn${pinned ? ' on' : ''}`}
                    aria-pressed={pinned}
                    disabled={excluded}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.currentTarget.blur();
                      act.pin(x.section_id);
                    }}
                  >
                    <Pin size={11} stroke={2.4} />
                    {pinned ? '고정 해제' : '고정'}
                  </button>
                  <button
                    type="button"
                    className={`blk-btn ban${excluded ? ' on' : ''}`}
                    aria-pressed={excluded}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.currentTarget.blur();
                      if (excluded) act.unexclude(x.course_id);
                      else act.exclude(x.course_id, x.course);
                    }}
                  >
                    <Ban size={11} stroke={2.4} />
                    {excluded ? '제한 해제' : '제한'}
                  </button>
                </span>
              </div>
            );
          })}
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
              <b style={{ color: 'var(--ink)' }}>성적표 PDF를 올리면 기본 추천 시간표가 여기에 떠요</b>
            ) : (
              '[생성하기]를 누르면 시간표를 만들어요.'
            )}
          </div>
        )}
      </div>

    </section>
  );
}
