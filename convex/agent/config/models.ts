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
        allow_fallbacks: true,
        require_parameters: true
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

const OPENAI_GPT_6_LUNA = openrouter.chat("openai/gpt-6-luna");
const OPENAI_GPT_6_LUNA_OPTIONS = {
  providerOptions: ({ effort }: { effort?: false | "low" | "medium" | "high" }) => ({
    openrouter: {
      reasoning: effort ? { enabled: true, effort } : { enabled: false },
      provider: {
        sort: "price",
        allow_fallbacks: true,
        require_parameters: true
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
        allow_fallbacks: true,
        require_parameters: true
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
    model: OPENAI_GPT_6_LUNA,
    ...OPENAI_GPT_6_LUNA_OPTIONS
  },
  /**
   * The `catalog:import` script's dish suggester. Luna rather than Deepseek because the script
   * waits on every call through one HTTP request, and Deepseek at low effort took long enough for
   * the gateway to time out on it. Named on its own so retuning the import cannot move `recipes`.
   */
  catalog: {
    model: OPENAI_GPT_6_LUNA,
    ...OPENAI_GPT_6_LUNA_OPTIONS
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
    model: OPENAI_GPT_6_LUNA,
    ...OPENAI_GPT_6_LUNA_OPTIONS
  },
  /**
   * The `sanitizeIngredient` row writer. GPT-6 Luna at LOW effort, replacing Mimo at reasoning off:
   * the 2026-09-23 row bake-off (`sanitizeIngredientRow.manual.test.ts`, worcestershire sauce) had
   * it answer 3 of 3 at low, against 1 of 9 with reasoning off — every failure an unparseable
   * reply, never a wrong one. It needs the few hundred reasoning tokens to fill this schema; do not
   * move it to `false` without re-running that bake-off.
   *
   * Mimo replaced Deepseek on the 2026-09-22 run, where Deepseek hallucinated `celery` and returned
   * protein 0 in two runs of three.
   */
  ingredients: {
    model: OPENAI_GPT_6_LUNA,
    ...OPENAI_GPT_6_LUNA_OPTIONS
  },
  prompterMini: {
    model: QWEN_3_7_FLASH,
    ...QWEN_3_7_FLASH_OPTIONS
  }
}
