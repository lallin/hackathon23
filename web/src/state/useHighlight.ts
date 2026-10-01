import { useEffect, useState } from 'react';
import type { LectureDetail } from '../api/types';
import { LEVEL_NUM, toMin } from '../lib/constants';
import { useApp } from './store';

// 강의 상세(과목별 과제량 등 레벨)는 한 번 받으면 다시 묻지 않는다
const cache = new Map<string, Promise<LectureDetail | null>>();

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
      // "교선 과목 N개": 이수구분으로 바로 고른다
      const cat = h.key.slice(6);
      done(sections.map((x) => (x.category === cat ? x.section_id : null)));
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
