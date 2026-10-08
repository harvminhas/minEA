"use client";

import { ASK_EVENT, type AnswerKey } from "./ask-demo-data";

/** Ask the hero demo to run a question (from report tiles and audience cards). */
export function runAskDemo(key: AnswerKey) {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { key } }));
}

type Props = { question: AnswerKey; className?: string; children: React.ReactNode } & (
  | { as: "a"; href: string }
  | { as?: "button" }
);

export function AskTrigger(props: Props) {
  const { question, className, children } = props;
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    runAskDemo(question);
  };
  if (props.as === "a") {
    return (
      <a className={className} href={props.href} data-run={question} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={className} data-run={question} onClick={onClick}>
      {children}
    </button>
  );
}
