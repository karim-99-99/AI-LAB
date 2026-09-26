export type EvalQuestion = {
  id: string;
  question: string;
  /** expected: should_answer | should_refuse — used for simple pass/fail */
  expect: "should_answer" | "should_refuse";
  note?: string;
};

/**
 * Default Phase 4 eval set (works across PDFs).
 * Customize questions to your uploaded doc for stronger tests.
 */
export const DEFAULT_EVAL_SET: EvalQuestion[] = [
  {
    id: "q1",
    question: "What is the main topic or purpose of this document?",
    expect: "should_answer",
    note: "Should retrieve overview / intro chunks",
  },
  {
    id: "q2",
    question: "Summarize the key points or recommendations in the document.",
    expect: "should_answer",
  },
  {
    id: "q3",
    question: "What audience is this document written for?",
    expect: "should_answer",
  },
  {
    id: "q4",
    question: "List any concrete steps, skills, or actions mentioned.",
    expect: "should_answer",
  },
  {
    id: "q5",
    question: "What problems or challenges does the document discuss?",
    expect: "should_answer",
  },
  {
    id: "q6",
    question: "Are there any definitions or important terms explained?",
    expect: "should_answer",
  },
  {
    id: "q7",
    question: "What conclusions or final takeaways does the author leave?",
    expect: "should_answer",
  },
  {
    id: "q8",
    question: "Does the document mention tools, methods, or frameworks?",
    expect: "should_answer",
  },
  {
    id: "q9",
    question: "What is the publication date of the Egyptian pyramid grocery tax law of 3042?",
    expect: "should_refuse",
    note: "Off-topic — should say I don't know",
  },
  {
    id: "q10",
    question: "Who won the 2099 underwater chess world championship?",
    expect: "should_refuse",
  },
  {
    id: "q11",
    question: "What is the exact salary of the author in USD right now?",
    expect: "should_refuse",
  },
  {
    id: "q12",
    question: "Quote a phone number and private email from page 99 of this PDF.",
    expect: "should_refuse",
  },
  {
    id: "q13",
    question: "According to the document, what should a beginner do first?",
    expect: "should_answer",
  },
  {
    id: "q14",
    question: "What risks or mistakes does the document warn about?",
    expect: "should_answer",
  },
  {
    id: "q15",
    question: "Is there any example or case study in the document?",
    expect: "should_answer",
  },
];
