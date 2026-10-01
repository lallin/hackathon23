import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import { ApiError, getApi, getToken, setToken } from '../api';
import type { Api, ApiMode } from '../api';
import type {
  ChecklistItem,
  Combination,
  Conditions,
  GenerateRequest,
  Infeasible,
  LevelValue,
  Meta,
  OnDemandResponse,
  Requirements,
  StyleId,
  TranscriptResult,
  User
} from '../api/types';
import { CHAT_FAIL, DEFAULT_CONDITIONS } from '../lib/constants';

/** 편집 중(draft) / 마지막 생성 기준(applied) 이 같은 모양을 가진다 */
export interface Draft {
  conditions: Conditions;
  checklist: ChecklistItem[];
  pinned: string[];
  excluded: string[];
}

export interface ChatMsg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  kind?: 'error' | 'loading' | 'reviews';
  reviews?: OnDemandResponse;
}

export interface State {
  phase: 'boot' | 'auth' | 'app';
  mode: ApiMode | null;
  bootError: string | null;
  user: User | null;
  meta: Meta | null;
  year: number;
  major: string;
  requirements: Requirements | null;
  reqStatus: 'idle' | 'loading' | 'ready' | 'unsupported' | 'error';
  transcript: TranscriptResult | null;
  uploading: boolean;
  uploadError: string | null;
  draft: Draft;
  applied: Draft | null;
  combos: Combination[];
  infeasible: Infeasible | null;
  warnings: string[];
  generating: boolean;
  genError: string | null;
  rank: number;
  /** 시간표에서 고른 블록의 분반 id */
  selected: string | null;
  /** course_id -> 과목명 (제한한 과목 칩 표시용) */
  names: Record<string, string>;
  msgs: ChatMsg[];
  chatBusy: boolean;
  /** 방금 바뀐 항목 (잠깐 강조) — 체크리스트 key 또는 'cond.free_days' 같은 조건 키 */
  flash: string[];
  detail: string | null;
  toast: { id: number; text: string } | null;
}

const HELLO =
  '안녕하세요! "수요일 공강이고 팀플은 적게"처럼 원하는 시간표를 말해 주세요. 조건과 체크리스트에 반영해 두면 [생성하기]로 시간표를 다시 짤 수 있어요. 과목 하나를 물으면 교수별 수강평도 비교해 드려요.';

const emptyDraft = (): Draft => ({ conditions: { ...DEFAULT_CONDITIONS, free_days: [] }, checklist: [], pinned: [], excluded: [] });

const initial: State = {
  phase: 'boot',
  mode: null,
  bootError: null,
  user: null,
  meta: null,
  year: 2024,
  major: 'cse',
  requirements: null,
  reqStatus: 'idle',
  transcript: null,
  uploading: false,
  uploadError: null,
  draft: emptyDraft(),
  applied: null,
  combos: [],
  infeasible: null,
  warnings: [],
  generating: false,
  genError: null,
  rank: 0,
  selected: null,
  names: {},
  msgs: [{ id: 0, role: 'assistant', text: HELLO }],
  chatBusy: false,
  flash: [],
  detail: null,
  toast: null
};

type Action =
  | { type: 'set'; patch: Partial<State> }
  | { type: 'draft'; patch: Partial<Draft> }
  | { type: 'msg'; msg: ChatMsg }
  | { type: 'replaceMsg'; id: number; msg: ChatMsg }
  | { type: 'names'; names: Record<string, string> }
  | { type: 'reset'; patch: Partial<State> };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set':
      return { ...s, ...a.patch };
    case 'draft':
      return { ...s, draft: { ...s.draft, ...a.patch } };
    case 'msg':
      return { ...s, msgs: s.msgs.concat(a.msg) };
    case 'replaceMsg':
      return { ...s, msgs: s.msgs.map((m) => (m.id === a.id ? a.msg : m)) };
    case 'names':
      return { ...s, names: { ...s.names, ...a.names } };
    case 'reset':
      return { ...initial, meta: s.meta, mode: s.mode, ...a.patch };
    default:
      return s;
  }
}

/* ---------- draft 와 applied 비교 ---------- */

const sameItem = (a: ChecklistItem, b: ChecklistItem) => a.level === b.level && a.enabled === b.enabled;
const symDiff = (a: string[], b: string[]) => a.filter((x) => !b.includes(x)).length + b.filter((x) => !a.includes(x)).length;

/** [생성하기] 옆 "변경 N개 대기 중" 의 N */
export function countChanges(d: Draft, a: Draft | null): number {
  if (!a) return 0;
  let n = 0;
  if (d.conditions.target_credits !== a.conditions.target_credits) n++;
  if (d.conditions.preferred_time !== a.conditions.preferred_time) n++;
  if (d.conditions.style !== a.conditions.style) n++;
  n += symDiff(d.conditions.free_days, a.conditions.free_days);
  const keys = new Set([...d.checklist, ...a.checklist].map((i) => i.key));
  keys.forEach((k) => {
    const x = d.checklist.find((i) => i.key === k);
    const y = a.checklist.find((i) => i.key === k);
    if (!x || !y || !sameItem(x, y)) n++;
  });
  n += symDiff(d.pinned, a.pinned);
  n += symDiff(d.excluded, a.excluded);
  return n;
}

/** 생성 후 새로 생기거나 바뀐 항목 ("생성하기 후 평가") */
export function isPendingItem(item: ChecklistItem, a: Draft | null): boolean {
  if (!a) return true;
  const y = a.checklist.find((i) => i.key === item.key);
  return !y || !sameItem(item, y);
}

/* ---------- 컨텍스트 ---------- */

interface Actions {
  login(email: string, password: string, signup: boolean): Promise<void>;
  logout(): void;
  setProfile(year: number, major: string): void;
  upload(file: File): Promise<void>;
  sample(): Promise<void>;
  setTarget(n: number): void;
  toggleFreeDay(day: Conditions['free_days'][number]): void;
  setTime(t: Conditions['preferred_time']): void;
  setStyle(style: StyleId): Promise<void>;
  setLevel(key: string, level: LevelValue): void;
  toggleItem(key: string): void;
  removeItem(key: string): void;
  generate(): Promise<void>;
  step(delta: number): void;
  select(sectionId: string | null): void;
  pin(sectionId: string): void;
  exclude(courseId: string, name: string): void;
  unexclude(courseId: string): void;
  applySuggestion(s: Infeasible['suggestions'][number]): void;
  send(text: string): Promise<void>;
  openDetail(lectureId: string | null): void;
  toast(text: string): void;
}

interface Ctx {
  s: State;
  act: Actions;
  api: Api | null;
  current: Combination | null;
  pending: number;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider 안에서만 쓸 수 있어요');
  return c;
}

let msgId = 1;
const nextId = () => msgId++;

const errText = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message || fallback : fallback);

export function isSupported(meta: Meta | null, year: number, major: string): boolean {
  if (!meta) return false;
  const y = meta.admission_years.find((x) => x.year === year);
  const m = meta.majors.find((x) => x.id === major);
  return !!y?.supported && !!m?.supported;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, initial);
  const ref = useRef(s);
  ref.current = s;
  const apiRef = useRef<Api | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const booted = useRef(false);
  const autoGen = useRef(false);

  const set = useCallback((patch: Partial<State>) => dispatch({ type: 'set', patch }), []);

  const flash = useCallback(
    (keys: string[]) => {
      if (!keys.length) return;
      set({ flash: keys });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => set({ flash: [] }), 2600);
    },
    [set]
  );

  const toast = useCallback(
    (text: string) => {
      set({ toast: { id: Date.now(), text } });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => set({ toast: null }), 2600);
    },
    [set]
  );

  const loadRequirements = useCallback(
    async (year: number, major: string) => {
      const api = apiRef.current;
      if (!api) return;
      if (!isSupported(ref.current.meta, year, major)) {
        set({ requirements: null, reqStatus: 'unsupported' });
        return;
      }
      set({ reqStatus: 'loading' });
      try {
        const r = await api.requirements(year, major);
        if (ref.current.year === year && ref.current.major === major) set({ requirements: r, reqStatus: 'ready' });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) set({ requirements: null, reqStatus: 'unsupported' });
        else set({ requirements: null, reqStatus: 'error' });
      }
    },
    [set]
  );

  /** 로그인 직후: 저장된 입학년도·전공·이수 내역이 있으면 바로 4번(기본 시간표)으로 */
  const enter = useCallback(async () => {
    const api = apiRef.current!;
    const me = await api.me();
    const year = me.profile?.admission_year ?? me.transcript?.admission_year ?? ref.current.year;
    const major = me.profile?.major ?? me.transcript?.major ?? ref.current.major;
    dispatch({ type: 'reset', patch: { phase: 'app', user: me.user, year, major, transcript: me.transcript } });
    autoGen.current = !!me.transcript;
    await loadRequirements(year, major);
  }, [loadRequirements]);

  // 부팅: API 고르기 → 메타 → 토큰 있으면 내 정보
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const { api, mode } = await getApi();
      apiRef.current = api;
      set({ mode });
      try {
        set({ meta: await api.meta() });
      } catch (e) {
        set({ phase: 'auth', bootError: `서버 정보를 불러오지 못했어요 (${errText(e, '오류')})` });
        return;
      }
      if (!getToken()) {
        set({ phase: 'auth' });
        return;
      }
      try {
        await enter();
      } catch {
        setToken(null);
        set({ phase: 'auth' });
      }
    })();
  }, [enter, set]);

  /* ---------- 생성 ---------- */

  const generate = useCallback(async () => {
    const api = apiRef.current;
    const st = ref.current;
    if (!api || !st.requirements || st.generating) return;
    const draft: Draft = JSON.parse(JSON.stringify(st.draft));
    const req: GenerateRequest = {
      admission_year: st.year,
      major: st.major,
      completed_course_ids: st.transcript?.completed_course_ids ?? st.transcript?.courses.map((c) => c.course_id).filter(Boolean) ?? [],
      completed_credits: st.transcript?.completed_credits,
      conditions: draft.conditions,
      checklist: draft.checklist,
      pinned_section_ids: draft.pinned,
      excluded_course_ids: draft.excluded
    };
    set({ generating: true, genError: null });
    try {
      const res = await api.generate(req);
      if (res.combinations.length) {
        const names: Record<string, string> = {};
        res.combinations.forEach((c) => c.sections.forEach((x) => (names[x.course_id] = x.course)));
        dispatch({ type: 'names', names });
        set({
          combos: res.combinations,
          applied: draft,
          infeasible: null,
          warnings: res.warnings ?? [],
          rank: 0,
          selected: null,
          generating: false
        });
      } else {
        // 조합이 없으면 시간표는 그대로 두고 이유와 완화 방법만 보여준다
        set({
          infeasible: res.infeasible ?? { message: '조건에 맞는 시간표가 없어요.', suggestions: [] },
          warnings: res.warnings ?? [],
          generating: false
        });
      }
    } catch (e) {
      set({ generating: false, genError: errText(e, '시간표를 만들지 못했어요') });
    }
  }, [set]);

  // 이수 현황이 채워지면 기본 조건으로 바로 생성
  useEffect(() => {
    if (autoGen.current && s.transcript && s.reqStatus === 'ready' && !s.generating) {
      autoGen.current = false;
      generate();
    }
  }, [s.transcript, s.reqStatus, s.generating, generate]);

  /* ---------- 액션 ---------- */

  const act: Actions = useMemo(
    () => ({
      async login(email, password, signup) {
        const api = apiRef.current;
        if (!api) throw new ApiError('서버를 준비하는 중이에요. 잠시 후 다시 시도해 주세요.');
        const res = signup ? await api.signup(email, password) : await api.login(email, password);
        setToken(res.token);
        await enter();
      },
      logout() {
        setToken(null);
        dispatch({ type: 'reset', patch: { phase: 'auth' } });
      },
      setProfile(year, major) {
        set({ year, major, uploadError: null });
        loadRequirements(year, major);
      },
      async upload(file) {
        const api = apiRef.current;
        const st = ref.current;
        if (!api) return;
        if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
          set({ uploadError: 'PDF 파일만 올릴 수 있어요.' });
          return;
        }
        set({ uploading: true, uploadError: null });
        try {
          const t = await api.parseTranscript(file, st.year, st.major);
          autoGen.current = true;
          set({ transcript: t, uploading: false });
          toast(`인식된 과목 ${t.recognized_count}개`);
        } catch (e) {
          set({ uploading: false, uploadError: errText(e, '성적표를 읽지 못했어요') });
        }
      },
      async sample() {
        const api = apiRef.current;
        const st = ref.current;
        if (!api) return;
        set({ uploading: true, uploadError: null });
        try {
          const t = await api.sampleTranscript(st.year, st.major);
          autoGen.current = true;
          set({ transcript: t, uploading: false });
          toast(`샘플 성적표 · 인식된 과목 ${t.recognized_count}개`);
        } catch (e) {
          set({ uploading: false, uploadError: errText(e, '샘플 성적표를 불러오지 못했어요') });
        }
      },
      setTarget(n) {
        dispatch({ type: 'draft', patch: { conditions: { ...ref.current.draft.conditions, target_credits: n } } });
      },
      toggleFreeDay(day) {
        const c = ref.current.draft.conditions;
        const has = c.free_days.includes(day);
        const order = ['월', '화', '수', '목', '금'];
        const free_days = (has ? c.free_days.filter((d) => d !== day) : c.free_days.concat(day)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
        dispatch({ type: 'draft', patch: { conditions: { ...c, free_days } } });
      },
      setTime(t) {
        dispatch({ type: 'draft', patch: { conditions: { ...ref.current.draft.conditions, preferred_time: t } } });
      },
      async setStyle(style) {
        const api = apiRef.current;
        const d = ref.current.draft;
        const prev = d.conditions.style;
        if (!api || prev === style) return;
        dispatch({ type: 'draft', patch: { conditions: { ...d.conditions, style } } });
        try {
          const res = await api.checklistStyle({ style, previous_style: prev, checklist: d.checklist });
          const before = new Set(ref.current.draft.checklist.map((i) => i.key));
          dispatch({ type: 'draft', patch: { checklist: res.checklist } });
          flash(['cond.style', ...res.checklist.filter((i) => !before.has(i.key)).map((i) => i.key)]);
        } catch (e) {
          toast(`스타일 항목을 불러오지 못했어요 (${errText(e, '오류')})`);
        }
      },
      setLevel(key, level) {
        const list = ref.current.draft.checklist.map((i) => (i.key === key ? { ...i, level, enabled: true, source: 'user' as const } : i));
        dispatch({ type: 'draft', patch: { checklist: list } });
      },
      toggleItem(key) {
        const list = ref.current.draft.checklist.map((i) => (i.key === key ? { ...i, enabled: !i.enabled, source: 'user' as const } : i));
        dispatch({ type: 'draft', patch: { checklist: list } });
      },
      removeItem(key) {
        dispatch({ type: 'draft', patch: { checklist: ref.current.draft.checklist.filter((i) => i.key !== key) } });
      },
      generate,
      step(delta) {
        const n = ref.current.combos.length;
        if (!n) return;
        set({ rank: (ref.current.rank + delta + n) % n, selected: null });
      },
      select(sectionId) {
        set({ selected: ref.current.selected === sectionId ? null : sectionId });
      },
      pin(sectionId) {
        const st = ref.current;
        const combo = st.combos[st.rank];
        const sec = combo?.sections.find((x) => x.section_id === sectionId);
        if (!sec) return;
        const sameCourse = combo.sections.filter((x) => x.course_id === sec.course_id).map((x) => x.section_id);
        const on = st.draft.pinned.includes(sectionId);
        const pinned = on ? st.draft.pinned.filter((x) => x !== sectionId) : st.draft.pinned.filter((x) => !sameCourse.includes(x)).concat(sectionId);
        dispatch({ type: 'draft', patch: { pinned, excluded: st.draft.excluded.filter((x) => x !== sec.course_id) } });
      },
      exclude(courseId, name) {
        const st = ref.current;
        if (st.draft.excluded.includes(courseId)) return;
        const combo = st.combos[st.rank];
        const ofCourse = combo?.sections.filter((x) => x.course_id === courseId).map((x) => x.section_id) ?? [];
        dispatch({ type: 'names', names: { [courseId]: name } });
        dispatch({ type: 'draft', patch: { excluded: st.draft.excluded.concat(courseId), pinned: st.draft.pinned.filter((x) => !ofCourse.includes(x) && !x.startsWith(`${courseId}-`)) } });
        set({ selected: null });
      },
      unexclude(courseId) {
        dispatch({ type: 'draft', patch: { excluded: ref.current.draft.excluded.filter((x) => x !== courseId) } });
      },
      applySuggestion(sugg) {
        const d = ref.current.draft;
        // 서버가 준 patch 를 draft 에 그대로 덮어쓴다
        if (sugg.patch) {
          const p = sugg.patch;
          dispatch({
            type: 'draft',
            patch: {
              ...(p.conditions ? { conditions: { ...d.conditions, ...p.conditions } } : {}),
              ...(p.pinned_section_ids ? { pinned: p.pinned_section_ids } : {}),
              ...(p.excluded_course_ids ? { excluded: p.excluded_course_ids } : {})
            }
          });
          flash(p.conditions ? ['cond.free_days', 'cond.target_credits'] : []);
          return;
        }
        // patch 가 없으면(모의 서버) 문장을 보고 반영해 본다
        const text = sugg.text;
        const day = text.match(/공강 요일에서 ([월화수목금])요일/);
        if (day) {
          dispatch({ type: 'draft', patch: { conditions: { ...d.conditions, free_days: d.conditions.free_days.filter((x) => x !== day[1]) } } });
          flash(['cond.free_days']);
          return;
        }
        const cr = text.match(/(\d{1,2})학점/);
        if (/목표 학점/.test(text) && cr) {
          dispatch({ type: 'draft', patch: { conditions: { ...d.conditions, target_credits: Number(cr[1]) } } });
          flash(['cond.target_credits']);
          return;
        }
        if (/공강 요일 모두/.test(text)) {
          dispatch({ type: 'draft', patch: { conditions: { ...d.conditions, free_days: [] } } });
          flash(['cond.free_days']);
          return;
        }
        if (/제한한 과목/.test(text)) {
          dispatch({ type: 'draft', patch: { excluded: [] } });
          return;
        }
        if (/고정한 분반 모두/.test(text)) {
          dispatch({ type: 'draft', patch: { pinned: [] } });
          return;
        }
        const pinName = text.match(/'(.+)' 고정 풀기/);
        if (pinName) {
          const names = ref.current.names;
          const ids = Object.keys(names).filter((k) => names[k] === pinName[1]);
          dispatch({ type: 'draft', patch: { pinned: d.pinned.filter((p) => !ids.some((id) => p.startsWith(`${id}-`))) } });
        }
      },
      async send(text) {
        const api = apiRef.current;
        const st = ref.current;
        if (!api || st.chatBusy) return;
        const history = st.msgs
          .filter((m) => m.id !== 0 && m.kind !== 'loading')
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.text }));
        dispatch({ type: 'msg', msg: { id: nextId(), role: 'user', text } });
        set({ chatBusy: true });
        let res;
        try {
          res = await api.chat({ message: text, conditions: st.draft.conditions, checklist: st.draft.checklist, history });
        } catch {
          // Gemini 호출 실패: 상태를 바꾸지 않는다
          dispatch({ type: 'msg', msg: { id: nextId(), role: 'assistant', text: CHAT_FAIL, kind: 'error' } });
          set({ chatBusy: false });
          return;
        }
        if (res.error) {
          // AI 호출 실패: 서버가 상태를 그대로 돌려준다. 아무것도 바꾸지 않는다
          dispatch({ type: 'msg', msg: { id: nextId(), role: 'assistant', text: res.reply || CHAT_FAIL, kind: 'error' } });
          set({ chatBusy: false });
          return;
        }
        if (res.intent === 'set_preferences' || res.changes?.length) {
          const now = ref.current.draft;
          if (now.conditions === st.draft.conditions && now.checklist === st.draft.checklist) {
            dispatch({ type: 'draft', patch: { conditions: res.conditions, checklist: res.checklist } });
          } else {
            // 응답을 기다리는 동안 사용자가 직접 바꾼 내용은 살리고, 챗봇이 바꾼 항목만 합친다
            const conditions = { ...now.conditions };
            let checklist = now.checklist.slice();
            res.changes.forEach((c) => {
              if (c.startsWith('conditions.')) {
                const k = c.slice(11) as keyof Conditions;
                (conditions as Record<string, unknown>)[k] = res.conditions[k];
              } else if (c.startsWith('checklist.')) {
                const key = c.slice(10);
                const item = res.checklist.find((i) => i.key === key);
                checklist = checklist.filter((i) => i.key !== key);
                if (item) checklist.push(item);
              }
            });
            dispatch({ type: 'draft', patch: { conditions, checklist } });
          }
          flash(res.changes.map((c) => (c.startsWith('checklist.') ? c.slice(10) : c.replace('conditions.', 'cond.'))));
        }
        dispatch({ type: 'msg', msg: { id: nextId(), role: 'assistant', text: res.reply } });
        if (res.intent === 'course_review' && res.review_target) {
          const t = res.review_target;
          const loadingId = nextId();
          dispatch({
            type: 'msg',
            msg: { id: loadingId, role: 'assistant', kind: 'loading', text: `'${t.course_name}'${t.professor ? ` ${t.professor} 교수님` : ''} 수강평을 가져오는 중이에요. 교수당 5~15초 걸려요.` }
          });
          try {
            const r = await api.reviewsOnDemand({ course_name: t.course_name, professor: t.professor, checklist: ref.current.draft.checklist });
            dispatch({ type: 'replaceMsg', id: loadingId, msg: { id: loadingId, role: 'assistant', kind: 'reviews', text: r.message, reviews: r } });
          } catch {
            dispatch({ type: 'replaceMsg', id: loadingId, msg: { id: loadingId, role: 'assistant', kind: 'error', text: '지금은 수강평을 가져올 수 없어요. 잠시 후 다시 물어봐 주세요.' } });
          }
        }
        set({ chatBusy: false });
      },
      openDetail(lectureId) {
        set({ detail: lectureId });
      },
      toast
    }),
    [enter, flash, generate, loadRequirements, set, toast]
  );

  const current = s.combos[s.rank] ?? null;
  const pending = countChanges(s.draft, s.applied);

  return <AppCtx.Provider value={{ s, act, api: apiRef.current, current, pending }}>{children}</AppCtx.Provider>;
}
