import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../state/store';
import { ChooseCard, CompareCards, ReviewCards } from './ChatCards';
import { Send } from './icons';

export function ChatPanel({ className }: { className: string }) {
  const { s, act } = useApp();
  const [text, setText] = useState('');
  // 윗선 손잡이를 위로 끈 만큼(px) 챗봇이 추천 시간표 위로 덮이며 커진다 (시간표는 밀리지 않음)
  const [extra, setExtra] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; start: number; max: number } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.msgs, s.chatBusy]);

  /** 위로 늘릴 수 있는 최대치: 추천 시간표 칸 맨 위까지 */
  const maxExtra = () => {
    const chat = sectionRef.current?.getBoundingClientRect();
    const table = document.querySelector('.p-table')?.getBoundingClientRect();
    return chat && table ? Math.max(0, chat.top + extra - table.top) : 0;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, start: extra, max: maxExtra() };
    document.body.classList.add('resizing');
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setExtra(Math.round(Math.min(d.max, Math.max(0, d.start + (d.y - e.clientY)))));
  };
  const onUp = () => {
    drag.current = null;
    document.body.classList.remove('resizing');
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.key === 'ArrowUp' ? 40 : -40;
      setExtra((v) => Math.min(maxExtra(), Math.max(0, v + step)));
    } else if (e.key === 'Home') setExtra(0);
  };

  const send = (v: string) => {
    const t = v.trim();
    if (!t || s.chatBusy) return;
    setText('');
    act.send(t);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  const waitingReply = s.chatBusy && !s.msgs.some((m) => m.kind === 'loading');

  return (
    <section
      ref={sectionRef}
      className={`card chat-card ${className}${extra > 0 ? ' raised' : ''}`}
      aria-labelledby="h-chat"
      // 음수 위 여백만큼 칸이 위로 늘어나 시간표 위에 겹친다
      style={extra > 0 ? { marginTop: -extra } : undefined}
    >
      <div
        className="chat-grip"
        role="separator"
        aria-orientation="horizontal"
        aria-label="챗봇 높이 조절 (위아래로 끌기, 두 번 누르면 원래 크기)"
        aria-valuenow={extra}
        aria-valuemin={0}
        tabIndex={0}
        title="위아래로 끌어서 크기 조절 · 두 번 누르면 원래 크기"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => setExtra(0)}
        onKeyDown={onKey}
      >
        <span />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 id="h-chat">AI 챗봇</h2>
        <span className="sub">말한 조건은 시간표 조건과 체크리스트에 들어가요</span>
      </div>

      <div ref={logRef} className="scroll chat-log" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 2 }} aria-live="polite">
        {s.msgs.map((m) =>
          m.kind === 'reviews' && m.reviews ? (
            <ReviewCards key={m.id} data={m.reviews} />
          ) : m.kind === 'compare' && m.compare ? (
            <CompareCards key={m.id} data={m.compare} text={m.text} />
          ) : m.kind === 'choose' && m.choices ? (
            <ChooseCard key={m.id} data={m.choices} text={m.text} />
          ) : m.kind === 'loading' ? (
            <div key={m.id} className="bubble bot load" role="status">
              <span className="spinner" />
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`bubble ${m.role === 'user' ? 'me' : 'bot'}${m.kind === 'error' ? ' err' : ''}`}>
              {m.text}
            </div>
          )
        )}
        {waitingReply && (
          <div className="bubble bot load" role="status">
            <span className="spinner" />
            생각하는 중…
          </div>
        )}
      </div>

      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          name="q"
          type="text"
          autoComplete="off"
          aria-label="AI 챗봇에 보낼 메시지"
          placeholder="예: 수요일 공강이고 팀플은 적게 해줘"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit" className="btn btn-primary" disabled={s.chatBusy || !text.trim()} style={{ minHeight: 44, borderRadius: 12 }}>
          <Send />
          보내기
        </button>
      </form>
    </section>
  );
}
