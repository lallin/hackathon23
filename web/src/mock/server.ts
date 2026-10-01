/**
 * 브라우저 안 모의 서버. 실제 서버(문서의 API 계약)가 아직 없을 때 같은 형식으로 응답한다.
 * src/api/index.ts 의 getApi() 가 서버에 새 API 가 없으면 자동으로 이것을 쓴다.
 */
import type { Api } from '../api';
import { ApiError, getToken } from '../api/http';
import type { Category, ChecklistItem, CompareResult, MeResponse, OnDemandResponse, ReviewEval, ReviewResult, TranscriptCourse, TranscriptResult } from '../api/types';
import { BASE_ITEMS, CATEGORIES, DEMO_EMAIL, DEMO_PASSWORD, LEVEL_NUM } from '../lib/constants';
import {
  baseLevels,
  CATALOG,
  evidenceFor,
  hash,
  inBatch,
  lectureId,
  META,
  requirementsFor,
  SAMPLE_TRANSCRIPT,
  summaryFor,
  syllabusImage
} from './data';
import { generate, lectureValue } from './engine';
import { interpret, mergeStyle } from './nlu';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface StoredUser {
  password: string;
  profile: MeResponse['profile'];
  transcript: TranscriptResult | null;
}

const USERS_KEY = 'etabuilder.mock.users';
let mem: Record<string, StoredUser> | null = null;

function users(): Record<string, StoredUser> {
  if (!mem) {
    try {
      mem = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
    } catch {
      mem = {};
    }
  }
  const m = mem!;
  if (!m[DEMO_EMAIL]) m[DEMO_EMAIL] = { password: DEMO_PASSWORD, profile: null, transcript: null };
  return m;
}

function save() {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(mem));
  } catch {
    /* 무시 */
  }
}

function currentEmail(): string | null {
  const t = getToken();
  if (!t?.startsWith('mock:')) return null;
  const email = t.slice(5);
  return users()[email] ? email : null;
}

function requireUser(): [string, StoredUser] {
  const email = currentEmail();
  if (!email) throw new ApiError('다시 로그인해 주세요', 401);
  return [email, users()[email]];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toTranscript(all: TranscriptCourse[], year: number, major: string): TranscriptResult {
  const courses = all.filter((c) => c.grade !== 'F' && c.grade !== 'NP');
  const summary = CATEGORIES.map((category) => ({ category, done: courses.filter((c) => c.category === category).reduce((n, c) => n + c.credits, 0) }));
  return {
    admission_year: year,
    major,
    courses,
    recognized_count: courses.length,
    summary,
    total_credits: summary.reduce((n, s) => n + s.done, 0)
  };
}

function completedByCat(ids: string[]): Record<Category, number> {
  const known = new Map<string, TranscriptCourse>();
  [...SAMPLE_TRANSCRIPT('cse'), ...SAMPLE_TRANSCRIPT('biz')].forEach((c) => known.set(c.course_id, c));
  const email = currentEmail();
  users()[email ?? '']?.transcript?.courses.forEach((c) => known.set(c.course_id, c));
  const out = { 전필: 0, 전선: 0, 교필: 0, 교선: 0 } as Record<Category, number>;
  ids.forEach((id) => {
    const c = known.get(id);
    if (c) out[c.category] += c.credits;
  });
  return out;
}

function evalReview(lid: string, checklist: ChecklistItem[]): ReviewEval[] {
  const levels = baseLevels(lid);
  const ev = evidenceFor(lid, levels);
  return checklist
    .filter((c) => c.enabled && c.key !== 'first_period' && c.key !== 'gap')
    .map((c) => {
      const v = lectureValue(lid, c);
      const satisfied = c.type === 'toggle' ? (v === null ? null : v === 'yes') : typeof v === 'number' && c.level ? v === LEVEL_NUM[c.level] : null;
      const evidence = ev[c.key]?.[0] ?? (v === null ? null : c.type === 'toggle' ? (v === 'yes' ? `"${c.label}"고 말하는 수강평이 많아요.` : `"${c.label}"와 반대라는 수강평이 있어요.`) : `수강평으로 판정한 ${c.label} 값이에요.`);
      return { key: c.key, label: c.label, value: v, satisfied, evidence };
    });
}

export const mockApi: Api = {
  async signup(email, password) {
    await wait(300);
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) throw new ApiError('이메일 형식을 확인해 주세요', 422);
    if (password.length < 6) throw new ApiError('비밀번호는 6자 이상이어야 해요', 422);
    if (users()[e]) throw new ApiError('이미 가입한 이메일이에요', 409);
    users()[e] = { password, profile: null, transcript: null };
    save();
    return { token: `mock:${e}`, user: { email: e } };
  },
  async login(email, password) {
    await wait(300);
    const e = email.trim().toLowerCase();
    const u = users()[e];
    if (!u || u.password !== password) throw new ApiError('이메일 또는 비밀번호가 맞지 않아요', 401);
    return { token: `mock:${e}`, user: { email: e } };
  },
  async me() {
    await wait(150);
    const [email, u] = requireUser();
    return { user: { email }, profile: u.profile, transcript: u.transcript };
  },
  async meta() {
    await wait(100);
    return META;
  },
  async requirements(y, m) {
    await wait(150);
    const r = requirementsFor(y, m);
    if (!r) throw new ApiError('아직 준비 중인 학과예요', 404);
    const email = currentEmail();
    if (email) {
      users()[email].profile = { admission_year: y, major: m };
      save();
    }
    return r;
  },
  async parseTranscript(file, y, m) {
    await wait(1600);
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new ApiError('PDF 파일만 올릴 수 있어요', 415);
    if (!requirementsFor(y, m)) throw new ApiError('아직 준비 중인 학과예요', 404);
    // 모의 서버는 PDF 를 읽지 않고 샘플 결과를 돌려준다 (파일은 저장하지 않음)
    const t = toTranscript(SAMPLE_TRANSCRIPT(m as 'cse' | 'biz'), y, m);
    const email = currentEmail();
    if (email) {
      users()[email].transcript = t;
      users()[email].profile = { admission_year: y, major: m };
      save();
    }
    return t;
  },
  async sampleTranscript(y, m) {
    await wait(500);
    if (!requirementsFor(y, m)) throw new ApiError('아직 준비 중인 학과예요', 404);
    const t = toTranscript(SAMPLE_TRANSCRIPT(m as 'cse' | 'biz'), y, m);
    const email = currentEmail();
    if (email) {
      users()[email].transcript = t;
      users()[email].profile = { admission_year: y, major: m };
      save();
    }
    return t;
  },
  async checklistStyle(req) {
    await wait(200);
    return { checklist: mergeStyle(req.previous_style, req.style, req.checklist) };
  },
  async generate(req) {
    // 자유 항목이 처음 들어온 생성이면 판정 시간이 걸리는 것처럼
    await wait(req.checklist.some((c) => c.key.startsWith('custom:')) ? 1200 : 450);
    return generate(req, completedByCat(req.completed_course_ids));
  },
  async chat(req) {
    await wait(700);
    return interpret(req);
  },
  async lecture(id) {
    await wait(350);
    const i = id.lastIndexOf('-');
    const courseId = id.slice(0, i);
    const professor = id.slice(i + 1);
    const course = CATALOG.find((c) => c.course_id === courseId);
    if (!course) throw new ApiError('강의 정보를 찾지 못했어요', 404);
    const levels = baseLevels(id);
    return {
      lecture_id: id,
      course_id: courseId,
      course: course.name,
      professor,
      category: course.category,
      credits: course.credits,
      review_count: 12 + (hash(id) % 40),
      levels,
      evidence: evidenceFor(id, levels),
      summary: summaryFor(id, levels),
      syllabus_images: [syllabusImage(course.name, professor, course.credits)]
    };
  },
  async compare(): Promise<CompareResult> {
    // 모의 서버에는 과목 비교가 없다. 실제 서버에서만 동작한다.
    return { type: 'result', message: '과목 비교는 실제 서버에서만 볼 수 있어요.', highlights: [], courses: [] };
  },
  async reviewsOnDemand(req): Promise<OnDemandResponse> {
    const name = req.course_name.replace(/\s/g, '');
    const courses = CATALOG.filter((c) => c.name === name || c.name.includes(name) || name.includes(c.name));
    if (!courses.length) {
      await wait(400);
      return { course_name: req.course_name, message: `이번 학기 개설 과목에서 '${req.course_name}'을(를) 찾지 못했어요.`, results: [] };
    }
    const course = courses[0];
    let profs = [...new Set(course.sections.map((s) => s.professor))];
    if (req.professor) profs = profs.filter((p) => p === req.professor);
    profs = profs.slice(0, 3);
    const results: ReviewResult[] = [];
    for (const p of profs) {
      const lid = lectureId(course.course_id, p);
      const cached = inBatch(lid);
      const failed = !cached && hash(lid) % 3 === 0;
      await wait(cached ? 300 : 1800);
      if (failed) {
        results.push({ rank: 0, lecture_id: lid, professor: p, status: 'not_collected', in_catalog: true, review_count: 0, levels: {}, summary: [], match: { satisfied: 0, total: 0 }, checklist_eval: [] });
        continue;
      }
      const levels = baseLevels(lid);
      const evals = evalReview(lid, req.checklist);
      results.push({
        rank: 0,
        lecture_id: lid,
        professor: p,
        status: cached ? 'cached' : 'collected',
        in_catalog: true,
        review_count: 12 + (hash(lid) % 40),
        levels: Object.fromEntries(BASE_ITEMS.map((b) => [b.key, levels[b.key]])),
        summary: summaryFor(lid, levels),
        match: { satisfied: evals.filter((e) => e.satisfied).length, total: evals.length },
        checklist_eval: evals
      });
    }
    const score = (r: ReviewResult) => (r.status === 'not_collected' ? -1 : r.match.total ? r.match.satisfied / r.match.total : 0);
    results.sort((a, b) => score(b) - score(a) || b.review_count - a.review_count);
    results.forEach((r, i) => (r.rank = i + 1));
    const best = results.find((r) => r.status !== 'not_collected');
    const message = !best
      ? '지금은 수강평을 가져올 수 없어요. 잠시 후 다시 물어봐 주세요.'
      : results.length === 1
        ? `${best.professor} 교수님 '${course.name}' 수강평을 정리했어요.`
        : `체크리스트에 가장 잘 맞는 건 ${best.professor} 교수님 강의예요.`;
    return { course_name: course.name, message, results };
  }
};
