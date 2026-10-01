import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../api/http';
import type { LectureDetail } from '../api/types';
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

export function LectureModal() {
  const { s, act, api } = useApp();
  const id = s.detail;
  const [data, setData] = useState<LectureDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && act.openDetail(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, act]);

  if (!id) return null;
  const section = s.combos.flatMap((c) => c.sections).find((x) => x.lecture_id === id);
  // 강의 상세 API 는 입학년도를 몰라 기본 이수구분을 준다. 시간표 결과(입학년도별 이수구분)를 먼저 쓴다
  const category = section?.category ?? data?.category;

  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && act.openDetail(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lec-title">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="lec-title" style={{ fontSize: 18, fontWeight: 700 }}>
              {data?.course ?? section?.course ?? '강의 상세'}
              <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--muted)' }}> · {data?.professor ?? section?.professor ?? ''} 교수님</span>
            </div>
            <div className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
              {category && (
                <span className="tag" style={{ background: CATEGORY_COLOR[category].tint, color: CATEGORY_COLOR[category].ink }}>
                  {category}
                </span>
              )}
              <span>{data?.course_id ?? section?.course_id}</span>
              {(data?.credits ?? section?.credits) && <span>· {data?.credits ?? section?.credits}학점</span>}
              {data?.review_count != null && <span>· 수강평 {data.review_count}개 분석</span>}
            </div>
            {section && (
              <div className="sub">{isOnline(section) ? '이러닝 (정해진 강의 시간 없음)' : section.times.map((t) => `${t.day} ${t.start}–${t.end}`).join(', ')}</div>
            )}
          </div>
          <button ref={closeRef} className="icon-btn" aria-label="닫기" onClick={() => act.openDetail(null)}>
            <X />
          </button>
        </div>

        {error && <div className="notice notice-bad">{error}</div>}
        {!data && !error && (
          <div className="notice notice-info" style={{ alignItems: 'center' }}>
            <span className="spinner" />
            AI 요약과 근거를 불러오는 중이에요…
          </div>
        )}

        {data && (
          <>
            <div>
              <h3 style={{ marginBottom: 6 }}>AI 요약</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
                {data.summary.slice(0, 3).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 style={{ marginBottom: 6 }}>수업 성향과 근거</h3>
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
                      style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)' }}
                      loading="lazy"
                    />
                  ))}
                </div>
              ) : (
                <div className="notice notice-info">등록된 수강계획서 이미지가 없어요.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
