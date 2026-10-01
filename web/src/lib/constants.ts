import type { Category, Day, LevelValue, PreferredTime, StyleId } from '../api/types';

export const DAYS: Day[] = ['월', '화', '수', '목', '금'];
export const CATEGORIES: Category[] = ['전필', '전선', '교필', '교선'];

export const CATEGORY_NAME: Record<Category, string> = {
  전필: '전공필수',
  전선: '전공선택',
  교필: '교양필수',
  교선: '교양선택'
};

/** 이수구분 색 (시간표 블록, 태그, 막대) */
export const CATEGORY_COLOR: Record<Category, { main: string; alt: string; tint: string; ink: string }> = {
  전필: { main: '#5B78B8', alt: '#7A68B3', tint: '#E8EDF7', ink: '#2F4579' },
  전선: { main: '#4F9A88', alt: '#82A956', tint: '#E3F1ED', ink: '#245C4F' },
  교필: { main: '#C0803F', alt: '#B4963F', tint: '#F7EDE2', ink: '#7A4B1C' },
  교선: { main: '#B8645A', alt: '#C77B6D', tint: '#F6E6E3', ink: '#7A3229' }
};

export const LEVEL_LABEL: Record<LevelValue, string> = { low: '적음', mid: '보통', high: '많음' };
export const LEVELS: LevelValue[] = ['low', 'mid', 'high'];
export const LEVEL_NUM: Record<LevelValue, number> = { low: 1, mid: 2, high: 3 };
export const levelFromNum = (n: number): LevelValue => (n <= 1 ? 'low' : n >= 3 ? 'high' : 'mid');

export const TIME_LABEL: Record<PreferredTime, string> = { any: '상관없음', morning: '오전', afternoon: '오후' };
export const TIME_OPTIONS: PreferredTime[] = ['any', 'morning', 'afternoon'];

export const STYLE_FALLBACK: { id: StyleId; name: string }[] = [
  { id: 'graduation', name: '졸업 요건 우선' },
  { id: 'late_riser', name: '늦잠 우선' },
  { id: 'club', name: '동아리 활동 우선' },
  { id: 'career', name: '취업 준비 우선' },
  { id: 'commute', name: '통학 편의 우선' }
];

/** 기본 항목 (배치 분석으로 강의마다 1~3 값이 있음) */
export const BASE_ITEMS: { key: string; label: string }[] = [
  { key: 'assignment', label: '과제량' },
  { key: 'team_project', label: '팀플' },
  { key: 'exam', label: '시험 횟수' },
  { key: 'presentation', label: '발표' },
  { key: 'attendance', label: '출석 체크' }
];

/** 시간표 모양 항목 (조합에서 바로 계산) */
export const SHAPE_ITEMS: { key: string; label: string }[] = [
  { key: 'first_period', label: '1교시 수업' },
  { key: 'gap', label: '우주공강' }
];

export const DEFAULT_CONDITIONS = {
  target_credits: 18,
  free_days: [] as Day[],
  preferred_time: 'any' as PreferredTime,
  style: 'graduation' as StyleId
};

export const TARGET_MIN = 9;
export const TARGET_MAX = 21;

/** 그리드에 그릴 시간 범위 (시) */
export const GRID_START = 9;
export const GRID_END = 18;

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const DEMO_EMAIL = 'demo@etabuilder.kr';
export const DEMO_PASSWORD = 'demo1234';

export const CHAT_HINT = '수강평은 한 번에 한 과목씩 물어볼 수 있어요';
export const CHAT_FAIL = '지금 AI 응답이 늦어요. 잠시 후 다시 말씀해 주세요.';
/** 강의 시간이 없는 분반(e-러닝). 서버의 elearning 값이 없으면 times로 판단한다 */
export const isOnline = (x: { times: unknown[]; elearning?: boolean }) => !!x.elearning || x.times.length === 0;

export const UNSUPPORTED_MAJOR = '아직 준비 중인 학과예요. 지금은 컴퓨터공학과에서 써 볼 수 있어요.';
export const CHECKLIST_EMPTY = "챗봇에게 '팀플 적게'처럼 말하거나 대학 스타일을 고르면 여기에 항목이 생겨요.";
