import { LEVEL_LABEL } from '../lib/constants';
import { API_BASE, ApiError, request } from './http';
import type {
  AuthResponse,
  Category,
  LevelValue,
  ChatRequest,
  ChatResponse,
  CompareRequest,
  CompareResult,
  GenerateRequest,
  GenerateResponse,
  LectureDetail,
  MeResponse,
  Meta,
  OnDemandRequest,
  OnDemandResponse,
  Requirements,
  StyleRequest,
  StyleResponse,
  TranscriptResult
} from './types';

export { ApiError, getToken, setToken } from './http';

/** 프론트가 부르는 API 전체 (문서의 "API 호출 책임" 표) */
export interface Api {
  signup(email: string, password: string): Promise<AuthResponse>;
  login(email: string, password: string): Promise<AuthResponse>;
  me(): Promise<MeResponse>;
  meta(): Promise<Meta>;
  requirements(admissionYear: number, major: string): Promise<Requirements>;
  parseTranscript(file: File, admissionYear: number, major: string): Promise<TranscriptResult>;
  sampleTranscript(admissionYear: number, major: string): Promise<TranscriptResult>;
  /** 이미 읽은 성적표를 다른 입학년도·전공의 요람 기준으로 다시 나눈다 (PDF는 다시 보내지 않음) */
  regroupTranscript(t: TranscriptResult, admissionYear: number, major: string): Promise<TranscriptResult>;
  checklistStyle(req: StyleRequest): Promise<StyleResponse>;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  chat(req: ChatRequest): Promise<ChatResponse>;
  lecture(lectureId: string): Promise<LectureDetail>;
  reviewsOnDemand(req: OnDemandRequest): Promise<OnDemandResponse>;
  compare(req: CompareRequest): Promise<CompareResult>;
}

/* ---------- 실제 서버 응답 → 프론트 형식 (hackathon23 15bf1e9 기준) ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
const CATS: Category[] = ['전필', '전선', '교필', '교선'];

function toTranscript(r: Raw): TranscriptResult {
  const credits: Record<string, number> = r.completed_credits ?? {};
  return {
    admission_year: r.admission_year ?? undefined,
    major: r.major ?? undefined,
    courses: (r.courses ?? []).map((c: Raw) => ({
      course_id: c.course_id ?? '',
      name: c.name,
      category: c.category,
      credits: Number(c.credits),
      grade: c.grade,
      transcript_category: c.transcript_category,
      ge_area: c.ge_area
    })),
    recognized_count: r.recognized_count ?? (r.courses ?? []).length,
    summary: CATS.map((category) => ({ category, done: Number(credits[category] ?? 0) })),
    total_credits: Number(r.total_credits ?? 0),
    completed_credits: credits,
    completed_course_ids: r.completed_course_ids ?? (r.courses ?? []).map((c: Raw) => c.course_id).filter(Boolean),
    remaining_total: r.requirements?.remaining_total ?? undefined,
    remaining_free: r.requirements?.remaining_free ?? undefined,
    excluded: r.excluded ?? [],
    ge: r.requirements?.ge ?? null
  };
}

function toMeta(r: Raw): Meta {
  const supportedYears: number[] = r.supported_years ?? [];
  const years: Raw[] = r.admission_years ?? [];
  return {
    semester: r.semester_label ?? r.semester,
    admission_years: years
      .map((y) => (typeof y === 'number' ? { year: y, supported: supportedYears.includes(y) } : y))
      .sort((a: Raw, b: Raw) => a.year - b.year),
    majors: r.majors ?? [],
    styles: (r.styles ?? []).map((st: Raw) => ({ id: st.id, name: st.label ?? st.name, items: st.items ?? [] })),
    base_items: r.base_items ?? [],
    levels: Array.isArray(r.levels) ? Object.fromEntries(r.levels.map((l: Raw) => [l.id, l.label])) : r.levels
  };
}

function toRequirements(r: Raw): Requirements {
  if (r.supported === false) throw new ApiError(r.message || '아직 준비 중인 학과예요.', 404);
  // credits 에는 최소 학점이 있는 영역만 온다 (a997a5c 부터 교선은 최소 없음)
  const credits: Record<string, number> = r.credits ?? {};
  const noMin: string[] = r.no_min_categories ?? CATS.filter((c) => !(c in credits));
  return {
    admission_year: r.admission_year,
    major: r.major,
    categories: CATS.map((category) => ({ category, required: Number(credits[category] ?? 0), no_min: noMin.includes(category) })),
    total_required: r.total_required ?? undefined,
    // 이수구분·학점을 모르면 지어내지 않고 null 로 둔다
    required_courses: (r.required_courses ?? []).map((c: Raw) => ({
      course_id: c.course_id,
      name: c.name ?? c.course_id,
      category: c.category ?? null,
      credits: c.credits ?? null,
      offered: c.offered ?? true
    }))
  };
}

function toMe(r: Raw): MeResponse {
  const t = r.transcript ? toTranscript(r.transcript) : null;
  return {
    user: { email: r.email, name: r.name },
    profile: t?.admission_year && t.major ? { admission_year: t.admission_year, major: t.major } : null,
    transcript: t
  };
}

function toLecture(r: Raw): LectureDetail {
  const levels: Record<string, number | null> = {};
  const evidence: Record<string, string[]> = {};
  (Array.isArray(r.levels) ? r.levels : []).forEach((l: Raw) => {
    levels[l.key] = l.value ?? null;
    if (l.evidence) evidence[l.key] = Array.isArray(l.evidence) ? l.evidence : [l.evidence];
  });
  return {
    lecture_id: r.lecture_id,
    course_id: r.course_id ?? '',
    course: r.course ?? '',
    professor: r.professor ?? '',
    category: r.category ?? undefined,
    credits: r.credits ?? undefined,
    review_count: r.has_insight === false ? undefined : r.review_count,
    levels,
    evidence,
    summary: r.summary ?? [],
    syllabus_images: r.syllabus_image_url ? [r.syllabus_image_url] : r.syllabus_images ?? [],
    sections: (r.sections ?? []).map((x: Raw) => ({ section_id: x.section_id, times: x.times ?? [] }))
  };
}

/** on-demand 의 result: match / partial / opposite / unknown */
function toReviews(r: Raw): OnDemandResponse {
  return {
    course_name: r.course_name,
    course_id: r.course_id ?? null,
    recommended: r.recommended ?? null,
    more_professors: r.more_professors ?? [],
    message: [r.message, ...(r.warnings ?? [])].filter(Boolean).join(' '),
    results: (r.results ?? []).map((x: Raw) => ({
      rank: x.rank,
      lecture_id: x.lecture_id,
      professor: x.professor,
      status: x.status,
      in_catalog: !!x.in_catalog,
      review_count: x.review_count ?? 0,
      sections: x.sections ?? [],
      rating: x.rating ?? null,
      grading: x.grading ?? null,
      matched: x.matched ?? [],
      levels: x.levels ?? {},
      summary: x.summary ?? [],
      match: x.match ?? { satisfied: 0, total: 0 },
      checklist_eval: (x.checklist_eval ?? []).map((e: Raw) => ({
        key: e.key,
        label: e.label,
        value: e.value,
        satisfied: e.result === 'match' ? true : e.result === 'opposite' || e.result === 'partial' ? false : null,
        evidence:
          e.result === 'partial'
            ? `원하는 정도와 한 단계 달라요${typeof e.value === 'string' && LEVEL_LABEL[e.value as LevelValue] ? ` (${LEVEL_LABEL[e.value as LevelValue]})` : ''}`
            : typeof e.value === 'string' && LEVEL_LABEL[e.value as LevelValue]
              ? `이 강의는 ${LEVEL_LABEL[e.value as LevelValue]}`
              : null
      }))
    }))
  };
}

const realApi: Api = {
  signup: (email, password) => request('/api/auth/signup', { method: 'POST', body: { email, password } }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: async () => toMe(await request('/api/auth/me')),
  meta: async () => toMeta(await request('/api/meta')),
  requirements: async (y, m) => toRequirements(await request(`/api/requirements?admission_year=${y}&major=${encodeURIComponent(m)}`)),
  parseTranscript: async (file, y, m) => {
    const form = new FormData();
    form.append('file', file);
    form.append('admission_year', String(y));
    form.append('major', m);
    return toTranscript(await request('/api/transcript/parse', { method: 'POST', form, timeoutMs: 90000 }));
  },
  sampleTranscript: async (y, m) => toTranscript(await request('/api/transcript/sample', { method: 'POST', body: { admission_year: y, major: m } })),
  regroupTranscript: async (t, y, m) =>
    toTranscript(
      await request('/api/transcript/regroup', {
        method: 'POST',
        body: { admission_year: y, major: m, courses: t.courses, excluded: t.excluded ?? [], recognized_count: t.recognized_count }
      })
    ),
  checklistStyle: (req) => request('/api/checklist/style', { method: 'POST', body: req }),
  generate: (req) => request('/api/timetable/generate', { method: 'POST', body: req, timeoutMs: 60000 }),
  chat: (req) => request('/api/chat', { method: 'POST', body: req, timeoutMs: 45000 }),
  lecture: async (id) => toLecture(await request(`/api/lectures/${encodeURIComponent(id)}`)),
  // 교수당 5~15초, 최대 3명
  reviewsOnDemand: async (req) => toReviews(await request('/api/reviews/on-demand', { method: 'POST', body: req, timeoutMs: 60000 })),
  compare: (req) => request('/api/compare', { method: 'POST', body: req, timeoutMs: 60000 })
};

/**
 * VITE_API_MODE
 *  - real: 항상 서버 호출
 *  - mock: 항상 브라우저 안 모의 서버 (src/mock) 사용
 *  - auto(기본): 서버 /openapi.json 에 새 API(/api/auth/login)가 있으면 real, 없으면 mock
 */
const MODE = ((import.meta.env.VITE_API_MODE as string | undefined) ?? 'auto').toLowerCase();

export type ApiMode = 'real' | 'mock';

let picked: Promise<{ api: Api; mode: ApiMode }> | null = null;

async function probe(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${API_BASE}/openapi.json`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const doc = await res.json();
    return !!doc?.paths?.['/api/auth/login'];
  } catch {
    return false;
  }
}

export function getApi(): Promise<{ api: Api; mode: ApiMode }> {
  if (!picked) {
    picked = (async () => {
      const useReal = MODE === 'real' ? true : MODE === 'mock' ? false : await probe();
      if (useReal) return { api: realApi, mode: 'real' as const };
      const { mockApi } = await import('../mock/server');
      return { api: mockApi, mode: 'mock' as const };
    })();
  }
  return picked;
}
