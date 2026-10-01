import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CompareResult, OnDemandResponse, ReviewResult } from '../api/types';
import { BASE_ITEMS, CHAT_HINT, levelFromNum, LEVEL_LABEL } from '../lib/constants';
import { useApp } from '../state/store';
import { Send } from './icons';

const CMP_KEYS = ['assignment', 'team_project', 'exam', 'attendance'];

function CmpRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="cmp-row">
      <span className="faint">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** 두 과목(또는 같은 과목의 두 교수)을 같은 줄 순서로 나란히 보여준다 */
function CompareCards({ data, text, onOpen }: { data: CompareResult; text: string; onOpen: (id: string) => void }) {
  return (
    <div className="rv-wrap">
      <div className="bubble bot">{text}</div>
      <div className="cmp">
        {data.courses.map((c, i) => {
          const l = c.lecture;
          const meta = [c.category, c.credits ? `${c.credits}학점` : null].filter(Boolean).join(' · ');
          return (
            <button key={`${c.name}-${i}`} className="rv cmp-col" onClick={() => l && c.offered && onOpen(l.lecture_id)} disabled={!l || !c.offered}>
              <div className="cmp-head">
                <b style={{ fontSize: 13 }}>{c.name}</b>
                {l && <span>{l.professor} 교수님</span>}
                {meta && <span className="faint">{meta}</span>}
              </div>
              {!c.found ? (
                <span className="faint">과목을 찾지 못했어요</span>
              ) : !c.offered || !l ? (
                <span className="faint">이번 학기에 열리지 않아요</span>
              ) : (
                <>
                  <CmpRow label="별점" value={l.rating != null ? `★ ${l.rating} (강의평 ${l.review_count}개)` : '강의평 없음'} />
                  <CmpRow label="시간" value={l.sections.map((s) => s.times).join(' / ') || '–'} />
                  {CMP_KEYS.map((k) => {
                    const v = l.levels[k];
                    const label = BASE_ITEMS.find((b) => b.key === k)?.label ?? k;
                    return <CmpRow key={k} label={label} value={v ? `${v.level}${v.source === '수강계획서' ? ' (계획서)' : ''}` : '–'} />;
                  })}
                  <CmpRow label="학점 성향" value={l.grading ? `너그러움 ${l.grading.너그러움 ?? 0}% · 깐깐함 ${l.grading.깐깐함 ?? 0}%` : '–'} />
                  <CmpRow label="평가 비율" value={l.evaluation || '–'} />
                  {l.match && l.match.total > 0 && <CmpRow label="체크리스트" value={`${l.match.satisfied} / ${l.match.total} 맞음`} />}
                  {c.other_professors && c.other_professors.length > 0 && <span className="faint">다른 교수: {c.other_professors.join(', ')}</span>}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STATUS: Record<ReviewResult['status'], string> = { cached: '저장된 수강평', collected: '방금 가져옴', not_collected: '가져오지 못함' };

function ReviewCards({ data, onOpen }: { data: OnDemandResponse; onOpen: (id: string) => void }) {
  return (
    <div className="rv-wrap">
      <div className="bubble bot">{data.message}</div>
      {data.results.length > 0 && (
        <div className="rv-cards">
          {data.results.map((r) =>
            r.status === 'not_collected' ? (
              <div key={r.lecture_id} className="rv na">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <b style={{ color: 'var(--ink)' }}>{r.professor} 교수님</b>
                  <span className="tag tag-gray">{STATUS[r.status]}</span>
                </div>
                <span>지금은 가져올 수 없어요. 잠시 후 다시 물어봐 주세요.</span>
              </div>
            ) : (
              <button key={r.lecture_id} className={`rv${r.rank === 1 ? ' first' : ''}`} onClick={() => r.in_catalog && onOpen(r.lecture_id)} disabled={!r.in_catalog}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`tag ${r.rank === 1 ? 'tag-green' : 'tag-gray'}`}>{r.rank}위</span>
                  <b style={{ fontSize: 13 }}>{r.professor} 교수님</b>
                  <span className="faint">수강평 {r.review_count}개</span>
                  <span className="tag tag-gray" style={{ marginLeft: 'auto' }}>
                    {STATUS[r.status]}
                  </span>
                </div>
                <div style={{ fontWeight: 700, color: r.match.total && r.match.satisfied === r.match.total ? 'var(--ok)' : 'var(--ink)' }}>
                  체크리스트 충족 {r.match.satisfied} / 총 {r.match.total}
                </div>
                <div className="lv-row">
                  {BASE_ITEMS.filter((b) => r.levels[b.key] != null).map((b) => (
                    <span key={b.key} className="tag tag-gray">
                      {b.label} {LEVEL_LABEL[levelFromNum(r.levels[b.key] as number)]}
                    </span>
                  ))}
                </div>
                {r.summary.length > 0 && (
                  <ul>
                    {r.summary.slice(0, 3).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                )}
                {r.checklist_eval.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                    {r.checklist_eval.map((e) => (
                      <div key={e.key} style={{ lineHeight: 1.45 }}>
                        <span className={e.satisfied === true ? 'ok-text' : e.satisfied === false ? 'bad-text' : 'gray-text'}>
                          {e.satisfied === true ? '맞음' : e.satisfied === false ? '안 맞음' : '정보 없음'}
                        </span>{' '}
                        <b>{e.label}</b>
                        {e.evidence && <span className="faint"> {e.evidence}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ className }: { className: string }) {
  const { s, act } = useApp();
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.msgs, s.chatBusy]);

  const send = (v: string) => {
    const t = v.trim();
    if (!t || s.chatBusy) return;
    setText('');
    act.send(t);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  const waitingReply = s.chatBusy && !s.msgs.some((m) => m.kind === 'loading');

  return (
    <section className={`card ${className}`} aria-labelledby="h-chat">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 id="h-chat">AI 챗봇</h2>
        <span className="sub">말한 조건은 시간표 조건과 체크리스트에 들어가요</span>
      </div>

      <div ref={logRef} className="scroll chat-log" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 2 }} aria-live="polite">
        {s.msgs.map((m) =>
          m.kind === 'reviews' && m.reviews ? (
            <ReviewCards key={m.id} data={m.reviews} onOpen={(id) => act.openDetail(id)} />
          ) : m.kind === 'compare' && m.compare ? (
            <CompareCards key={m.id} data={m.compare} text={m.text} onOpen={(id) => act.openDetail(id)} />
          ) : m.kind === 'loading' ? (
            <div key={m.id} className="bubble bot load" role="status">
              <span className="spinner" />
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`bubble ${m.role === 'user' ? 'me' : 'bot'}${m.kind === 'error' ? ' err' : ''}`}>
              {m.text}
            </div>
          )
        )}
        {waitingReply && (
          <div className="bubble bot load" role="status">
            <span className="spinner" />
            생각하는 중…
          </div>
        )}
      </div>

      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          name="q"
          type="text"
          autoComplete="off"
          aria-label="AI 챗봇에 보낼 메시지"
          placeholder="예: 수요일 공강이고 팀플은 적게 해줘"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit" className="btn btn-primary" disabled={s.chatBusy || !text.trim()} style={{ minHeight: 44, borderRadius: 12 }}>
          <Send />
          보내기
        </button>
      </form>
      <p className="sub" style={{ margin: '-4px 0 0' }}>
        {CHAT_HINT}
      </p>
    </section>
  );
}
