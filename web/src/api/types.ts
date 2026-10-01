/**
 * 백엔드 API 계약 (유저플로우 문서 v0.3 의 "API 계약" · "데이터 형식")
 * 서버 응답 형식이 바뀌면 이 파일과 src/api/index.ts 만 고치면 된다.
 */

export type Day = '월' | '화' | '수' | '목' | '금';
export type Category = '전필' | '전선' | '교필' | '교선';
export type LevelValue = 'low' | 'mid' | 'high';
export type PreferredTime = 'any' | 'morning' | 'afternoon';
export type StyleId = 'graduation' | 'late_riser' | 'club' | 'career' | 'commute';
export type ItemSource = 'style' | 'chat' | 'user';

/** 체크리스트 항목 (모든 API 공통) */
export interface ChecklistItem {
  /** 기본 항목은 assignment 같은 키, 자유 항목은 "custom:교수님이친절함" */
  key: string;
  label: string;
  type: 'level' | 'toggle';
  /** toggle 이면 null */
  level: LevelValue | null;
  enabled: boolean;
  source: ItemSource;
}

/** 시간표 조건 (모든 API 공통) */
export interface Conditions {
  target_credits: number;
  free_days: Day[];
  preferred_time: PreferredTime;
  style: StyleId;
}

export interface User {
  id?: string;
  email: string;
  name?: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

/** 성적표에서 뽑은 과목 한 줄 */
export interface TranscriptCourse {
  course_id: string;
  name: string;
  category: Category;
  credits: number;
  grade?: string | null;
  /** 성적표에 찍힌 이수구분. category 는 입학년도 요람 기준 */
  transcript_category?: string | null;
}

export interface TranscriptResult {
  admission_year?: number;
  major?: string;
  courses: TranscriptCourse[];
  recognized_count: number;
  /** 네 영역별 이수 학점 */
  summary: { category: Category; done: number }[];
  total_credits: number;
  /** 서버가 계산한 영역별 이수 학점 (생성 요청의 completed_credits 로 그대로 보냄) */
  completed_credits?: Record<string, number>;
  completed_course_ids?: string[];
  /** 서버가 계산한 남은 졸업 학점과 그중 자유 학점 (성적표를 올릴 때의 입학년도·전공 기준) */
  remaining_total?: number;
  remaining_free?: number;
  /** 이수에서 뺀 과목 (F·N, 취득학점포기, 수강 중). 입학년도를 바꿔 다시 나눌 때 그대로 돌려보낸다 */
  excluded?: Record<string, unknown>[];
}

export interface MeResponse {
  user: User;
  /** 마지막으로 고른 입학년도·전공 (없으면 null) */
  profile: { admission_year: number; major: string } | null;
  /** 계정에 저장된 이수 내역 (없으면 null) */
  transcript: TranscriptResult | null;
}

export interface StylePreset {
  id: StyleId;
  name: string;
  items: Omit<ChecklistItem, 'enabled' | 'source'>[];
}

export interface Meta {
  semester: string;
  admission_years: { year: number; supported: boolean }[];
  majors: { id: string; name: string; supported: boolean }[];
  styles: StylePreset[];
  base_items: { key: string; label: string; type: 'level' | 'toggle' }[];
  levels: Record<LevelValue, string>;
}

export interface Requirements {
  admission_year: number;
  major: string;
  /** 영역별 최소 이수 학점. no_min 이면 최소 없음(교선) */
  categories: { category: Category; required: number; no_min?: boolean }[];
  /** 졸업 총 학점. 최소를 채우고 남는 학점은 네 영역 어디로든 채울 수 있다 (없으면 categories 합) */
  total_required?: number;
  /** category·credits 는 개설 과목 목록에 없는 과목이면 null, offered 는 이번 학기 개설 여부 */
  required_courses: { course_id: string; name: string; category: Category | null; credits: number | null; offered?: boolean }[];
}

export interface TimeSlot {
  day: Day;
  /** "HH:MM" */
  start: string;
  end: string;
}

export interface SectionInfo {
  section_id: string;
  lecture_id: string;
  course_id: string;
  course: string;
  professor: string;
  category: Category;
  is_required: boolean;
  credits: number;
  pinned: boolean;
  times: TimeSlot[];
  /** 강의 시간이 없는 분반(e-러닝). times가 비어 있고, 시간표 칸에서는 이러닝 자리에 놓는다 */
  elearning?: boolean;
}

export interface ChecklistEval extends ChecklistItem {
  /** 판단 불가면 null */
  satisfied: boolean | null;
  dist: Record<string, number>;
  avg?: number | null;
  text: string;
}

export interface Combination {
  rank: number;
  score: number;
  total_credits: number;
  sections: SectionInfo[];
  checklist_eval: ChecklistEval[];
  satisfied_count: number;
  enabled_count: number;
  days_used: Day[];
  /** 이 조합을 들은 뒤 영역별 학점. 최소 학점이 없는 영역(교선)은 required 가 null */
  graduation_after?: { category: Category; done: number; this_semester: number; required: number | null }[];
  /** 이 조합을 들은 뒤 졸업 총 학점 (총 학점 막대용) */
  graduation_total_after?: { done: number; this_semester: number; required: number };
  reason?: string | null;
  /** 우선 배치 과목의 배치 여부 */
  required_courses?: { course_id: string; name: string; category: Category | null; placed: boolean; offered: boolean }[];
}

export interface Infeasible {
  message: string;
  /** patch 는 생성 요청에 그대로 덮어쓰면 되는 조각 */
  suggestions: { text: string; found: number; hint?: string; patch?: Partial<Pick<GenerateRequest, 'conditions' | 'pinned_section_ids' | 'excluded_course_ids'>> }[];
}

export interface GenerateRequest {
  admission_year: number;
  major: string;
  completed_course_ids: string[];
  completed_credits?: Record<string, number>;
  conditions: Conditions;
  checklist: ChecklistItem[];
  pinned_section_ids: string[];
  excluded_course_ids: string[];
}

export interface GenerateResponse {
  combinations: Combination[];
  infeasible: Infeasible | null;
  warnings: string[];
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

/** 챗봇이 질문에 답할 때 근거로 쓰는 지금 상황 (지금 보고 있는 시간표, 이수 현황) */
export interface ChatContext {
  admission_year?: number;
  major?: string;
  completed_course_ids?: string[];
  completed_credits?: Record<string, number>;
  section_ids?: string[];
}

export interface ChatRequest {
  message: string;
  conditions: Conditions;
  checklist: ChecklistItem[];
  history: ChatHistoryItem[];
  context?: ChatContext;
}

/** 과목 비교의 한 열 (과목 하나 또는 같은 과목의 교수 한 명) */
export interface CompareLecture {
  lecture_id: string;
  professor: string;
  sections: { section_id: string; times: string; target: string | null }[];
  rating: number | null;
  review_count: number;
  levels: Record<string, { label: string; level: string; source: string }>;
  grading: { 너그러움: number | null; 보통: number | null; 깐깐함: number | null } | null;
  evaluation: string | null;
  teaching: string | null;
  summary: string[];
  match?: { satisfied: number; total: number };
  checklist_eval?: { key: string; label: string; result: 'match' | 'opposite' | 'partial' | 'unknown' }[];
}

export interface CompareColumn {
  name: string;
  course_id?: string;
  found: boolean;
  offered: boolean;
  category?: string | null;
  credits?: number | null;
  lecture: CompareLecture | null;
  other_professors?: string[];
}

export interface CompareResult {
  type: 'result';
  message: string;
  highlights: string[];
  courses: CompareColumn[];
}

/** 교수님이 여러 분인 과목이 있을 때 먼저 고르게 하는 선택지 */
export interface CompareChoiceOption {
  lecture_id: string;
  professor: string;
  times: string;
  rating: number | null;
  review_count: number;
  match?: { satisfied: number; total: number };
  recommended: boolean;
}

export interface CompareChoiceCourse {
  name: string;
  course_id?: string;
  found: boolean;
  offered: boolean;
  category?: string | null;
  credits?: number | null;
  /** 미리 골라 둔 추천 강의 */
  selected: string | null;
  options: CompareChoiceOption[];
}

export interface CompareChoices {
  type: 'choose';
  message: string;
  courses: CompareChoiceCourse[];
}

export interface CompareRequest {
  lecture_ids: string[];
  checklist: ChecklistItem[];
  context?: ChatContext;
}

export interface ChatResponse {
  intent: 'set_preferences' | 'course_review' | 'compare_courses' | 'ask_info' | 'other';
  /** 과목 비교 결과 (intent가 compare_courses일 때) */
  compare?: CompareResult | CompareChoices | null;
  reply: string;
  conditions: Conditions;
  checklist: ChecklistItem[];
  changes: string[];
  unsupported: string[];
  review_target: { course_name: string; professor: string | null } | null;
  /** AI 호출 실패 시 "llm_unavailable" (상태는 그대로 돌아옴) */
  error?: string;
}

export interface StyleRequest {
  style: StyleId;
  previous_style: StyleId;
  checklist: ChecklistItem[];
}

export interface StyleResponse {
  checklist: ChecklistItem[];
}

export interface LectureDetail {
  lecture_id: string;
  course_id: string;
  course: string;
  professor: string;
  category?: Category;
  credits?: number;
  review_count?: number;
  /** 기본 항목 레벨 1~3 (키: assignment, team_project, exam, presentation, attendance) */
  levels: Record<string, number | null>;
  /** 레벨마다 근거 문장 */
  evidence: Record<string, string[]>;
  /** 3줄 요약 */
  summary: string[];
  /** 수강계획서 이미지 주소 */
  syllabus_images: string[];
  /** 이 교수가 여는 분반과 시간 */
  sections?: { section_id: string; times: TimeSlot[] }[];
}

export interface ReviewEval {
  key: string;
  label: string;
  /** level 이면 1~3, toggle 이면 'yes' | 'no' | null */
  value: number | string | null;
  satisfied: boolean | null;
  evidence?: string | null;
}

export interface ReviewSection {
  section_id: string;
  /** "월 10:00-13:00" 또는 이러닝이면 "이러닝(정해진 수업 시간 없음)" */
  times: string;
  target: string | null;
}

export interface ReviewResult {
  rank: number;
  lecture_id: string;
  professor: string;
  /** syllabus: 강의평은 없고 수강계획서 값으로만 평가 */
  status: 'cached' | 'collected' | 'syllabus' | 'not_collected';
  /** 이 교수님의 분반들 ([시간표에 넣기] 버튼용) */
  sections?: ReviewSection[];
  rating?: number | null;
  grading?: { 너그러움: number | null; 깐깐함: number | null } | null;
  /** 체크리스트에서 맞는 항목 이름 (추천 이유) */
  matched?: string[];
  in_catalog: boolean;
  review_count: number;
  levels: Record<string, number | null>;
  summary: string[];
  match: { satisfied: number; total: number };
  checklist_eval: ReviewEval[];
}

export interface OnDemandRequest {
  course_name: string;
  professor: string | null;
  checklist: ChecklistItem[];
}

export interface OnDemandResponse {
  course_name: string;
  course_id?: string | null;
  /** 체크리스트·별점 기준 1위 강의 */
  recommended?: string | null;
  /** 카드로 보여주지 않은 나머지 교수님 */
  more_professors?: string[];
  message: string;
  results: ReviewResult[];
}
