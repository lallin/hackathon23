import type { SectionInfo } from '../api/types';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_NAME } from '../lib/constants';
import { useApp } from '../state/store';
import { Copy, Pin } from './icons';

const fmtTimes = (x: SectionInfo) => x.times.map((t) => `${t.day} ${t.start}–${t.end}`).join(', ');
const secNo = (x: SectionInfo) => x.section_id.slice(x.course_id.length).replace(/^-/, '') || x.section_id;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 클립보드 API 를 못 쓰는 환경 (http 등)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function ListPanel({ className }: { className: string }) {
  const { s, act, current } = useApp();
  const sections = current?.sections ?? [];

  const copy = async () => {
    const text = sections.map((x) => `${x.course_id}\t${secNo(x)}\t${x.course}\t${x.professor}`).join('\n');
    const ok = await copyText(text);
    act.toast(ok ? `학수번호 ${sections.length}개를 복사했어요. 수강신청 장바구니에 붙여 넣으세요.` : '복사하지 못했어요. 직접 골라 복사해 주세요.');
  };

  return (
    <section className={`card ${className}`} aria-labelledby="h-list">
      <div className="card-h">
        <h2 id="h-list">이번 조합 과목</h2>
        <span className="sub">{current ? `${sections.length}과목 · ${current.total_credits}학점` : ''}</span>
      </div>

      <div className="scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!current && <div className="notice notice-info">시간표를 만들면 과목이 이수구분별로 정리돼요.</div>}
        {CATEGORIES.map((cat) => {
          const group = sections.filter((x) => x.category === cat);
          if (!group.length) return null;
          return (
            <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div className="grp-h">
                <span className="grp-dot" style={{ background: CATEGORY_COLOR[cat].main }} />
                {CATEGORY_NAME[cat]}
                <span className="faint" style={{ fontWeight: 400 }}>
                  {group.reduce((n, x) => n + x.credits, 0)}학점
                </span>
              </div>
              {group.map((x) => {
                const pinned = s.draft.pinned.includes(x.section_id);
                const excluded = s.draft.excluded.includes(x.course_id);
                return (
                  <button key={x.section_id} className="course-card" onClick={() => act.openDetail(x.lecture_id)} style={excluded ? { opacity: 0.5 } : undefined}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{x.course}</span>
                      <span className="tag" style={{ background: CATEGORY_COLOR[x.category].tint, color: CATEGORY_COLOR[x.category].ink }}>
                        {x.category}
                      </span>
                      {x.is_required && <span className="tag tag-dark">필수</span>}
                      {pinned && (
                        <span className="tag tag-line">
                          <Pin size={10} stroke={2.4} />
                          고정
                        </span>
                      )}
                      {excluded && <span className="tag tag-bad">제한</span>}
                    </div>
                    <div className="sub">{`${x.course_id} · ${secNo(x)}분반 · ${x.professor} · ${x.credits}학점`}</div>
                    <div className="sub">{fmtTimes(x)}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <button className="btn" onClick={copy} disabled={!current}>
        <Copy size={15} />
        학수번호 복사
      </button>
    </section>
  );
}
