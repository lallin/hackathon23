import { useState } from 'react';
import type { CompareChoices, CompareResult, OnDemandResponse, ReviewResult, ReviewSection } from '../api/types';
import { levelFromNum, LEVEL_LABEL } from '../lib/constants';
import { useApp } from '../state/store';

const CMP_KEYS = ['assignment', 'team_project', 'exam', 'attendance'];
const SHORT: Record<string, string> = { assignment: '과제', team_project: '팀플', exam: '시험', attendance: '출석', presentation: '발표' };
const LEVEL_ORDER = ['적음', '보통', '많음'];

/** 분반마다 [시간표에 넣기] 버튼. 누르면 그 분반을 고정하고 바로 다시 생성한다 */
function AddButtons({ sections, courseId, label }: { sections: ReviewSection[]; courseId?: string | null; label: string }) {
  const { s, act } = useApp();
  if (!courseId || !sections.length) return null;
  const pinned = new Set(s.draft.pinned);
  return (
    <div className="add-row">
      {sections.map((sec) => {
        const on = pinned.has(sec.section_id);
        return (
          <button
            key={sec.section_id}
            type="button"
            className={`add-btn${on ? ' on' : ''}`}
            disabled={s.generating || on}
            onClick={() => act.addSection(sec.section_id, courseId, label)}
            title="이 분반을 고정하고 시간표를 다시 만들어요"
          >
            {on ? `시간표에 고정됨 · ${sec.times}` : `+ 시간표에 넣기 · ${sec.times}`}
          </button>
        );
      })}
    </div>
  );
}

function LevelTags({ levels }: { levels: Record<string, number | null | undefined> }) {
  const keys = CMP_KEYS.filter((k) => levels[k] != null);
  if (!keys.length) return null;
  return (
    <div className="lv-row">
      {keys.map((k) => (
        <span key={k} className="tag tag-gray">
          {SHORT[k]} {LEVEL_LABEL[levelFromNum(levels[k] as number)]}
        </span>
      ))}
    </div>
  );
}

/** 두 과목(또는 같은 과목의 두 교수)을 짧은 카드로 나란히 보여준다 */
export function CompareCards({ data, text }: { data: CompareResult; text: string }) {
  const { act } = useApp();
  return (
    <div className="rv-wrap">
      <div className="bubble bot">{text}</div>
      <div className="cmp">
        {data.courses.map((c, i) => {
          const l = c.lecture;
          const meta = [l ? `${l.professor} 교수님` : null, c.category, c.credits ? `${c.credits}학점` : null].filter(Boolean).join(' · ');
          const nums: Record<string, number | null> = {};
          if (l) CMP_KEYS.forEach((k) => (nums[k] = l.levels[k] ? LEVEL_ORDER.indexOf(l.levels[k].level) + 1 || null : null));
          return (
            <div key={`${c.name}-${i}`} className="rv cmp-col">
              <button type="button" className="link-btn cmp-head" onClick={() => l && c.offered && act.openDetail(l.lecture_id)} disabled={!l || !c.offered}>
                <b style={{ fontSize: 13 }}>{c.name}</b>
                {meta && <span className="faint">{meta}</span>}
              </button>
              {!c.found ? (
                <span className="faint">과목을 찾지 못했어요</span>
              ) : !c.offered || !l ? (
                <span className="faint">이번 학기에 열리지 않아요</span>
              ) : (
                <>
                  <span>
                    {l.rating != null ? `★ ${l.rating}` : '강의평 없음'}
                    {l.rating != null && <span className="faint"> (강의평 {l.review_count}개)</span>}
                  </span>
                  <LevelTags levels={nums} />
                  {l.grading && l.grading.너그러움 != null && <span className="faint">학점 너그러움 {l.grading.너그러움}%</span>}
                  {l.match && l.match.total > 0 && <span className="faint">체크리스트 {l.match.satisfied}/{l.match.total} 맞음</span>}
                  <AddButtons sections={l.sections} courseId={c.course_id} label={`'${c.name}' ${l.professor} 교수님`} />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 교수님이 여러 분인 과목은 비교 전에 고르게 한다. 추천 교수님은 미리 골라 둔다 */
export function ChooseCard({ data, text }: { data: CompareChoices; text: string }) {
  const { s, act } = useApp();
  const [picked, setPicked] = useState<(string | null)[]>(() => data.courses.map((c) => c.selected));
  const ready = picked.length === 2 && picked.every(Boolean);
  return (
    <div className="rv-wrap">
      <div className="bubble bot">{text}</div>
      {data.courses.map((c, i) => (
        <div key={`${c.name}-${i}`} className="choose">
          <b>{c.name}</b>
          {!c.options.length ? (
            <span className="faint">{c.found ? '이번 학기에 열리지 않아요' : '과목을 찾지 못했어요'}</span>
          ) : (
            <div className="choose-opts">
              {c.options.map((o) => {
                const on = picked[i] === o.lecture_id;
                return (
                  <button
                    key={o.lecture_id}
                    type="button"
                    className={`opt${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => setPicked(picked.map((p, j) => (j === i ? o.lecture_id : p)))}
                  >
                    <span className="opt-name">
                      {o.professor}
                      {o.recommended && <span className="tag tag-green">추천</span>}
                    </span>
                    <span className="faint">{o.times}</span>
                    <span className="faint">
                      {o.rating != null ? `★ ${o.rating}` : '강의평 없음'}
                      {o.match && o.match.total > 0 ? ` · 체크리스트 ${o.match.satisfied}/${o.match.total}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn btn-primary btn-sm"
        style={{ alignSelf: 'flex-start' }}
        disabled={!ready || s.chatBusy}
        onClick={() => act.compareChosen(picked as string[])}
      >
        고른 교수님으로 비교하기
      </button>
    </div>
  );
}

const STATUS: Record<ReviewResult['status'], string> = {
  cached: '강의평',
  collected: '방금 가져온 강의평',
  syllabus: '수강계획서 기준',
  not_collected: '정보 없음'
};

/** 과목 하나의 교수님들을 체크리스트·별점 순위로 보여주고, 분반을 바로 시간표에 넣을 수 있게 한다 */
export function ReviewCards({ data }: { data: OnDemandResponse }) {
  const { act } = useApp();
  return (
    <div className="rv-wrap">
      <div className="bubble bot">{data.message}</div>
      {data.results.length > 0 && (
        <div className="rv-cards">
          {data.results.map((r) => {
            const misses = r.checklist_eval.filter((e) => e.satisfied === false).map((e) => e.label);
            return (
              <div key={r.lecture_id} className={`rv${r.rank === 1 ? ' first' : ''}${r.status === 'not_collected' ? ' na' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`tag ${r.rank === 1 ? 'tag-green' : 'tag-gray'}`}>{r.rank}위</span>
                  <button type="button" className="link-btn" onClick={() => r.in_catalog && act.openDetail(r.lecture_id)} disabled={!r.in_catalog}>
                    <b style={{ fontSize: 13 }}>{r.professor} 교수님</b>
                  </button>
                  {r.rating != null && <span>★ {r.rating}</span>}
                  <span className="tag tag-gray" style={{ marginLeft: 'auto' }}>
                    {STATUS[r.status]}
                  </span>
                </div>
                {r.match.total > 0 && (
                  <div style={{ fontWeight: 700, color: r.match.satisfied === r.match.total ? 'var(--ok)' : 'var(--ink)' }}>
                    체크리스트 {r.match.satisfied}/{r.match.total} 맞음
                    {r.matched && r.matched.length > 0 && <span className="faint" style={{ fontWeight: 400 }}> · {r.matched.join(', ')}</span>}
                  </div>
                )}
                {misses.length > 0 && <span className="faint">안 맞음: {misses.join(', ')}</span>}
                <LevelTags levels={r.levels} />
                {r.summary.length > 0 && <span className="faint">{r.summary.slice(0, 2).join(' · ')}</span>}
                <AddButtons sections={r.sections ?? []} courseId={data.course_id} label={`'${data.course_name}' ${r.professor} 교수님`} />
              </div>
            );
          })}
        </div>
      )}
      {data.more_professors && data.more_professors.length > 0 && <span className="faint">그 밖의 교수님: {data.more_professors.join(', ')}</span>}
    </div>
  );
}
