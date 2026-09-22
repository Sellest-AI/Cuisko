import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "@convex/env";

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
});

const DEEPSEEK_V4_FLASH_0731 = openrouter.chat("deepseek/deepseek-v4-flash-0731");
const DEEPSEEK_V4_FLASH_0731_OPTIONS = {
  providerOptions: ({ effort }: { effort?: false | "low" | "max" }) => ({
    openrouter: {
      reasoning: effort ? { enabled: true, effort } : { enabled: false },
      provider: {
        sort: "price",
        ignore: ["open-inference", "morph", "digitalocean", "baidu"],
        allow_fallbacks: true
      }
    }
  })
}

/**
 * Not used for now. Was the previous model for recipes.
 * A bit less accurate than OPENAI_GPT_5_6_LUNA. Faster than DEEPSEEK_V4_FLASH_0731.
 *  */
// const HY3 = openrouter.chat("tencent/hy3");
// const HY3_OPTIONS = {
//   providerOptions: ({ effort }: { effort?: false | "low" | "high" }) => ({
//     openrouter: {
//       reasoning: effort ? { enabled: true, effort } : { enabled: false },
//       provider: {
//         sort: "price",
//         allow_fallbacks: true
//       }
//     }
//   })
// }

const OPENAI_GPT_5_6_LUNA = openrouter.chat("openai/gpt-5.6-luna");
const OPENAI_GPT_5_6_LUNA_OPTIONS = {
  providerOptions: ({ effort }: { effort?: false | "low" | "medium" | "high" }) => ({
    openrouter: {
      reasoning: effort ? { enabled: true, effort } : { enabled: false },
      provider: {
        sort: "price",
        allow_fallbacks: true
      }
    }
  })
}

const QWEN_3_7_FLASH = openrouter.chat("qwen/qwen3.7-flash");
const QWEN_3_7_FLASH_OPTIONS = {
  providerOptions: ({ effort }: { effort?: false | "low" | "medium" | "high" }) => ({
    openrouter: {
      reasoning: effort ? { enabled: true, effort } : { enabled: false },
      provider: {
        sort: "price",
        allow_fallbacks: true
      }
    }
  })
}

const MIMO_V2_6_PRO = openrouter.chat("xiaomi/mimo-v2.6-pro");
const MIMO_V2_6_PRO_OPTIONS = {
  providerOptions: ({ effort }: { effort?: false | "low" | "medium" | "high" }) => ({
    openrouter: {
      reasoning: effort ? { enabled: true, effort } : { enabled: false },
      provider: {
        sort: "price",
        allow_fallbacks: true
      }
    }
  })
}

export const models = {
  default: {
    model: DEEPSEEK_V4_FLASH_0731,
    ...DEEPSEEK_V4_FLASH_0731_OPTIONS
  },
  recipes: {
    model: OPENAI_GPT_5_6_LUNA,
    ...OPENAI_GPT_5_6_LUNA_OPTIONS
  },
  /**
   * The `catalog:import` script's dish suggester. Luna rather than Deepseek because the script
   * waits on every call through one HTTP request, and Deepseek at low effort took long enough for
   * the gateway to time out on it. Named on its own so retuning the import cannot move `recipes`.
   */
  catalog: {
    model: OPENAI_GPT_5_6_LUNA,
    ...OPENAI_GPT_5_6_LUNA_OPTIONS
  },
  /**
   * The assistant a shopper talks to. Deepseek at low effort: it is answering cooking questions,
   * not reasoning about a schema, and it is the only model here a person waits on in real time —
   * so the trade runs the other way from `recipes`, where accuracy is worth the extra seconds.
   *
   * Named rather than pointed at `default`, so retuning the chat cannot move a sanitizer that
   * happens to share its model today.
   */
  assistant: {
    model: DEEPSEEK_V4_FLASH_0731,
    ...DEEPSEEK_V4_FLASH_0731_OPTIONS
  },
  translator: {
    model: DEEPSEEK_V4_FLASH_0731,
    ...DEEPSEEK_V4_FLASH_0731_OPTIONS
  },
  /**
   * The `sanitizeIngredient` row writer. Mimo at reasoning off, replacing Deepseek: the
   * 2026-09-22 row bake-off (`sanitizeIngredientRow.manual.test.ts`, seven candidates × three
   * runs on worcestershire sauce) had Deepseek hallucinate `celery` and return protein 0 in two
   * runs of three, where Mimo kept every allergen and every nutrition figure clean in all three.
   * Reasoning off rather than medium because the answers were the same and medium took 45–83 s
   * against 11 s, on a call a shopper waits for.
   */
  ingredients: {
    model: MIMO_V2_6_PRO,
    ...MIMO_V2_6_PRO_OPTIONS
  },
  /**
   * The `sanitizeIngredient` ranker: is a near-miss the catalog found the same food, or nothing?
   *
   * Chosen by `sanitizeIngredientRanker.manual.test.ts` against Deepseek, nine fixtures × five
   * runs, pooled over the two runs of the current prompt — 90 answers each. Score only what
   * production acts on, an index returned at or above `MATCHED`, and the gap is wide: Qwen put a
   * wrong food on the list 3 times in 90, Deepseek 11, including `jus de citron` linked to
   * `citron` at 1.0. Deepseek also fails the job outright on `MANGLED`, returning no usable match
   * in 8 runs of 10 where Qwen found it in 9 — a duplicate catalog row every time. Qwen costs
   * ~3.4× less per call ($0.0000202 against $0.0000695) and was never the slower of the two.
   *
   * An earlier note here read the opposite way round, calling Qwen the less conservative off three
   * fixtures, on the strength of `amandes effilées` entertained at 0.75. That is a sub-threshold
   * wobble the tool discards, which is not the same thing as a match; six more fixtures put
   * Deepseek far ahead on the failure that actually reaches a shopper.
   *
   * **Read the tables, never a single cell.** Five runs is too few to rank one fixture, and the
   * same prompt benched twice moved every individual failure: `WRONG_FRUIT` and `WRONG_FORM` each
   * scored one false positive in one run and none in the other, while `WRONG_GRADE` did the
   * reverse. Only an effect that survives both runs is an effect. Retuning the prompt against one
   * table's bad run is how this file acquired the paragraph above.
   *
   * What Qwen still gets wrong, and what is accepted here: `steak haché 5%` links to `steak haché`
   * at 0.85 about once in 45, the one defect the threshold does not catch; and on `TOO_SPECIFIC` it
   * now names `pain blanc` at 0.75 in 4 runs of 5 — discarded, but 0.05 from not being. That
   * second one is consistent rather than sporadic, so it is the number to watch on the next bench.
   *
   * The `saveAlias` typo defect is fixed and it was the prompt, not the model: both candidates
   * stored `échqlote` in every run, and rewriting that section took Qwen from 10 of 10 wrong to
   * 0 of 9. Keep the 0.8 threshold regardless — a missed match costs one generation, an actionable
   * false positive costs a wrong food on somebody's list, permanently and with no error anywhere.
   */
  ranker: {
    model: QWEN_3_7_FLASH,
    ...QWEN_3_7_FLASH_OPTIONS
  },
  prompterMini: {
    model: QWEN_3_7_FLASH,
    ...QWEN_3_7_FLASH_OPTIONS
  }
}
