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
  categories: { category: Category; required: number }[];
  required_courses: { course_id: string; name: string; category: Category; credits: number }[];
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
  graduation_after?: { category: Category; done: number; this_semester: number; required: number }[];
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

export interface ChatRequest {
  message: string;
  conditions: Conditions;
  checklist: ChecklistItem[];
  history: ChatHistoryItem[];
}

export interface ChatResponse {
  intent: 'set_preferences' | 'course_review' | 'other';
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
}

export interface ReviewEval {
  key: string;
  label: string;
  /** level 이면 1~3, toggle 이면 'yes' | 'no' | null */
  value: number | string | null;
  satisfied: boolean | null;
  evidence?: string | null;
}

export interface ReviewResult {
  rank: number;
  lecture_id: string;
  professor: string;
  status: 'cached' | 'collected' | 'not_collected';
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
  message: string;
  results: ReviewResult[];
}
