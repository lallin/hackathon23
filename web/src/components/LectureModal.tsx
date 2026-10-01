import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../api/http';
import type { LectureDetail, TimeSlot } from '../api/types';
import { BASE_ITEMS, CATEGORY_COLOR, isOnline, levelFromNum, LEVEL_LABEL } from '../lib/constants';
import { useApp } from '../state/store';
import { X } from './icons';

function Dots({ n }: { n: number }) {
  return (
    <span className="dots" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? 'on' : ''} />
      ))}
    </span>
  );
}

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

/** 별점 0~5 를 별 아이콘 다섯 개로 (소수점은 별 일부만 채움) */
function Stars({ value }: { value: number }) {
  return (
    <span className="stars" role="img" aria-label={`별점 5점 만점에 ${value}점`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="star">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={STAR} className="star-empty" />
            </svg>
            <span className="star-fill" style={{ width: `${fill * 100}%` }}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={STAR} />
              </svg>
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** 요약 줄 중 "별점 4.51/5 (강의평 146개)" 를 찾아 별점으로 따로 보여준다 */
function splitRating(summary: string[]): { rating: number | null; reviews: number | null; rest: string[] } {
  let rating: number | null = null;
  let reviews: number | null = null;
  const rest: string[] = [];
  summary.forEach((line) => {
    const m = line.match(/별점\s*([\d.]+)\s*\/\s*5(?:\s*\(\s*강의평\s*(\d+)\s*개\s*\))?/);
    if (m && rating === null) {
      rating = Number(m[1]);
      reviews = m[2] ? Number(m[2]) : null;
      const left = line.replace(m[0], '').replace(/^[\s,·]+|[\s,·]+$/g, '');
      if (left) rest.push(left);
    } else rest.push(line);
  });
  return { rating, reviews, rest };
}

const fmtTimes = (times: TimeSlot[]) => times.map((t) => `${t.day} ${t.start}–${t.end}`).join(', ');

export function LectureModal() {
  const { s, act, api, current } = useApp();
  const id = s.detail;
  const [data, setData] = useState<LectureDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    act.openDetail(null);
    act.select(null);
  };

  useEffect(() => {
    if (!id || !api) return;
    let alive = true;
    setData(null);
    setError(null);
    api
      .lecture(id)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message || '강의 정보를 불러오지 못했어요'));
    return () => {
      alive = false;
    };
  }, [id, api]);

  useEffect(() => {
    if (!id) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        act.openDetail(null);
        act.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, act]);

  if (!id) return null;
  // 지금 보고 있는 조합의 분반을 먼저, 없으면 다른 순위 조합에서 찾는다
  const inCurrent = current?.sections.find((x) => x.lecture_id === id) ?? null;
  const section = inCurrent ?? s.combos.flatMap((c) => c.sections).find((x) => x.lecture_id === id) ?? null;
  // 강의 상세 API 는 입학년도를 몰라 기본 이수구분을 준다. 시간표 결과(입학년도별 이수구분)를 먼저 쓴다
  const category = section?.category ?? data?.category;
  const courseId = section?.course_id ?? data?.course_id ?? '';
  const sectionId = section?.section_id ?? data?.sections?.[0]?.section_id ?? '';
  // 과목번호(분반 번호): section_id 에서 학수번호를 뺀 뒷부분 (예: NDGE11863-8217 → 8217)
  const courseNo = sectionId && courseId && sectionId.startsWith(courseId) ? sectionId.slice(courseId.length).replace(/^-/, '') : '';
  const times = section?.times ?? data?.sections?.[0]?.times ?? [];
  const credits = section?.credits ?? data?.credits;
  const { rating, reviews, rest } = splitRating(data?.summary ?? []);
  const reviewCount = reviews ?? data?.review_count ?? null;


  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lec-title">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div id="lec-title" style={{ fontSize: 18, fontWeight: 700 }}>
              {data?.course ?? section?.course ?? '강의 상세'}
              <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--muted)' }}> · {data?.professor ?? section?.professor ?? ''} 교수님</span>
            </div>
            <div className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {category && (
                <span className="tag" style={{ background: CATEGORY_COLOR[category].tint, color: CATEGORY_COLOR[category].ink }}>
                  {category}
                </span>
              )}
              <span>{courseId}</span>
              {courseNo && <span>· {courseNo}</span>}
              {credits != null && <span>· {credits}학점</span>}
              {section && isOnline(section) ? <span>· 이러닝 (정해진 강의 시간 없음)</span> : times.length > 0 && <span>· {fmtTimes(times)}</span>}
            </div>
          </div>
          <button ref={closeRef} className="icon-btn" aria-label="닫기" onClick={close}>
            <X />
          </button>
        </div>

        {error && <div className="notice notice-bad">{error}</div>}
        {!data && !error && (
          <div className="notice notice-info" style={{ alignItems: 'center' }}>
            <span className="spinner" />
            강의평 분석을 불러오는 중이에요…
          </div>
        )}

        {data && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3>강의평 한눈에 보기</h3>
              {rating !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Stars value={rating} />
                  <b style={{ fontSize: 16 }}>{rating.toFixed(2)}</b>
                  <span className="sub">/ 5{reviewCount ? ` · 강의평 ${reviewCount}개` : ''}</span>
                </div>
              )}
              {rest.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
                  {rest.slice(0, 3).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
              <div className="lv-grid">
                {BASE_ITEMS.map((b) => {
                  const v = data.levels[b.key];
                  const ev = data.evidence[b.key] ?? [];
                  return (
                    <div key={b.key} className="lv-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <b style={{ fontSize: 13 }}>{b.label}</b>
                        {v != null ? (
                          <>
                            <Dots n={v} />
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{LEVEL_LABEL[levelFromNum(v)]}</span>
                          </>
                        ) : (
                          <span className="gray-text" style={{ fontSize: 12 }}>
                            정보 없음
                          </span>
                        )}
                      </div>
                      {ev.length > 0 && (
                        <ul>
                          {ev.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 style={{ marginBottom: 6 }}>수강계획서</h3>
              {data.syllabus_images.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.syllabus_images.map((src, i) => (
                    <img
                      key={src}
                      src={src.startsWith('/') ? `${API_BASE}${src}` : src}
                      alt={`${data.course} 수강계획서 ${i + 1}쪽`}
                      style={{ width: '100%', border: '1px solid var(--line)' }}
                      loading="lazy"
                    />
                  ))}
                </div>
              ) : (
                <div className="notice notice-info">수강계획서 PDF 준비 중</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
