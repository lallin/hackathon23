/**
 * 모의 서버의 시간표 생성기와 체크리스트 평가.
 * 문서의 "시간표 생성 알고리즘" · "충족 판정" 규칙을 그대로 따른다.
 */
import type {
  Category,
  ChecklistEval,
  ChecklistItem,
  Combination,
  Day,
  GenerateRequest,
  GenerateResponse,
  LevelValue,
  SectionInfo
} from '../api/types';
import { BASE_ITEMS, CATEGORIES, DAYS, LEVEL_LABEL, LEVEL_NUM, toMin } from '../lib/constants';
import { baseLevels, CATALOG, customLevel, customToggle, lectureId, requirementsFor } from './data';
import type { CatalogCourse, CatalogSection } from './data';

const BASE_KEYS = new Set(BASE_ITEMS.map((b) => b.key));

interface Pick {
  course: CatalogCourse;
  section: CatalogSection;
}

const lidOf = (p: Pick) => lectureId(p.course.course_id, p.section.professor);

function clash(a: CatalogSection, b: CatalogSection): boolean {
  return a.times.some((x) => b.times.some((y) => x.day === y.day && toMin(x.start) < toMin(y.end) && toMin(y.start) < toMin(x.end)));
}

/** 1교시(9시 시작) 수업 횟수 */
const firstPeriodCount = (picks: Pick[]) => picks.reduce((n, p) => n + p.section.times.filter((t) => toMin(t.start) <= 9 * 60).length, 0);

/** 같은 날 수업 사이 2시간 이상 빈 횟수 */
function longGapCount(picks: Pick[]): number {
  let n = 0;
  DAYS.forEach((d) => {
    const ts = picks
      .flatMap((p) => p.section.times.filter((t) => t.day === d))
      .map((t) => [toMin(t.start), toMin(t.end)])
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ts.length; i++) if (ts[i][0] - ts[i - 1][1] >= 120) n++;
  });
  return n;
}

function gapMinutes(picks: Pick[]): number {
  let n = 0;
  DAYS.forEach((d) => {
    const ts = picks
      .flatMap((p) => p.section.times.filter((t) => t.day === d))
      .map((t) => [toMin(t.start), toMin(t.end)])
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ts.length; i++) n += Math.max(0, ts[i][0] - ts[i - 1][1]);
  });
  return n;
}

const daysUsed = (picks: Pick[]): Day[] => DAYS.filter((d) => picks.some((p) => p.section.times.some((t) => t.day === d)));

const shapeLevel = (key: string, count: number): LevelValue =>
  key === 'first_period' ? (count <= 1 ? 'low' : count <= 3 ? 'mid' : 'high') : count === 0 ? 'low' : count <= 2 ? 'mid' : 'high';

const avgLevel = (avg: number): LevelValue => (avg < 1.7 ? 'low' : avg <= 2.3 ? 'mid' : 'high');

/** 강의 하나의 항목 값 (level 이면 1~3, toggle 이면 yes/no, 모르면 null) */
export function lectureValue(lid: string, item: { key: string; type: ChecklistItem['type'] }): number | 'yes' | 'no' | null {
  if (item.type === 'toggle') return customToggle(lid, item.key);
  if (BASE_KEYS.has(item.key)) return baseLevels(lid)[item.key];
  return customLevel(lid, item.key);
}

export function evaluate(item: ChecklistItem, picks: Pick[]): ChecklistEval {
  if (item.key === 'first_period' || item.key === 'gap') {
    const count = item.key === 'first_period' ? firstPeriodCount(picks) : longGapCount(picks);
    const lv = shapeLevel(item.key, count);
    return {
      ...item,
      satisfied: item.enabled ? lv === item.level : null,
      dist: { count },
      avg: null,
      text: `${item.key === 'first_period' ? '1교시 수업' : '우주공강'} 주 ${count}회 (${LEVEL_LABEL[lv]})`
    };
  }
  if (item.type === 'toggle') {
    let yes = 0;
    let no = 0;
    let unknown = 0;
    picks.forEach((p) => {
      const v = lectureValue(lidOf(p), item);
      if (v === 'yes') yes++;
      else if (v === 'no') no++;
      else unknown++;
    });
    const judged = yes + no > 0;
    return {
      ...item,
      satisfied: !item.enabled ? null : judged ? no === 0 && yes >= 1 : null,
      dist: { yes, no, unknown },
      avg: null,
      text: judged ? `맞음 ${yes} · 반대 ${no} · 정보 없음 ${unknown}과목` : `판단 불가 · 정보 없음 ${unknown}과목`
    };
  }
  const dist = { low: 0, mid: 0, high: 0, unknown: 0 };
  let sum = 0;
  let n = 0;
  picks.forEach((p) => {
    const v = lectureValue(lidOf(p), item);
    if (typeof v !== 'number') {
      dist.unknown++;
      return;
    }
    sum += v;
    n++;
    if (v === 1) dist.low++;
    else if (v === 2) dist.mid++;
    else dist.high++;
  });
  if (!n) return { ...item, satisfied: null, dist, avg: null, text: `판단 불가 · 정보 없음 ${dist.unknown}과목` };
  const avg = Math.round((sum / n) * 10) / 10;
  return {
    ...item,
    satisfied: item.enabled && item.level ? avgLevel(avg) === item.level : null,
    dist,
    avg,
    text: `적음 ${dist.low} · 보통 ${dist.mid} · 많음 ${dist.high}과목 (평균 ${avg.toFixed(1)}/3)${dist.unknown ? ` · 정보 없음 ${dist.unknown}과목` : ''}`
  };
}

interface Ctx {
  req: GenerateRequest;
  requiredIds: Set<string>;
  need: Record<Category, number>;
  required: Record<Category, number>;
  checks: ChecklistItem[];
}

function sectionScore(p: Pick, ctx: Ctx): number {
  const { course, section } = p;
  const grad = ctx.req.conditions.style === 'graduation' ? 1.6 : 1;
  let w = 0;
  if (ctx.requiredIds.has(course.course_id)) w += 30 * grad;
  const r = ctx.required[course.category] || 1;
  w += (ctx.need[course.category] / r) * 10 * grad * (course.credits / 3);
  // 모의 데이터에서 이러닝 줄(시간 없는 분반)이 조합에 들어오는 걸 확인할 수 있게 조금 가산
  if (!section.times.length) w += 12;
  section.times.forEach((t) => {
    const am = toMin(t.start) < 12 * 60;
    if (ctx.req.conditions.preferred_time === 'morning') w += am ? 2 : -2;
    if (ctx.req.conditions.preferred_time === 'afternoon') w += am ? -2 : 2;
  });
  const lid = lidOf(p);
  ctx.checks.forEach((c) => {
    if (c.key === 'first_period' || c.key === 'gap') return;
    const v = lectureValue(lid, c);
    if (c.type === 'toggle') w += v === 'yes' ? 3 : v === 'no' ? -5 : 0;
    else if (typeof v === 'number' && c.level) w -= Math.abs(v - LEVEL_NUM[c.level]) * 4;
  });
  return w;
}

function comboScore(picks: Pick[], credits: number, base: number, ctx: Ctx): number {
  const { conditions } = ctx.req;
  let s = base - (conditions.target_credits - credits) * 5;
  ctx.checks.forEach((c) => {
    if (c.key !== 'first_period' && c.key !== 'gap') return;
    const count = c.key === 'first_period' ? firstPeriodCount(picks) : longGapCount(picks);
    if (c.level) s -= Math.abs(LEVEL_NUM[shapeLevel(c.key, count)] - LEVEL_NUM[c.level]) * 6;
  });
  switch (conditions.style) {
    case 'late_riser':
      s -= firstPeriodCount(picks) * 6;
      break;
    case 'club':
      s -= picks.reduce((n, p) => n + p.section.times.filter((t) => toMin(t.end) > 16 * 60).length, 0) * 4;
      break;
    case 'career':
      s -= gapMinutes(picks) / 30;
      break;
    case 'commute':
      s -= daysUsed(picks).length * 8;
      break;
    default:
      break;
  }
  return Math.round(s * 10) / 10;
}

interface Found {
  picks: Pick[];
  credits: number;
  score: number;
  sig: string;
}

const NODE_LIMIT = 250000;

/** 조건을 만족하는 조합 전부(상한 있음)를 점수순으로 */
function search(ctx: Ctx, override?: Partial<GenerateRequest['conditions']> & { pinned?: string[]; excluded?: string[] }): Found[] {
  const req = ctx.req;
  const cond = { ...req.conditions, ...override };
  const pinned = override?.pinned ?? req.pinned_section_ids;
  const excluded = new Set(override?.excluded ?? req.excluded_course_ids);
  const completed = new Set(req.completed_course_ids);
  const pinOf: Record<string, string> = {};
  pinned.forEach((sid) => {
    const c = CATALOG.find((x) => x.sections.some((s) => s.section_id === sid));
    if (c) pinOf[c.course_id] = sid;
  });

  const pool = CATALOG.filter((c) => (c.dept === req.major || c.dept === 'all') && !completed.has(c.course_id) && (!excluded.has(c.course_id) || pinOf[c.course_id]))
    .map((c) => ({ c, pri: (pinOf[c.course_id] ? 1000 : 0) + Math.max(...c.sections.map((s) => sectionScore({ course: c, section: s }, ctx))) }))
    .sort((a, b) => b.pri - a.pri || a.c.course_id.localeCompare(b.c.course_id))
    .slice(0, 16)
    .map((x) => x.c);

  const out: Found[] = [];
  const picked: Pick[] = [];
  let nodes = 0;
  const min = cond.target_credits - 2;
  const max = cond.target_credits;

  const rec = (i: number, credits: number, score: number) => {
    if (++nodes > NODE_LIMIT) return;
    if (credits >= min && i === pool.length) {
      const picks = picked.slice();
      out.push({ picks, credits, score: comboScore(picks, credits, score, ctx), sig: picks.map((p) => p.section.section_id).sort().join() });
      return;
    }
    if (i === pool.length) return;
    const c = pool[i];
    const pin = pinOf[c.course_id];
    for (const s of c.sections) {
      if (pin && s.section_id !== pin) continue;
      if (s.times.some((t) => cond.free_days.includes(t.day))) continue;
      if (credits + c.credits > max) continue;
      if (picked.some((p) => clash(p.section, s))) continue;
      const p = { course: c, section: s };
      picked.push(p);
      rec(i + 1, credits + c.credits, score + sectionScore(p, ctx));
      picked.pop();
    }
    if (!pin) rec(i + 1, credits, score);
  };
  rec(0, 0, 0);
  return out.sort((a, b) => b.score - a.score || a.sig.localeCompare(b.sig));
}

/** 앞서 고른 조합과 2과목 이상 다른 것만 골라 상위 5개 */
function pickDiverse(all: Found[], n = 5): Found[] {
  const chosen: Found[] = [];
  for (const f of all) {
    const ids = new Set(f.picks.map((p) => p.course.course_id));
    const ok = chosen.every((c) => {
      const other = new Set(c.picks.map((p) => p.course.course_id));
      const a = [...ids].filter((x) => !other.has(x)).length;
      const b = [...other].filter((x) => !ids.has(x)).length;
      return Math.max(a, b) >= 2;
    });
    if (ok) chosen.push(f);
    if (chosen.length === n) break;
  }
  return chosen;
}

function reasonFor(f: Found, ctx: Ctx): string {
  const req = f.picks.filter((p) => ctx.requiredIds.has(p.course.course_id));
  const byCat: Partial<Record<Category, number>> = {};
  req.forEach((p) => (byCat[p.course.category] = (byCat[p.course.category] ?? 0) + 1));
  const parts = CATEGORIES.filter((c) => byCat[c]).map((c) => `${c} ${byCat[c]}과목`);
  const head = parts.length ? `남은 ${parts.join('·')}을 넣고` : `${f.credits}학점을 채우고`;
  const free = DAYS.filter((d) => !daysUsed(f.picks).includes(d));
  const style = ctx.req.conditions.style;
  const tail = free.length
    ? `${free.join('·')}요일을 비웠어요.`
    : style === 'late_riser'
      ? `9시 수업을 ${firstPeriodCount(f.picks)}번으로 줄였어요.`
      : style === 'commute'
        ? `등교 일수를 ${daysUsed(f.picks).length}일로 맞췄어요.`
        : `목표 ${ctx.req.conditions.target_credits}학점에 맞췄어요.`;
  return `${head} ${tail}`;
}

function toCombination(f: Found, rank: number, ctx: Ctx, pinnedIds: Set<string>): Combination {
  const evals = ctx.req.checklist.map((c) => evaluate(c, f.picks));
  const enabled = evals.filter((e) => e.enabled);
  const sections: SectionInfo[] = f.picks
    .map((p) => ({
      section_id: p.section.section_id,
      lecture_id: lidOf(p),
      course_id: p.course.course_id,
      course: p.course.name,
      professor: p.section.professor,
      category: p.course.category,
      is_required: ctx.requiredIds.has(p.course.course_id),
      credits: p.course.credits,
      pinned: pinnedIds.has(p.section.section_id),
      times: p.section.times
    }))
    .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.course_id.localeCompare(b.course_id));
  return {
    rank,
    score: f.score,
    total_credits: f.credits,
    sections,
    checklist_eval: evals,
    satisfied_count: enabled.filter((e) => e.satisfied).length,
    enabled_count: enabled.length,
    days_used: daysUsed(f.picks),
    graduation_after: CATEGORIES.map((cat) => ({
      category: cat,
      done: ctx.required[cat] - ctx.need[cat],
      this_semester: f.picks.filter((p) => p.course.category === cat).reduce((n, p) => n + p.course.credits, 0),
      required: ctx.required[cat]
    })),
    reason: rank === 1 ? reasonFor(f, ctx) : null
  };
}

export function generate(req: GenerateRequest, completedByCat: Record<Category, number>): GenerateResponse {
  const r = requirementsFor(req.admission_year, req.major);
  if (!r) return { combinations: [], infeasible: { message: '아직 준비 중인 학과예요.', suggestions: [] }, warnings: [] };
  const completed = new Set(req.completed_course_ids);
  const required = {} as Record<Category, number>;
  const need = {} as Record<Category, number>;
  r.categories.forEach((c) => {
    required[c.category] = c.required;
    need[c.category] = Math.max(0, c.required - (completedByCat[c.category] ?? 0));
  });
  const ctx: Ctx = {
    req,
    requiredIds: new Set(r.required_courses.map((c) => c.course_id).filter((id) => !completed.has(id))),
    need,
    required,
    checks: req.checklist.filter((c) => c.enabled)
  };
  const warnings: string[] = [];
  const pinnedIds = new Set(req.pinned_section_ids);

  // 1) 고정 분반끼리 겹침 · 고정 분반과 공강 요일 충돌을 먼저 본다
  const pinned = req.pinned_section_ids
    .map((sid) => {
      const course = CATALOG.find((c) => c.sections.some((s) => s.section_id === sid));
      const section = course?.sections.find((s) => s.section_id === sid);
      return course && section ? { course, section } : null;
    })
    .filter((x): x is Pick => !!x);
  for (let i = 0; i < pinned.length; i++) {
    for (let j = i + 1; j < pinned.length; j++) {
      if (clash(pinned[i].section, pinned[j].section)) {
        return {
          combinations: [],
          infeasible: {
            message: `고정한 '${pinned[i].course.name}'와 '${pinned[j].course.name}'의 시간이 겹쳐요.`,
            suggestions: [{ text: `'${pinned[j].course.name}' 고정 풀기`, found: 5 }]
          },
          warnings
        };
      }
    }
    const hit = pinned[i].section.times.find((t) => req.conditions.free_days.includes(t.day));
    if (hit) {
      return {
        combinations: [],
        infeasible: {
          message: `고정한 '${pinned[i].course.name}'가 ${hit.day}요일에 있어 ${hit.day}요일 공강과 겹쳐요.`,
          suggestions: [
            { text: `공강 요일에서 ${hit.day}요일 빼기`, found: 5 },
            { text: `'${pinned[i].course.name}' 고정 풀기`, found: 5 }
          ]
        },
        warnings
      };
    }
  }

  const all = search(ctx);
  const top = pickDiverse(all);
  if (top.length) {
    return { combinations: top.map((f, i) => toCombination(f, i + 1, ctx, pinnedIds)), infeasible: null, warnings };
  }

  // 2) 조건을 하나씩 풀어 다시 찾고, 실제로 조합이 생기는 방법만 제안한다
  const suggestions: { text: string; found: number }[] = [];
  const tryWith = (text: string, o: Parameters<typeof search>[1]) => {
    const n = pickDiverse(search(ctx, o)).length;
    if (n) suggestions.push({ text, found: n });
  };
  req.conditions.free_days.forEach((d) => tryWith(`공강 요일에서 ${d}요일 빼기`, { free_days: req.conditions.free_days.filter((x) => x !== d) }));
  if (req.conditions.target_credits > 1) tryWith(`목표 학점을 ${Math.max(1, req.conditions.target_credits - 3)}학점으로 낮추기`, { target_credits: Math.max(1, req.conditions.target_credits - 3) });
  if (req.conditions.free_days.length > 1) tryWith('공강 요일 모두 풀기', { free_days: [] });
  if (req.excluded_course_ids.length) tryWith('제한한 과목 모두 풀기', { excluded: [] });
  if (req.pinned_section_ids.length) tryWith('고정한 분반 모두 풀기', { pinned: [] });
  return {
    combinations: [],
    infeasible: {
      message: suggestions.length ? '조건에 맞는 시간표가 없어요. 아래처럼 바꾸면 조합이 생겨요.' : '조건에 맞는 시간표가 없어요. 공강 요일이나 목표 학점을 바꿔 보세요.',
      suggestions
    },
    warnings
  };
}
