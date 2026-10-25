/**
 * The onboarding in order. The route *is* the step, as in the planning tunnel: the position is
 * read off the path rather than held beside it, so the two cannot disagree and the hardware back
 * button stays right for free.
 *
 * Each part of the app opens on an intro step, a full screen saying which part the next few
 * screens are about, so the flow reads as five short visits rather than one long run.
 *
 * Meeting Cuisko is not in here. It is not a route of this flow but the real assistant sheet over
 * the real home screen, which `finish` resets the stack to.
 */
export const ONBOARDING_STEPS = [
  "promise",
  "groceries-intro",
  "groceries",
  "recipes-intro",
  "recipes",
  "import",
  "plan-intro",
  "plan-recipe",
  "cook-intro",
  "cook",
  "week-intro",
  "week",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The parts of the app the onboarding visits, each opened by its intro step. */
export const SECTIONS = ["groceries", "recipes", "plan", "cook", "week"] as const;

export type Section = (typeof SECTIONS)[number];

/**
 * The part of the flow a step belongs to: the promise on its own, then one of the five sections.
 * What the progress counts, so it moves six times rather than twelve and says where you are.
 */
const SECTION_OF: Record<OnboardingStep, "promise" | Section> = {
  promise: "promise",
  "groceries-intro": "groceries",
  groceries: "groceries",
  "recipes-intro": "recipes",
  recipes: "recipes",
  import: "recipes",
  "plan-intro": "plan",
  "plan-recipe": "plan",
  "cook-intro": "cook",
  cook: "cook",
  "week-intro": "week",
  week: "week",
};

/** The section an intro step opens, or `null` for a step that is not an intro. */
export const introOf = (step: OnboardingStep): Section | null =>
  step.endsWith("-intro") ? (SECTION_OF[step] as Section) : null;

/**
 * Whether a step keeps Continue hidden until its action is done: the hints sent, the questions
 * answered, the gratin planned. There is no way out of the flow but through it, so a step that asks for
 * an action has to be one the user can finish.
 *
 * `false` on the promise, the intros and the import, which ask for nothing: the import is only
 * shown, a screenshot of where recipes come in, since pasting a pretend link taught little.
 */
export const NEEDS_ACTION: Record<OnboardingStep, boolean> = {
  promise: false,
  "groceries-intro": false,
  groceries: true,
  "recipes-intro": false,
  recipes: true,
  import: false,
  "plan-intro": false,
  "plan-recipe": true,
  "cook-intro": false,
  cook: true,
  "week-intro": false,
  week: true,
};

/**
 * Whether the flow may move on from `step`: it asks for nothing, or its action is in `done`.
 *
 * The one gate every way forward goes through. The Continue pill hides itself on the same answer,
 * but a hidden control is a look and not a lock: a pill whose arrow still answered a tap let the
 * whole flow be walked by tapping Continue, which is what this rule refuses at the source.
 */
export const canLeave = (step: OnboardingStep, done: readonly OnboardingStep[]) =>
  !NEEDS_ACTION[step] || done.includes(step);

/** The path a step is reached by. */
export const routeOf = (step: OnboardingStep) => `/onboarding/${step}` as const;

/**
 * The step a path shows, or `null` for a path that is none of them: a sheet pushed over the flow,
 * or a route outside it.
 *
 * The whole route is compared, not its last segment: the real plan-recipe sheet lives at
 * `/plan-recipe`, and would otherwise read as this flow's step of the same name.
 */
export const stepOf = (path: string): OnboardingStep | null =>
  ONBOARDING_STEPS.find((step) => routeOf(step) === path) ?? null;

/** How many parts the progress counts: the promise and the five sections. */
export const PROGRESS_TOTAL = SECTIONS.length + 1;

/** 1-based, the part of the flow the step is in: every step of a section shares its position. */
export const positionOf = (step: OnboardingStep) => {
  const section = SECTION_OF[step];

  return section === "promise" ? 1 : SECTIONS.indexOf(section) + 2;
};

/**
 * The notches the progress bar counts: one per part, plus one lit on arrival, so the promise opens
 * on 1/7 rather than an empty bar.
 */
export const PROGRESS_BAR_TOTAL = PROGRESS_TOTAL + 1;

/**
 * How many notches of the progress are lit on `step`: the one lit on arrival, then one for each
 * part already left behind, so the bar moves as each section is walked out of.
 *
 * The last part has no step after it to be left for, so it counts once its action is done: the bar
 * lands full as the week appears, not on the week's intro two screens before the end.
 */
export const progressOf = (step: OnboardingStep, done: readonly OnboardingStep[]) => {
  const lit = positionOf(step);

  return nextOf(step) === null && canLeave(step, done) ? lit + 1 : lit;
};

/** The step after this one, or `null` past the last: the flow ends in `finish`, not a route. */
export const nextOf = (step: OnboardingStep): OnboardingStep | null =>
  ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1] ?? null;
