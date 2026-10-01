/**
 * 모의 서버용 가상 데이터 (학과·과목·교수·수강평 모두 가상).
 * 실제 서버가 올라오면 쓰이지 않는다. 형식은 문서의 data/seed/*.json 과 같은 필드를 따른다.
 */
import type { Category, Day, Meta, Requirements, TimeSlot, TranscriptCourse } from '../api/types';
import { BASE_ITEMS, SHAPE_ITEMS } from '../lib/constants';

export interface CatalogSection {
  section_id: string;
  professor: string;
  times: TimeSlot[];
}

export interface CatalogCourse {
  course_id: string;
  name: string;
  category: Category;
  credits: number;
  /** 개설 학과 (교양은 'all') */
  dept: 'cse' | 'biz' | 'all';
  sections: CatalogSection[];
}

const T = (day: Day, start: string, end: string): TimeSlot => ({ day, start, end });

let secNo = 0;
const C = (
  course_id: string,
  name: string,
  category: Category,
  credits: number,
  dept: CatalogCourse['dept'],
  secs: [string, TimeSlot[]][]
): CatalogCourse => {
  secNo = 0;
  return {
    course_id,
    name,
    category,
    credits,
    dept,
    sections: secs.map(([professor, times]) => ({ section_id: `${course_id}-${String(++secNo).padStart(2, '0')}`, professor, times }))
  };
};

export const CATALOG: CatalogCourse[] = [
  // 컴퓨터공학과 전공필수
  C('CSE2010', '자료구조', '전필', 3, 'cse', [['김서연', [T('월', '10:30', '12:00'), T('수', '10:30', '12:00')]], ['이정민', [T('화', '13:00', '14:30'), T('목', '13:00', '14:30')]]]),
  C('CSE2020', '컴퓨터구조', '전필', 3, 'cse', [['박도윤', [T('월', '13:00', '14:30'), T('수', '13:00', '14:30')]], ['최하은', [T('화', '09:00', '10:30'), T('목', '09:00', '10:30')]]]),
  C('CSE3010', '알고리즘', '전필', 3, 'cse', [['이정민', [T('화', '10:30', '12:00'), T('목', '10:30', '12:00')]], ['김서연', [T('월', '15:00', '16:30'), T('수', '15:00', '16:30')]]]),
  C('CSE3030', '운영체제', '전필', 3, 'cse', [['박도윤', [T('월', '15:00', '17:00'), T('수', '15:00', '16:00')]], ['최하은', [T('목', '14:00', '16:00'), T('금', '14:00', '15:00')]]]),
  C('CSE3040', '데이터베이스', '전필', 3, 'cse', [['이정민', [T('월', '09:00', '10:30'), T('수', '09:00', '10:30')]], ['한지우', [T('화', '15:00', '16:30'), T('목', '15:00', '16:30')]]]),
  C('CSE3050', '컴퓨터네트워크', '전필', 3, 'cse', [['정민호', [T('화', '13:00', '14:30'), T('목', '13:00', '14:30')]], ['정민호', [T('수', '13:00', '14:30'), T('금', '13:00', '14:30')]]]),
  C('CSE4010', '소프트웨어공학', '전필', 3, 'cse', [['김서연', [T('화', '09:00', '10:30'), T('목', '09:00', '10:30')]], ['박도윤', [T('수', '10:30', '12:00'), T('금', '10:30', '12:00')]]]),
  C('CSE4090', '캡스톤디자인', '전필', 3, 'cse', [['한지우', [T('금', '13:00', '16:00')]]]),
  // 컴퓨터공학과 전공선택
  C('CSE3110', '웹프로그래밍', '전선', 3, 'cse', [['한지우', [T('월', '13:00', '14:30'), T('수', '13:00', '14:30')]], ['한지우', [T('화', '16:30', '18:00'), T('목', '16:30', '18:00')]]]),
  C('CSE3120', '모바일앱개발', '전선', 3, 'cse', [['오세린', [T('화', '10:30', '12:00'), T('목', '10:30', '12:00')]]]),
  C('CSE3130', '머신러닝', '전선', 3, 'cse', [['최하은', [T('월', '10:30', '12:00'), T('수', '10:30', '12:00')]], ['최하은', [T('화', '15:00', '16:30'), T('목', '15:00', '16:30')]]]),
  C('CSE3140', '컴퓨터그래픽스', '전선', 3, 'cse', [['정민호', [T('월', '16:30', '18:00'), T('수', '16:30', '18:00')]]]),
  C('CSE4110', '클라우드컴퓨팅', '전선', 3, 'cse', [['이정민', [T('금', '09:00', '12:00')]]]),
  C('CSE4120', '정보보안', '전선', 3, 'cse', [['박도윤', [T('화', '13:00', '14:30'), T('목', '13:00', '14:30')]]]),
  C('CSE4130', '인공지능', '전선', 3, 'cse', [['오세린', [T('월', '09:00', '10:30'), T('수', '09:00', '10:30')]], ['김서연', [T('화', '15:00', '16:30'), T('목', '15:00', '16:30')]]]),
  C('CSE4140', '컴파일러', '전선', 3, 'cse', [['정민호', [T('금', '14:00', '17:00')]]]),
  // 경영학과 전공필수
  C('BUS2010', '회계원리', '전필', 3, 'biz', [['윤서하', [T('월', '09:00', '10:30'), T('수', '09:00', '10:30')]], ['윤서하', [T('화', '13:00', '14:30'), T('목', '13:00', '14:30')]]]),
  C('BUS2020', '경영통계', '전필', 3, 'biz', [['강태오', [T('화', '10:30', '12:00'), T('목', '10:30', '12:00')]], ['강태오', [T('월', '15:00', '16:30'), T('수', '15:00', '16:30')]]]),
  C('BUS3010', '마케팅관리', '전필', 3, 'biz', [['서지안', [T('월', '13:00', '14:30'), T('수', '13:00', '14:30')]]]),
  C('BUS3020', '재무관리', '전필', 3, 'biz', [['임도현', [T('화', '09:00', '10:30'), T('목', '09:00', '10:30')]], ['임도현', [T('수', '10:30', '12:00'), T('금', '10:30', '12:00')]]]),
  C('BUS3030', '인사관리', '전필', 3, 'biz', [['서지안', [T('화', '15:00', '16:30'), T('목', '15:00', '16:30')]]]),
  C('BUS3040', '생산운영관리', '전필', 3, 'biz', [['강태오', [T('금', '13:00', '16:00')]]]),
  // 경영학과 전공선택
  C('BUS3110', '소비자행동', '전선', 3, 'biz', [['서지안', [T('월', '10:30', '12:00'), T('수', '10:30', '12:00')]]]),
  C('BUS3120', '투자론', '전선', 3, 'biz', [['임도현', [T('화', '13:00', '14:30'), T('목', '13:00', '14:30')]]]),
  C('BUS3130', '경영정보시스템', '전선', 3, 'biz', [['강태오', [T('월', '16:30', '18:00'), T('수', '16:30', '18:00')]]]),
  C('BUS4110', '국제경영', '전선', 3, 'biz', [['윤서하', [T('화', '10:30', '12:00'), T('목', '10:30', '12:00')]]]),
  C('BUS4120', '창업경영', '전선', 3, 'biz', [['서지안', [T('금', '09:00', '12:00')]]]),
  C('BUS4130', '디지털마케팅', '전선', 3, 'biz', [['서지안', [T('화', '16:30', '18:00'), T('목', '16:30', '18:00')]]]),
  // 교양
  C('GEN1010', '글쓰기와표현', '교필', 2, 'all', [['정수아', [T('화', '12:00', '14:00')]], ['정수아', [T('목', '12:00', '14:00')]]]),
  C('GEN1020', '영어커뮤니케이션', '교필', 2, 'all', [['문하린', [T('월', '12:00', '13:00'), T('수', '12:00', '13:00')]], ['문하린', [T('화', '12:00', '13:00'), T('목', '12:00', '13:00')]]]),
  C('GEN1030', '진로설계', '교필', 1, 'all', [['김도경', [T('금', '12:00', '13:00')]]]),
  C('GEN2010', '철학의이해', '교선', 2, 'all', [['오민재', [T('목', '16:00', '18:00')]]]),
  C('GEN2020', '현대사회와경제', '교선', 2, 'all', [['윤서하', [T('수', '16:00', '18:00')]]]),
  C('GEN2030', '영화로읽는문화', '교선', 2, 'all', [['배유나', [T('금', '13:00', '15:00')]], ['배유나', [T('화', '16:00', '18:00')]]]),
  C('GEN2040', '심리학개론', '교선', 3, 'all', [['배유나', [T('월', '10:30', '12:00'), T('수', '10:30', '12:00')]], ['배유나', [T('화', '13:00', '14:30'), T('목', '13:00', '14:30')]]]),
  C('GEN2050', '생활속의통계', '교선', 2, 'all', [['강태오', [T('월', '14:30', '16:30')]]]),
  C('GEN2060', '글로벌문화탐방', '교선', 2, 'all', [['문하린', [T('금', '10:00', '12:00')]]]),
  C('GEN2070', '음악의이해', '교선', 2, 'all', [['오민재', [T('목', '09:00', '11:00')]]]),
  C('GEN2080', '스포츠와건강', '교선', 1, 'all', [['김도경', [T('수', '14:00', '16:00')]]])
];

export const MAJORS = [
  { id: 'cse', name: '컴퓨터공학과', supported: true },
  { id: 'biz', name: '경영학과', supported: true },
  { id: 'sw', name: '소프트웨어학과', supported: false },
  { id: 'ee', name: '전기전자공학과', supported: false },
  { id: 'mech', name: '기계공학과', supported: false },
  { id: 'econ', name: '경제학과', supported: false },
  { id: 'media', name: '미디어커뮤니케이션학과', supported: false },
  { id: 'design', name: '산업디자인학과', supported: false }
];

export const META: Meta = {
  semester: '2026학년도 2학기',
  admission_years: [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year) => ({ year, supported: year >= 2023 })),
  majors: MAJORS,
  styles: [
    { id: 'graduation', name: '졸업 요건 우선', items: [] },
    {
      id: 'late_riser',
      name: '늦잠 우선',
      items: [
        { key: 'first_period', label: '1교시 수업', type: 'level', level: 'low' },
        { key: 'attendance', label: '출석 체크', type: 'level', level: 'low' }
      ]
    },
    {
      id: 'club',
      name: '동아리 활동 우선',
      items: [
        { key: 'assignment', label: '과제량', type: 'level', level: 'low' },
        { key: 'team_project', label: '팀플', type: 'level', level: 'low' }
      ]
    },
    {
      id: 'career',
      name: '취업 준비 우선',
      items: [
        { key: 'assignment', label: '과제량', type: 'level', level: 'low' },
        { key: 'exam', label: '시험 횟수', type: 'level', level: 'low' }
      ]
    },
    {
      id: 'commute',
      name: '통학 편의 우선',
      items: [
        { key: 'first_period', label: '1교시 수업', type: 'level', level: 'low' },
        { key: 'gap', label: '우주공강', type: 'level', level: 'low' }
      ]
    }
  ],
  base_items: [...BASE_ITEMS, ...SHAPE_ITEMS].map((b) => ({ ...b, type: 'level' as const })),
  levels: { low: '적음', mid: '보통', high: '많음' }
};

/** 예전 학기에 들었던 과목 (성적표에만 나옴) */
const PAST: Record<'cse' | 'biz', TranscriptCourse[]> = {
  cse: [
    { course_id: 'CSE1010', name: '컴퓨터프로그래밍1', category: '전필', credits: 3, grade: 'A0' },
    { course_id: 'CSE1020', name: '컴퓨터프로그래밍2', category: '전필', credits: 3, grade: 'B+' },
    { course_id: 'CSE1030', name: '이산수학', category: '전필', credits: 3, grade: 'A+' },
    { course_id: 'CSE2010', name: '자료구조', category: '전필', credits: 3, grade: 'B0' },
    { course_id: 'CSE2020', name: '컴퓨터구조', category: '전필', credits: 3, grade: 'A0' },
    { course_id: 'CSE2030', name: '객체지향프로그래밍', category: '전필', credits: 3, grade: 'A+' },
    { course_id: 'CSE2110', name: '리눅스시스템', category: '전선', credits: 3, grade: 'B+' },
    { course_id: 'CSE2120', name: '디지털논리회로', category: '전선', credits: 3, grade: 'A0' },
    { course_id: 'CSE2130', name: '파이썬데이터분석', category: '전선', credits: 3, grade: 'A+' },
    { course_id: 'CSE2140', name: '오픈소스SW', category: '전선', credits: 3, grade: 'B0' },
    { course_id: 'CSE2150', name: '선형대수', category: '전선', credits: 3, grade: 'C+' },
    { course_id: 'CSE2160', name: '확률과통계', category: '전선', credits: 3, grade: 'B+' },
    { course_id: 'CSE2170', name: '시스템프로그래밍', category: '전선', credits: 3, grade: 'A0' }
  ],
  biz: [
    { course_id: 'BUS1010', name: '경영학원론', category: '전필', credits: 3, grade: 'A0' },
    { course_id: 'BUS1020', name: '경제학원론', category: '전필', credits: 3, grade: 'B+' },
    { course_id: 'BUS2010', name: '회계원리', category: '전필', credits: 3, grade: 'A+' },
    { course_id: 'BUS2030', name: '조직행동론', category: '전필', credits: 3, grade: 'B0' },
    { course_id: 'BUS2110', name: '중급회계', category: '전선', credits: 3, grade: 'B+' },
    { course_id: 'BUS2120', name: '경영과학', category: '전선', credits: 3, grade: 'A0' },
    { course_id: 'BUS2130', name: '원가회계', category: '전선', credits: 3, grade: 'B0' },
    { course_id: 'BUS2140', name: '비즈니스커뮤니케이션', category: '전선', credits: 3, grade: 'A+' },
    { course_id: 'BUS2150', name: '경영수학', category: '전선', credits: 3, grade: 'C+' },
    { course_id: 'BUS2160', name: '서비스경영', category: '전선', credits: 3, grade: 'B+' },
    { course_id: 'BUS2170', name: '경영윤리', category: '전선', credits: 3, grade: 'A0' },
    { course_id: 'BUS2180', name: '기업과사회', category: '전선', credits: 3, grade: 'B+' },
    { course_id: 'BUS2190', name: '물류관리', category: '전선', credits: 3, grade: 'A0' }
  ]
};

const GEN_PAST: TranscriptCourse[] = [
  { course_id: 'GEN1010', name: '글쓰기와표현', category: '교필', credits: 2, grade: 'A0' },
  { course_id: 'GEN1040', name: '대학생활과리더십', category: '교필', credits: 2, grade: 'P' },
  { course_id: 'GEN1050', name: '컴퓨팅사고', category: '교필', credits: 3, grade: 'A+' },
  { course_id: 'GEN1060', name: '기초영어', category: '교필', credits: 2, grade: 'B+' },
  { course_id: 'GEN3010', name: '세계사의이해', category: '교선', credits: 3, grade: 'A0' },
  { course_id: 'GEN3020', name: '과학기술과사회', category: '교선', credits: 3, grade: 'B+' },
  { course_id: 'GEN3030', name: '한국문학산책', category: '교선', credits: 3, grade: 'A+' },
  { course_id: 'GEN3040', name: '미술감상', category: '교선', credits: 2, grade: 'P' },
  { course_id: 'GEN3050', name: '법과생활', category: '교선', credits: 3, grade: 'B0' },
  { course_id: 'GEN3060', name: '환경과인간', category: '교선', credits: 3, grade: 'A0' },
  { course_id: 'GEN3070', name: '창의적사고', category: '교선', credits: 2, grade: 'A+' },
  { course_id: 'GEN3080', name: '요가와명상', category: '교선', credits: 1, grade: 'P' },
  { course_id: 'GEN3090', name: '중국어회화', category: '교선', credits: 2, grade: 'B+' },
  { course_id: 'GEN3100', name: '역사속의과학', category: '교선', credits: 3, grade: 'A0' },
  { course_id: 'GEN3110', name: '사진의이해', category: '교선', credits: 2, grade: 'F' },
  { course_id: 'GEN3120', name: '봉사와나눔', category: '교선', credits: 1, grade: 'NP' }
];

/** 샘플 성적표 (F·NP 과목도 들어 있고, 파싱 결과에서는 빠진다) */
export const SAMPLE_TRANSCRIPT = (major: 'cse' | 'biz'): TranscriptCourse[] => [...PAST[major], ...GEN_PAST, { course_id: 'GEN3130', name: '논리와비판적사고', category: '교선', credits: 3, grade: 'B0' }, { course_id: 'GEN3140', name: '경제와생활', category: '교선', credits: 3, grade: 'A0' }, { course_id: 'GEN3150', name: '데이터리터러시', category: '교선', credits: 2, grade: 'A+' }, { course_id: 'GEN3160', name: '근대미술사', category: '교선', credits: 2, grade: 'B+' }, { course_id: 'GEN3170', name: '생활법률', category: '교선', credits: 2, grade: 'A0' }];

export function requirementsFor(year: number, major: string): Requirements | null {
  if (year < 2023 || year > 2026 || (major !== 'cse' && major !== 'biz')) return null;
  const newer = year >= 2025;
  if (major === 'cse') {
    return {
      admission_year: year,
      major,
      categories: [
        { category: '전필', required: newer ? 39 : 36 },
        { category: '전선', required: 42 },
        { category: '교필', required: 12 },
        { category: '교선', required: 24 }
      ],
      required_courses: [
        ['CSE1010', '컴퓨터프로그래밍1', 3],
        ['CSE1020', '컴퓨터프로그래밍2', 3],
        ['CSE2010', '자료구조', 3],
        ['CSE2020', '컴퓨터구조', 3],
        ['CSE3010', '알고리즘', 3],
        ['CSE3030', '운영체제', 3],
        ['CSE3040', '데이터베이스', 3],
        ['CSE3050', '컴퓨터네트워크', 3],
        ['CSE4010', '소프트웨어공학', 3],
        ...(newer ? [['CSE4090', '캡스톤디자인', 3] as [string, string, number]] : [])
      ]
        .map(([course_id, name, credits]) => ({ course_id: String(course_id), name: String(name), category: '전필' as Category, credits: Number(credits) }))
        .concat([
          { course_id: 'GEN1010', name: '글쓰기와표현', category: '교필', credits: 2 },
          { course_id: 'GEN1020', name: '영어커뮤니케이션', category: '교필', credits: 2 }
        ])
    };
  }
  return {
    admission_year: year,
    major,
    categories: [
      { category: '전필', required: 30 },
      { category: '전선', required: newer ? 45 : 42 },
      { category: '교필', required: 12 },
      { category: '교선', required: 24 }
    ],
    required_courses: [
      { course_id: 'BUS1010', name: '경영학원론', category: '전필', credits: 3 },
      { course_id: 'BUS2010', name: '회계원리', category: '전필', credits: 3 },
      { course_id: 'BUS2020', name: '경영통계', category: '전필', credits: 3 },
      { course_id: 'BUS3010', name: '마케팅관리', category: '전필', credits: 3 },
      { course_id: 'BUS3020', name: '재무관리', category: '전필', credits: 3 },
      { course_id: 'BUS3030', name: '인사관리', category: '전필', credits: 3 },
      { course_id: 'BUS3040', name: '생산운영관리', category: '전필', credits: 3 },
      { course_id: 'GEN1010', name: '글쓰기와표현', category: '교필', credits: 2 },
      { course_id: 'GEN1020', name: '영어커뮤니케이션', category: '교필', credits: 2 }
    ]
  };
}

/** 문자열 -> 0 이상 정수 (같은 입력이면 같은 값, 시연 재현성) */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 강의(과목×교수) id */
export const lectureId = (courseId: string, professor: string) => `${courseId}-${professor}`;

/** 배치 분석해 둔 강의만 있다고 가정 (나머지는 온디맨드로 "수집") */
export const inBatch = (lid: string) => hash(lid) % 4 !== 0;

/** 강의별 기본 항목 레벨 1~3 */
export function baseLevels(lid: string): Record<string, number> {
  const out: Record<string, number> = {};
  BASE_ITEMS.forEach((b) => {
    out[b.key] = (hash(`${lid}:${b.key}`) % 3) + 1;
  });
  return out;
}

const EVIDENCE: Record<string, [string, string, string]> = {
  assignment: ['과제가 거의 없고 수업 시간에 끝나는 활동 위주예요.', '격주로 과제가 있는데 분량은 무난한 편이에요.', '매주 과제가 나오고 시간이 꽤 걸려요.'],
  team_project: ['팀플 없이 개인 과제로만 평가해요.', '학기 말에 짧은 조별 활동이 한 번 있어요.', '학기 내내 팀 프로젝트로 진행돼요.'],
  exam: ['시험 없이 과제와 출석으로 평가해요.', '중간·기말 두 번 시험이 있어요.', '중간·기말에 쪽지시험이 자주 있어요.'],
  presentation: ['발표는 없어요.', '학기 중 한 번 발표가 있어요.', '팀별 발표가 여러 번 있어요.'],
  attendance: ['출석을 거의 부르지 않아요.', '전자출결로 가끔 확인해요.', '매 시간 호명으로 출석을 꼼꼼히 확인해요.']
};

export function evidenceFor(lid: string, levels: Record<string, number>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  BASE_ITEMS.forEach((b) => {
    const v = levels[b.key];
    const n = 21 + (hash(`${lid}:${b.key}:n`) % 30);
    out[b.key] = [`"${EVIDENCE[b.key][v - 1]}"`, `수강평 ${n}개 중 다수가 비슷하게 말해요.`];
  });
  return out;
}

export function summaryFor(lid: string, levels: Record<string, number>): string[] {
  const h = hash(lid);
  const a = ['설명이 차근차근하고 질문을 잘 받아 주세요', '진도가 빠르지만 자료가 잘 정리돼 있어요', '실습 위주라 손으로 익히기 좋아요'][h % 3];
  const b = levels.assignment >= 3 ? '과제가 매주 있어 시간 관리가 필요해요' : levels.assignment === 2 ? '과제는 격주, 난이도는 무난해요' : '과제 부담이 적은 편이에요';
  const c = levels.exam >= 3 ? '시험 비중이 커서 미리 준비하는 게 좋아요' : levels.team_project >= 3 ? '팀 프로젝트 비중이 커요' : '성적은 비교적 너그럽게 주는 편이에요';
  return [a, b, c];
}

/** 자유 항목 판정 (모의: 강의×항목 해시로 정한다) */
export function customLevel(lid: string, key: string): number | null {
  const v = hash(`${lid}|${key}`) % 4;
  return v === 0 ? null : v;
}
export function customToggle(lid: string, key: string): 'yes' | 'no' | null {
  const v = hash(`${lid}|${key}`) % 5;
  return v === 0 ? null : v === 1 ? 'no' : 'yes';
}

/** 수강계획서 이미지 (모의: SVG 를 data URL 로 만든다) */
export function syllabusImage(course: string, professor: string, credits: number): string {
  const rows = ['수업 목표', '주차별 계획', '평가 방법', '교재'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420">
<rect width="600" height="420" fill="#fff"/><rect x="0.5" y="0.5" width="599" height="419" fill="none" stroke="#CBD2E3"/>
<text x="30" y="48" font-family="sans-serif" font-size="22" font-weight="700" fill="#121826">${course} 수강계획서</text>
<text x="30" y="76" font-family="sans-serif" font-size="14" fill="#566079">담당 ${professor} · ${credits}학점 · 2026학년도 2학기 (샘플 이미지)</text>
${rows
  .map(
    (r, i) => `<rect x="30" y="${100 + i * 74}" width="540" height="62" rx="6" fill="#F3F5FA"/>
<text x="46" y="${126 + i * 74}" font-family="sans-serif" font-size="14" font-weight="700" fill="#121826">${r}</text>
<rect x="46" y="${138 + i * 74}" width="${300 + ((i * 97) % 180)}" height="8" rx="4" fill="#E1E5EF"/>`
  )
  .join('')}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
