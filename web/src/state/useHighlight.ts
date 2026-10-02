import { useEffect, useState } from 'react';
import type { LectureDetail } from '../api/types';
import { LEVEL_NUM, toMin } from '../lib/constants';
import { useApp } from './store';

// 강의 상세(과목별 과제량 등 레벨)는 한 번 받으면 다시 묻지 않는다
const cache = new Map<string, Promise<LectureDetail | null>>();

// 개수형 항목의 영역 → 셀 이수구분. 서버 app/checklist.py의 COUNT_GROUPS와 같다 ("교양" = 교필 + 교선)
const COUNT_GROUPS: Record<string, string[]> = { 전공: ['전필', '전선'], 교양: ['교필', '교선'] };

/** 체크리스트에서 고른 값(예: 과제량 적음)에 맞는 지금 조합의 분반 id 들 */
export function useHighlighted(): Set<string> {
  const { s, api, current } = useApp();
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const h = s.highlight;
    if (!h || !current || !api) {
      setIds(new Set());
      return;
    }
    let alive = true;
    const done = (list: (string | null)[]) => {
      if (alive) setIds(new Set(list.filter((x): x is string => !!x)));
    };
    const sections = current.sections;

    if (h.key.startsWith('count:')) {
      // "교양 과목 N개": 영역에 속한 이수구분(교양 → 교필·교선)의 과목을 고른다
      const group = h.key.slice(6);
      const cats = COUNT_GROUPS[group] ?? [group];
      done(sections.map((x) => (cats.includes(x.category) ? x.section_id : null)));
    } else if (h.key === 'first_period') {
      // 1교시(10시 전 시작) 수업이 있는 과목
      done(sections.map((x) => (x.times.some((t) => toMin(t.start) < 10 * 60) ? x.section_id : null)));
    } else if (h.value in LEVEL_NUM) {
      const want = LEVEL_NUM[h.value as keyof typeof LEVEL_NUM];
      Promise.all(
        sections.map(async (x) => {
          let p = cache.get(x.lecture_id);
          if (!p) {
            p = api.lecture(x.lecture_id).catch(() => null);
            cache.set(x.lecture_id, p);
          }
          const d = await p;
          return d && d.levels[h.key] === want ? x.section_id : null;
        })
      ).then(done);
    } else {
      setIds(new Set());
    }
    return () => {
      alive = false;
    };
  }, [s.highlight, current, api]);

  return ids;
}
