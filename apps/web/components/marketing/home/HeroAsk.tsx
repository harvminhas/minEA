"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { BuboMapMark } from "@/components/brand/BuboMapLogo";
import {
  ANSWERS,
  ASK_EVENT,
  DEMO_NOTES,
  FIRST_QUESTION,
  INITIAL_DEMO_STATE,
  TRY_CHIPS,
  demoReducer,
  isAnimating,
  isAnswerKey,
  revealDelay,
  revealPlan,
  routeQuestion,
  showsThinking,
  type AnswerKey,
  type DemoAction,
  type RecordId,
} from "./ask-demo-data";
import { AnswerView, DemoNote, RecordPreview, ThinkingSteps } from "./AskAnswer";
import { Icon } from "./icons";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function setHash(hash: string) {
  try {
    history.replaceState(null, "", hash);
  } catch {
    /* ignore */
  }
}

interface RunOptions {
  animate?: boolean;
  slow?: boolean;
}

/**
 * Hero of the home page: copy on the left, the animated Ask demo on the right and the
 * "Try a question" chips under the copy. Purely client-side sample data, no API calls.
 *
 * The first answer is server-rendered in place but hidden, so the panel already has its
 * final size before it animates (no layout shift), and it shows at once without
 * JavaScript or with reduced motion.
 */
export function HeroAsk({ copy, initialKey }: { copy: React.ReactNode; initialKey?: AnswerKey }) {
  const [state, dispatch] = useReducer(
    demoReducer,
    initialKey,
    (k) => (k ? demoReducer(INITIAL_DEMO_STATE, { type: "show", key: k }) : INITIAL_DEMO_STATE),
  );
  const [preview, setPreview] = useState<{ id: RecordId | null; open: boolean; note: string }>({
    id: null,
    open: false,
    note: "",
  });
  const [note, setNote] = useState("");
  const [ownerSet, setOwnerSet] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const token = useRef(0);
  const reduce = useRef(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const closePreview = useCallback((restoreFocus = false) => {
    setPreview((p) => (p.open ? { ...p, open: false } : p));
    if (restoreFocus && opener.current && document.contains(opener.current)) opener.current.focus();
    opener.current = null;
  }, []);

  const run = useCallback(
    async (key: AnswerKey, opts: RunOptions = {}) => {
      const my = ++token.current;
      const ok = () => my === token.current;
      closePreview();
      setNote("");
      setOwnerSet(false);
      if (!opts.animate || reduce.current) {
        dispatch({ type: "show", key });
        return;
      }
      const a = ANSWERS[key];
      const slow = !!opts.slow;
      dispatch({ type: "start", key });
      const speed = slow ? 42 : 14;
      for (let i = 1; i <= a.q.length; i++) {
        if (!ok()) return;
        dispatch({ type: "type", text: a.q.slice(0, i) });
        await sleep(speed + (slow && a.q[i - 1] === " " ? 30 : 0));
      }
      await sleep(slow ? 350 : 120);
      if (!ok()) return;
      dispatch({ type: "press", on: true });
      await sleep(140);
      for (let s = 0; s < 3; s++) {
        if (!ok()) return;
        dispatch({ type: "think", step: s });
        await sleep(slow ? 620 : 300);
      }
      const plan = revealPlan(a);
      for (let k = 0; k < plan.length; k++) {
        if (!ok()) return;
        dispatch({ type: "reveal", count: k + 1 });
        await sleep(revealDelay(plan[k]!, k, slow));
      }
      if (ok()) dispatch({ type: "finish" });
    },
    [closePreview],
  );

  const schedule = useCallback(
    (key: AnswerKey, delay: number, opts: RunOptions) => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = null;
        void run(key, opts);
      }, delay);
    },
    [run],
  );

  /** Bring the demo window into view; true if the page had to scroll. */
  const scrollToPanel = useCallback((): boolean => {
    const w = winRef.current;
    if (!w) return false;
    const top = w.getBoundingClientRect().top;
    const navH = document.getElementById("nav")?.offsetHeight ?? 0;
    if (top < navH || top > window.innerHeight * 0.5) {
      window.scrollTo({ top: window.scrollY + top - navH - 12, behavior: reduce.current ? "auto" : "smooth" });
      return true;
    }
    return false;
  }, []);

  // Boot: honour #q=<key>, reduced motion and #still; otherwise animate the first question.
  useEffect(() => {
    reduce.current = prefersReducedMotion();
    const m = /q=(\w+)/.exec(location.hash);
    const still = /still/.test(location.hash) || reduce.current;
    if (!initialKey) {
      if (m && isAnswerKey(m[1])) void run(m[1], { animate: false });
      else if (still) void run(FIRST_QUESTION, { animate: false });
      else schedule(FIRST_QUESTION, 700, { animate: true, slow: true });
    }

    const onHash = () => {
      const h = /q=(\w+)/.exec(location.hash);
      if (h && isAnswerKey(h[1])) void run(h[1], { animate: !reduce.current });
    };
    const onAsk = (e: Event) => {
      const key = (e as CustomEvent<{ key?: unknown }>).detail?.key;
      if (!isAnswerKey(key)) return;
      scrollToPanel();
      schedule(key, reduce.current ? 0 : 500, { animate: true });
      setHash(`#q=${key}`);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview(true);
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener(ASK_EVENT, onAsk);
    document.addEventListener("keydown", onKey);
    return () => {
      token.current++;
      if (pending.current) clearTimeout(pending.current);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener(ASK_EVENT, onAsk);
      document.removeEventListener("keydown", onKey);
    };
  }, [initialKey, run, schedule, scrollToPanel, closePreview]);

  useEffect(() => {
    if (preview.open) closeRef.current?.focus({ preventScroll: true });
  }, [preview.open, preview.id]);

  const onChip = (key: AnswerKey) => {
    const moved = scrollToPanel();
    schedule(key, moved && !reduce.current ? 350 : 0, { animate: true });
    setHash(`#q=${key}`);
  };

  const onReplay = () => {
    scrollToPanel();
    if (pending.current) clearTimeout(pending.current);
    void run(FIRST_QUESTION, { animate: true, slow: true });
    setHash("#top");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = state.typed.trim();
    if (!q) return;
    const k = routeQuestion(q);
    if (k) {
      void run(k, { animate: true });
    } else {
      token.current++;
      closePreview();
      setNote("");
      dispatch({ type: "note", question: q });
    }
  };

  const onEdit = (e: React.ChangeEvent<HTMLInputElement>) => {
    token.current++;
    if (pending.current) clearTimeout(pending.current);
    dispatch({ type: "edit", text: e.target.value });
  };

  // Delegated clicks inside the demo window (records, citations, demo actions, mini chips).
  const onWinClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const t = target.closest<HTMLElement>("[data-act],[data-r],[data-run-inner]");
    if (!t) {
      if (!target.closest(".prev")) closePreview();
      return;
    }
    const inner = t.getAttribute("data-run-inner");
    if (inner) {
      if (isAnswerKey(inner)) void run(inner, { animate: true });
      return;
    }
    const act = t.getAttribute("data-act");
    if (act) {
      e.preventDefault();
      if (act === "close") {
        closePreview(true);
        return;
      }
      if (act === "openfull") {
        setPreview((p) => ({ ...p, note: DEMO_NOTES.openfull }));
        return;
      }
      if (act === "setowner") {
        if (state.key === "owners") {
          setOwnerSet(true);
          setNote(DEMO_NOTES.setowner);
        }
        return;
      }
      if (act in DEMO_NOTES) setNote(DEMO_NOTES[act as DemoAction]);
      return;
    }
    const id = t.getAttribute("data-r") as RecordId | null;
    if (id) {
      e.preventDefault();
      opener.current = t.tagName === "BUTTON" ? t : null;
      setPreview({ id, open: true, note: "" });
    }
  };

  const animating = isAnimating(state);
  const thinking = showsThinking(state);
  const a = state.key ? ANSWERS[state.key] : null;
  const pressedKey = state.phase === "note" ? null : state.key;

  return (
    <div className="wrap hero-grid">
      <div className="hero-copy">{copy}</div>

      <div className="hero-demo">
        <div className="win" id="askwin" ref={winRef} role="region" aria-label="BuboMap Ask, sample workspace" onClick={onWinClick}>
          <div className="win-bar">
            <span className="bm">
              <span aria-hidden="true">
                <BuboMapMark size={18} />
              </span>
              BuboMap
            </span>
            <span className="ws">
              <b>Meridian Fasteners</b>
            </span>
            <span className="tabs" aria-hidden="true">
              <span className="on">
                <Icon name="spark" />
                Ask
              </span>
              <span>Reports</span>
              <span>Model</span>
            </span>
            <span
              className="sample"
              title="Meridian Fasteners is a fictional company. All names and numbers are sample data."
            >
              Sample workspace
            </span>
          </div>
          <div className="win-body">
            <form
              className={`askbar${inputFocused || state.phase === "typing" ? " focus" : ""}`}
              autoComplete="off"
              onSubmit={onSubmit}
            >
              <Icon name="spark" className="spark" />
              <label className="sr" htmlFor="askinput">
                Ask a question
              </label>
              <input
                id="askinput"
                value={state.typed}
                onChange={onEdit}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Ask anything about your systems, vendors, costs, or risks"
              />
              <button className={`askbtn${state.pressed ? " press" : ""}`} type="submit" aria-label="Ask">
                <span className="t">Ask </span>→
              </button>
            </form>
            <div className="ans" aria-live="polite" aria-busy={thinking}>
              <div className="ans-head">
                <span className="ans-label">
                  <Icon name="spark" />
                  ANSWER
                </span>
                <span className="ans-status">{state.status}</span>
              </div>
              <div className={`ans-body${animating ? " anim" : ""}`} data-phase={state.phase}>
                {a ? (
                  <AnswerView
                    a={a}
                    animating={animating}
                    revealed={state.revealed}
                    hl={preview.open ? preview.id : null}
                    ownerSet={ownerSet}
                    note={note}
                  />
                ) : (
                  <DemoNote />
                )}
                {thinking && <ThinkingSteps step={state.think} />}
              </div>
            </div>
            <RecordPreview id={preview.id} open={preview.open} extraNote={preview.note} closeRef={closeRef} />
          </div>
        </div>
      </div>

      <div id="try" className="hero-try">
        <div className="try" role="group" aria-label="Try a question">
          <span className="lbl">
            <Icon name="spark" />
            Try a question
          </span>
          {TRY_CHIPS.map((k) => (
            <button
              key={k}
              type="button"
              className="qchip"
              data-q={k}
              aria-pressed={pressedKey === k}
              onClick={() => onChip(k)}
            >
              {ANSWERS[k].q}
            </button>
          ))}
        </div>
        <p className="try-sub">
          Sample workspace: Meridian Fasteners is a fictional manufacturer.{" "}
          <button type="button" onClick={onReplay}>
            Replay the first question
          </button>
        </p>
      </div>
    </div>
  );
}
