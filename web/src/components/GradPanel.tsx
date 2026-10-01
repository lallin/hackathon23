import type { ChangeEvent } from 'react';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_NAME, UNSUPPORTED_MAJOR } from '../lib/constants';
import { useApp } from '../state/store';
import { Check, FileText, Upload } from './icons';
import { Select } from './Select';

export function GradPanel({ className }: { className: string }) {
  const { s, act, current } = useApp();
  const { meta, requirements: req, transcript, reqStatus } = s;
  const unsupported = reqStatus === 'unsupported';
  const blocked = unsupported || reqStatus !== 'ready' || s.uploading;

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) act.upload(f);
  };

  // 성적표를 넣기 전에는 요구 학점까지 모두 0으로 보여준다
  const loaded = !!transcript && !unsupported;
  const rows = CATEGORIES.map((cat) => {
    const info = req?.categories.find((c) => c.category === cat);
    const noMin = !!info?.no_min;
    const need = loaded && !noMin ? (info?.required ?? 0) : 0;
    const done = loaded ? (transcript.summary.find((x) => x.category === cat)?.done ?? 0) : 0;
    return { cat, need, done, noMin };
  });
  const earned = rows.reduce((n, r) => n + r.done, 0);
  // 졸업 총 학점: 서버가 주면 그 값, 없으면(모의 서버) 영역 최소 학점의 합
  const totalNeed = loaded ? (req?.total_required ?? rows.reduce((n, r) => n + r.need, 0)) : 0;
  const remainingMin = rows.reduce((n, r) => n + Math.max(0, r.need - r.done), 0);
  // 영역 최소는 반드시 채워야 하고, 나머지는 네 영역 어디로든 채우는 자유 학점.
  // 성적표를 올릴 때와 같은 입학년도·전공이면 서버가 계산한 값(remaining_total·remaining_free)을 쓴다
  const sameProfile = transcript?.admission_year === s.year && transcript?.major === s.major;
  const serverTotal = loaded && sameProfile ? transcript.remaining_total : undefined;
  const remaining = serverTotal != null ? Math.max(serverTotal, remainingMin) : Math.max(totalNeed - earned, remainingMin);
  // 기타(일반선택·일반교양): 네 영역에 들지 않는 과목. 졸업 요건 막대 없이 이수 학점만 보여준다
  const etcDone = loaded ? transcript.courses.filter((c) => !CATEGORIES.includes(c.category)).reduce((n, c) => n + c.credits, 0) : 0;

  // 이번 조합을 들은 뒤 예상치 (graduation_after · graduation_total_after)
  const plan = loaded ? current : null;
  const semOf = (cat: string) =>
    plan?.graduation_after?.find((g) => g.category === cat)?.this_semester ??
    plan?.sections.filter((x) => x.category === cat).reduce((n, x) => n + x.credits, 0) ??
    0;
  const semTotal = plan ? (plan.graduation_total_after?.this_semester ?? plan.total_credits) : 0;
  const afterMin = rows.reduce((n, r) => n + Math.max(0, r.need - r.done - semOf(r.cat)), 0);
  const afterRemaining = Math.max(totalNeed - earned - semTotal, afterMin);
  const pctOf = (n: number, of: number) => (of ? Math.min(100, (n / of) * 100) : 0);

  const completed = new Set(transcript?.courses.map((c) => c.course_id) ?? []);
  // 서버가 준 우선 배치 과목 배치 여부를 먼저 쓰고, 없으면(모의 서버) 조합 과목으로 계산
  const placed = new Set(
    current?.required_courses ? current.required_courses.filter((c) => c.placed).map((c) => c.course_id) : (current?.sections.map((x) => x.course_id) ?? [])
  );
  // 이번 학기에 열리는 과목을 위로, 미개설 과목은 아래로
  const reqLeft = (req?.required_courses ?? []).filter((c) => !completed.has(c.course_id)).sort((a, b) => Number(b.offered !== false) - Number(a.offered !== false));

  return (
    <section className={`card ${className}`} aria-labelledby="h-grad">
      <h2 id="h-grad">졸업 요건</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 8fr)', gap: 10 }}>
        <div>
          <label htmlFor="sel-year" className="sub" style={{ display: 'block', marginBottom: 4 }}>
            입학년도
          </label>
          <Select
            id="sel-year"
            value={String(s.year)}
            onChange={(v) => act.setProfile(Number(v), s.major)}
            options={(meta?.admission_years ?? []).map((y) => ({ value: String(y.year), label: `${y.year}년` }))}
          />
        </div>
        <div>
          <label htmlFor="sel-major" className="sub" style={{ display: 'block', marginBottom: 4 }}>
            전공
          </label>
          <Select id="sel-major" value={s.major} onChange={(v) => act.setProfile(s.year, v)} options={(meta?.majors ?? []).map((m) => ({ value: m.id, label: m.name }))} />
        </div>
      </div>

      {unsupported && (
        <div className="notice notice-warn" role="status">
          {UNSUPPORTED_MAJOR}
        </div>
      )}
      {reqStatus === 'error' && <div className="notice notice-bad">졸업 기준을 불러오지 못했어요. 입학년도나 전공을 다시 골라 주세요.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label className={`upl${blocked ? ' disabled' : ''}`} htmlFor="up-file" aria-disabled={blocked}>
          <input
            id="up-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={onFile}
            disabled={blocked}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          />
          <span
            style={{
              flex: 'none',
              width: 34,
              height: 34,
              borderRadius: 99,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: transcript ? 'var(--green)' : 'var(--green-tint)',
              color: transcript ? '#fff' : 'var(--green)'
            }}
          >
            {s.uploading ? <span className="spinner" /> : transcript ? <Check size={17} stroke={2.4} /> : <Upload size={17} />}
          </span>
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {(s.uploading || !transcript) && (
              <span style={{ fontSize: 13, fontWeight: 700 }}>{s.uploading ? '성적표를 읽는 중이에요…' : '성적표 PDF 업로드'}</span>
            )}
            <span style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--muted)' }}>
              {s.uploading
                ? 'AI가 과목명·학수번호·이수구분·학점·성적을 뽑고 있어요 (F·NP 제외)'
                : transcript
                  ? '눌러서 다른 성적표 올리기 · 파일은 저장하지 않아요'
                  : '학사정보 → 성적 → 전체성적조회 → 출력 → PDF로 저장'}
            </span>
          </span>
        </label>
        {!transcript && (
          <button className="btn btn-sm" onClick={act.sample} disabled={blocked} style={{ alignSelf: 'flex-start' }}>
            <FileText size={14} />
            샘플 성적표로 시작
          </button>
        )}
        {s.uploadError && (
          <div className="notice notice-bad" role="alert">
            {s.uploadError}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--green)', lineHeight: 1 }}>
          {req ? remaining : '–'}
        </span>
        <span style={{ fontSize: 14 }}>학점 남음</span>
        <span className="sub" style={{ marginLeft: 'auto' }}>
          {req ? `이수 ${earned} / 졸업 ${totalNeed}` : ''}
        </span>
      </div>

      {plan && totalNeed > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div
            className="bar stack"
            role="progressbar"
            aria-label="졸업 총 학점 이수율"
            aria-valuenow={Math.round(pctOf(earned, totalNeed))}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ height: 9 }}
          >
            <div style={{ width: `${pctOf(earned, totalNeed)}%`, background: 'var(--green)' }} />
            <div className="sem" style={{ width: `${Math.min(pctOf(semTotal, totalNeed), 100 - pctOf(earned, totalNeed))}%`, background: 'var(--green)' }} />
          </div>
          <div className="sub" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '2px 8px' }}>
            <span>
              이번 시간표를 들으면 <b style={{ color: 'var(--ink)' }}>{afterRemaining}학점</b> 남아요
            </span>
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i className="legend" style={{ background: 'var(--green)' }} />
                이수
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i className="legend sem" style={{ background: 'var(--green)' }} />
                이번 학기 +{semTotal}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* 세 묶음(남은 학점 / 영역별 학점 / 졸업 필수 과목) 사이 가로선. 시간표 조건과 체크리스트 사이 선과 같은 모양 */}
      <div aria-hidden="true" className="divider" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map((r) => {
          const pct = r.need ? Math.min(100, Math.round((r.done / r.need) * 100)) : 0;
          const sem = plan ? semOf(r.cat) : 0;
          const left = Math.max(0, r.need - r.done);
          const color = CATEGORY_COLOR[r.cat];
          // 교양선택은 막대를 그리지 않는다
          const showBar = r.cat !== '교선' && !r.noMin;
          return (
            <div key={r.cat} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div className="grad-row">
                <span className="grad-name">{CATEGORY_NAME[r.cat]}</span>
                <span className="grad-num">
                  {!req ? '–' : r.noMin ? <><b>{r.done}</b>학점</> : <><b>{r.done}</b> / {r.need}학점</>}
                </span>
                <span className="grad-tags">
                  {sem > 0 && (
                    <span className="tag" style={{ background: color.tint, color: color.ink }} title="이번 시간표에서 듣는 학점">
                      +{sem} 이번 학기
                    </span>
                  )}
                  {req && !r.noMin && (left > 0 ? <span className="grad-left">{left} 남음</span> : <span className="grad-done">완료</span>)}
                </span>
              </div>
              {showBar && (
                <div className="bar stack" role="progressbar" aria-label={`${CATEGORY_NAME[r.cat]} 이수율`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${pct}%`, background: color.main }} />
                  {sem > 0 && <div className="sem" style={{ width: `${Math.min(pctOf(sem, r.need), 100 - pct)}%`, background: color.main }} />}
                </div>
              )}
            </div>
          );
        })}
        <div className="grad-row">
          <span className="grad-name">기타(일선/일교)</span>
          <span className="grad-num">{req ? <><b>{etcDone}</b>학점</> : '–'}</span>
          <span className="grad-tags" />
        </div>
      </div>

      {req && <div aria-hidden="true" className="divider" />}

      {req && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>졸업 필수 과목</h3>
            <span className="sub">{transcript ? `배치 ${reqLeft.filter((c) => placed.has(c.course_id)).length}` : '성적표를 올리면 남은 필수 과목이 나와요'}</span>
          </div>
          {transcript &&
            reqLeft.map((c) => {
              const on = placed.has(c.course_id);
              const off = c.offered === false;
              const cc = c.category ? CATEGORY_COLOR[c.category] : null;
              return (
                <div key={c.course_id} className="req-row" style={off ? { background: 'var(--panel)' } : undefined}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: off ? 'var(--muted)' : undefined }}>{c.name}</div>
                    <div className="sub" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {/* 이수구분은 졸업 요건 막대와 같은 색의 둥근 칩으로 */}
                      {c.category && cc && (
                        <span className="tag" style={{ background: cc.main, color: '#fff' }}>
                          {c.category}
                        </span>
                      )}
                      {c.credits != null && <span>{c.credits}학점</span>}
                      {c.name === c.course_id ? null : <span className="faint">{c.course_id}</span>}
                    </div>
                  </div>
                  {off ? (
                    <span className="tag tag-gray" style={{ padding: '4px 10px' }} title="이번 학기에 개설되지 않아 시간표에 넣을 수 없어요">
                      이번 학기 미개설
                    </span>
                  ) : (
                    <span
                      className="tag"
                      style={{ padding: '4px 10px', border: `1px solid ${on ? 'var(--green)' : '#9CCBB3'}`, background: on ? 'var(--green)' : '#fff', color: on ? '#fff' : '#2E7D57' }}
                    >
                      {on ? '배치됨' : '미배치'}
                    </span>
                  )}
                </div>
              );
            })}
          {transcript && reqLeft.length === 0 && <div className="notice notice-ok">남은 필수 과목이 없어요.</div>}
        </div>
      )}
    </section>
  );
}
