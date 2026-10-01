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

  const doneOf = (cat: string) => (transcript && !unsupported ? (transcript.summary.find((x) => x.category === cat)?.done ?? 0) : 0);
  const rows = CATEGORIES.map((cat) => {
    const need = req?.categories.find((c) => c.category === cat)?.required ?? 0;
    const done = doneOf(cat);
    return { cat, need, done };
  });
  const totalNeed = rows.reduce((n, r) => n + r.need, 0);
  const totalDone = rows.reduce((n, r) => n + Math.min(r.done, r.need), 0);
  const earned = rows.reduce((n, r) => n + r.done, 0);

  const completed = new Set(transcript?.courses.map((c) => c.course_id) ?? []);
  // 서버가 준 우선 배치 과목 배치 여부를 먼저 쓰고, 없으면(모의 서버) 조합 과목으로 계산
  const placed = new Set(
    current?.required_courses ? current.required_courses.filter((c) => c.placed).map((c) => c.course_id) : (current?.sections.map((x) => x.course_id) ?? [])
  );
  const reqLeft = (req?.required_courses ?? []).filter((c) => !completed.has(c.course_id));

  return (
    <section className={`card scroll ${className}`} aria-labelledby="h-grad">
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
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {s.uploading ? '성적표를 읽는 중이에요…' : transcript ? `인식된 과목 ${transcript.recognized_count}개` : '성적표 PDF 업로드'}
            </span>
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
          {req ? Math.max(0, totalNeed - totalDone) : '–'}
        </span>
        <span style={{ fontSize: 14 }}>학점 남음</span>
        <span className="sub" style={{ marginLeft: 'auto' }}>
          {req ? `이수 ${earned} / 졸업 ${totalNeed}` : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((r) => {
          const pct = r.need ? Math.min(100, Math.round((r.done / r.need) * 100)) : 0;
          return (
            <div key={r.cat}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>{CATEGORY_NAME[r.cat]}</span>
                <span className="faint" style={{ color: 'var(--muted)' }}>
                  {req ? `${r.done}/${r.need}학점 · ${Math.max(0, r.need - r.done)} 남음` : '–'}
                </span>
              </div>
              <div className="bar" role="progressbar" aria-label={`${CATEGORY_NAME[r.cat]} 이수율`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${pct}%`, background: CATEGORY_COLOR[r.cat].main }} />
              </div>
            </div>
          );
        })}
      </div>

      {req && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>우선 배치 과목</h3>
            <span className="sub">
              {transcript ? `남은 필수 ${reqLeft.length}과목 · 배치 ${reqLeft.filter((c) => placed.has(c.course_id)).length}` : '성적표를 올리면 남은 필수 과목이 나와요'}
            </span>
          </div>
          {transcript &&
            reqLeft.map((c) => {
              const on = placed.has(c.course_id);
              return (
                <div key={c.course_id} className="req-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                    <div className="sub">{`${c.category} · ${c.credits}학점 · ${c.course_id}`}</div>
                  </div>
                  <span
                    className="tag"
                    style={{ padding: '4px 10px', border: `1px solid ${on ? 'var(--green)' : '#9CCBB3'}`, background: on ? 'var(--green)' : '#fff', color: on ? '#fff' : '#2E7D57' }}
                  >
                    {on ? '배치됨' : '미배치'}
                  </span>
                </div>
              );
            })}
          {transcript && reqLeft.length === 0 && <div className="notice notice-ok">남은 필수 과목이 없어요.</div>}
        </div>
      )}
    </section>
  );
}
