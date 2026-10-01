/**
 * 모의 서버의 챗봇 해석기 (실제 서버에서는 Gemini structured output 이 맡는다).
 * 의도 셋(set_preferences / course_review / other) 분류, 조건·체크리스트 합치기, 답장 문구까지 만든다.
 */
import type { ChatRequest, ChatResponse, ChecklistItem, Conditions, Day, LevelValue, StyleId } from '../api/types';
import { DAYS, LEVEL_LABEL, TARGET_MAX, TARGET_MIN, TIME_LABEL } from '../lib/constants';
import { CATALOG, META } from './data';

/** 스타일 변경: 이전 스타일이 넣고 아무도 건드리지 않은 항목만 빼고, 새 프리셋은 없는 항목만 넣는다 */
export function mergeStyle(prev: StyleId, next: StyleId, list: ChecklistItem[]): ChecklistItem[] {
  const prevKeys = new Set(META.styles.find((s) => s.id === prev)?.items.map((i) => i.key) ?? []);
  const kept = prev === next ? list : list.filter((i) => !(i.source === 'style' && prevKeys.has(i.key)));
  const preset = META.styles.find((s) => s.id === next)?.items ?? [];
  const add = preset.filter((p) => !kept.some((i) => i.key === p.key)).map((p) => ({ ...p, enabled: true, source: 'style' as const }));
  return [...kept, ...add];
}

interface ItemRule {
  key: string;
  label: string;
  type: 'level' | 'toggle';
  re: RegExp;
}

const LEVEL_RULES: ItemRule[] = [
  { key: 'custom:시험난이도', label: '시험 난이도', type: 'level', re: /시험\s*(난이도|이\s*쉬|이\s*어려|쉬운|어려운)/ },
  { key: 'custom:실습비중', label: '실습 비중', type: 'level', re: /실습/ },
  { key: 'assignment', label: '과제량', type: 'level', re: /과제/ },
  { key: 'team_project', label: '팀플', type: 'level', re: /팀플|조별|팀\s*프로젝트|조모임/ },
  { key: 'exam', label: '시험 횟수', type: 'level', re: /시험(?!\s*(난이도|이\s*쉬|이\s*어려))/ },
  { key: 'presentation', label: '발표', type: 'level', re: /발표/ },
  { key: 'attendance', label: '출석 체크', type: 'level', re: /출석|출첵/ },
  { key: 'first_period', label: '1교시 수업', type: 'level', re: /1교시|아침\s*수업|9시\s*수업|일찍\s*시작/ },
  { key: 'gap', label: '우주공강', type: 'level', re: /우주\s*공강/ }
];

const TOGGLE_RULES: ItemRule[] = [
  { key: 'custom:교수님이친절함', label: '교수님이 친절함', type: 'toggle', re: /친절/ },
  { key: 'custom:녹화강의제공', label: '녹화 강의 제공', type: 'toggle', re: /녹화|인강|다시\s*보기/ },
  { key: 'custom:학점을잘줌', label: '학점을 잘 줌', type: 'toggle', re: /학점\s*(을|이)?\s*(잘|후하|너그|널널)|꿀강/ },
  { key: 'custom:설명이친절함', label: '설명을 잘함', type: 'toggle', re: /강의력|설명\s*(을|이)?\s*잘/ }
];

const STYLE_WORDS: [RegExp, StyleId][] = [
  [/졸업/, 'graduation'],
  [/늦잠/, 'late_riser'],
  [/동아리/, 'club'],
  [/취업|취준/, 'career'],
  [/통학/, 'commute']
];

function levelAfter(text: string, at: number, len: number): LevelValue | 'off' | null {
  const seg = text.slice(at + len, at + len + 12).split(/[,.!?]|(?:고|며|면서)\s/)[0];
  if (/상관\s*없|신경\s*안|괜찮/.test(seg)) return 'off';
  if (/보통|적당|중간|무난/.test(seg)) return 'mid';
  if (/많|무거|빡|높|어려|자주/.test(seg)) return 'high';
  if (/적|없|가볍|조금|낮|쉬|안\s|덜|싫/.test(seg)) return 'low';
  return null;
}

const dayName = (d: Day) => `${d}요일`;

function parseFreeDays(text: string, cur: Day[]): Day[] | null {
  if (!/공강/.test(text)) return null;
  if (/공강\s*(은|이|을)?\s*(없|필요\s*없|안\s*해)/.test(text)) return [];
  const grab = (s: string): Day[] => {
    const r: Day[] = [];
    const re = /([월화수목금])요일|([월화수목금])(?=\s*[,·와과랑]|\s*공강)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const d = (m[1] || m[2]) as Day;
      if (!r.includes(d)) r.push(d);
    }
    return r;
  };
  const i = text.indexOf('공강');
  const before = text.slice(Math.max(0, i - 24), i).split(/[.!?]|고\s/).pop() ?? '';
  const after = text.slice(i, i + 16);
  let days = grab(before);
  if (!days.length) days = grab(after);
  if (!days.length) return null;
  if (/(빼|취소|없애|말고|해제)/.test(after)) return cur.filter((d) => !days.includes(d));
  const set = new Set([...cur, ...days]);
  return DAYS.filter((d) => set.has(d));
}

function findCourses(text: string): string[] {
  const hits: { name: string; at: number }[] = [];
  const seen = new Set<string>();
  CATALOG.forEach((c) => {
    const at = text.replace(/\s/g, '').indexOf(c.name);
    if (at >= 0 && !seen.has(c.name)) {
      seen.add(c.name);
      hits.push({ name: c.name, at });
    }
  });
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}

function findProfessor(text: string, course: string): string | null {
  const profs = new Set(CATALOG.filter((c) => c.name === course).flatMap((c) => c.sections.map((s) => s.professor)));
  for (const p of profs) if (text.includes(p)) return p;
  return null;
}

export function interpret(req: ChatRequest): ChatResponse {
  const text = req.message.trim();
  const conditions: Conditions = { ...req.conditions, free_days: [...req.conditions.free_days] };
  let checklist: ChecklistItem[] = req.checklist.map((i) => ({ ...i }));
  const changes: string[] = [];
  const said: string[] = [];
  const added: string[] = [];
  const turnedOff: string[] = [];
  const unsupported: string[] = [];

  // 조건
  const free = parseFreeDays(text, conditions.free_days);
  if (free && free.join() !== conditions.free_days.join()) {
    conditions.free_days = free;
    changes.push('conditions.free_days');
    said.push(free.length ? `공강 요일을 ${free.map(dayName).join('·')}로` : '공강 요일을 없음으로');
  }
  const time = /(시간|시간대)[^.!?]{0,8}상관\s*없/.test(text) ? 'any' : /오전/.test(text) ? 'morning' : /오후/.test(text) ? 'afternoon' : null;
  if (time && time !== conditions.preferred_time) {
    conditions.preferred_time = time;
    changes.push('conditions.preferred_time');
    said.push(`선호 시간을 ${TIME_LABEL[time]}로`);
  }
  const tm = text.match(/(\d{1,2})\s*학점/);
  if (tm && !/학점\s*(을|이)?\s*(잘|후하|너그|널널)/.test(text)) {
    const v = Math.min(TARGET_MAX, Math.max(TARGET_MIN, Number(tm[1])));
    if (v !== conditions.target_credits) {
      conditions.target_credits = v;
      changes.push('conditions.target_credits');
      said.push(`목표 학점을 ${v}학점으로`);
    }
  }
  let firstStyle: { at: number; id: StyleId } | null = null;
  STYLE_WORDS.forEach(([re, id]) => {
    const m = re.exec(text);
    if (m && (!firstStyle || m.index < firstStyle.at)) firstStyle = { at: m.index, id };
  });
  const styleHit = firstStyle as { at: number; id: StyleId } | null;
  if (styleHit && styleHit.id !== conditions.style) {
    checklist = mergeStyle(conditions.style, styleHit.id, checklist);
    conditions.style = styleHit.id;
    changes.push('conditions.style');
    said.push(`대학 스타일을 '${META.styles.find((s) => s.id === styleHit.id)?.name}'으로`);
  }

  // 체크리스트 항목
  const upsert = (rule: ItemRule, level: LevelValue | null, enabled = true) => {
    const at = checklist.findIndex((i) => i.key === rule.key);
    const next: ChecklistItem = { key: rule.key, label: rule.label, type: rule.type, level: rule.type === 'toggle' ? null : level, enabled, source: 'chat' };
    if (at >= 0) {
      const old = checklist[at];
      if (old.level === next.level && old.enabled === next.enabled) return;
      checklist[at] = { ...next, level: next.level ?? old.level };
    } else {
      if (!enabled) return;
      checklist.push(next);
    }
    changes.push(`checklist.${rule.key}`);
    if (enabled) added.push(rule.type === 'toggle' ? `'${rule.label}'` : `'${rule.label} ${LEVEL_LABEL[level ?? 'mid']}'`);
    else turnedOff.push(`'${rule.label}'`);
  };
  const usedSpans: [number, number][] = [];
  LEVEL_RULES.forEach((rule) => {
    const m = rule.re.exec(text);
    if (!m) return;
    if (usedSpans.some(([a, b]) => m.index >= a && m.index < b)) return;
    usedSpans.push([m.index, m.index + m[0].length]);
    if (rule.key === 'custom:시험난이도') {
      const lv = /쉬/.test(m[0]) || /쉬/.test(text.slice(m.index, m.index + 12)) ? 'low' : /어려/.test(text.slice(m.index, m.index + 12)) ? 'high' : levelAfter(text, m.index, m[0].length);
      if (lv === 'off') upsert(rule, null, false);
      else upsert(rule, lv ?? 'mid');
      return;
    }
    const lv = levelAfter(text, m.index, m[0].length);
    if (lv === 'off') upsert(rule, null, false);
    else if (lv) upsert(rule, lv);
  });
  TOGGLE_RULES.forEach((rule) => {
    const m = rule.re.exec(text);
    if (!m) return;
    if (/상관\s*없/.test(text.slice(m.index, m.index + 14))) upsert(rule, null, false);
    else upsert(rule, null);
  });
  if (/강의실|건물|가까운\s*(곳|데|강의)|이동\s*거리/.test(text)) unsupported.push('강의실 위치');

  // 수강평
  const courses = findCourses(text);
  const asksReview = courses.length > 0 && /수강평|강의평|후기|어때|어떄|어떤가|평가|알려|추천/.test(text);
  const prefsChanged = changes.length > 0;

  if (asksReview && !prefsChanged) {
    const name = courses[0];
    const multi = courses.length > 1;
    return {
      intent: 'course_review',
      reply: multi ? `한 번에 한 과목씩 조회할 수 있어요. 먼저 '${name}'부터 볼게요.` : `'${name}' 수강평을 체크리스트 기준으로 비교해 볼게요.`,
      conditions,
      checklist,
      changes: [],
      unsupported,
      review_target: { course_name: name, professor: findProfessor(text, name) }
    };
  }

  if (prefsChanged) {
    const parts: string[] = [];
    if (said.length) parts.push(`${said.join(', ')} 바꿨어요.`);
    if (added.length) parts.push(`체크리스트에 ${added.join(', ')}을(를) 넣었어요.`);
    if (turnedOff.length) parts.push(`${turnedOff.join(', ')} 체크를 풀었어요. 항목은 남고 생성에서만 빠져요.`);
    let reply = parts.join(' ');
    if (unsupported.length) reply += ` '${unsupported.join(', ')}' 같은 조건은 수강평·계획서·시간표로 판단할 수 없어서 반영하지 못했어요.`;
    if (asksReview) reply += ` 수강평은 다음 메시지로 한 과목씩 물어봐 주세요.`;
    reply += ' [생성하기]를 누르면 시간표에 반영돼요.';
    return { intent: 'set_preferences', reply, conditions, checklist, changes, unsupported, review_target: null };
  }

  if (unsupported.length) {
    return {
      intent: 'other',
      reply: `'${unsupported.join(', ')}' 같은 조건은 수강평·계획서·시간표 어디에서도 판단할 수 없어서 반영할 수 없어요. 과제량, 팀플, 공강 요일처럼 말씀해 주세요.`,
      conditions,
      checklist,
      changes: [],
      unsupported,
      review_target: null
    };
  }

  return {
    intent: 'other',
    reply:
      '"수요일 공강이고 팀플은 적게"처럼 조건을 말하면 시간표 조건과 체크리스트에 반영해요. "운영체제 수강평 알려줘"처럼 과목 하나를 물으면 교수별 수강평을 비교해 드려요.',
    conditions,
    checklist,
    changes: [],
    unsupported,
    review_target: null
  };
}
