import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "@convex/env";

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
});

/**
 * The assistant's model, because it reads images: a photo sent with a question reaches it as an
 * image part, which `DEEPSEEK_V4_FLASH_0731` cannot take. Uses the same options, which name no model.
 */
const DEEPSEEK_V4_1_FLASH = openrouter.chat("deepseek/deepseek-v4.1-flash");

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
  providerOptions: ({ effort }: { effort?: false | "low" | "medium" | "high" | "xhigh" | "max" }) => ({
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

/**
 * The verifier's model. Twenty times Luna's price per token, but at `low` effort it barely
 * reasons: about 2 cents and under a minute per verify in the bake-off, where Luna at `high`
 * spent three minutes and still missed what the page's method added.
 */
const OPENAI_GPT_6_1_SOL = openrouter.chat("openai/gpt-6.1-sol");
const OPENAI_GPT_6_1_SOL_OPTIONS = {
  providerOptions: ({ effort }: { effort?: "low" }) => ({
    openrouter: {
      reasoning: { enabled: true, effort: effort ?? "low" },
      provider: {
        sort: "price",
        allow_fallbacks: true,
        require_parameters: true
      }
    }
  })
}

const QWEN_3_7_FLASH = openrouter.chat("qwen/qwen3.7-flash");
/**
 * `require_parameters` is OFF, unlike every other model here. Alibaba is the only provider, and on
 * 2026-09-26 OpenRouter stopped listing `structured_outputs` for it: with the flag on, every
 * `generateObject` call (the recipe image prompts) was refused with "No endpoints found", while the
 * `generateText` calls kept working. With it off Alibaba still honours the JSON schema — 6 of 6
 * replies valid that day — and `parseModelOutput` rejects any that does not.
 */
const QWEN_3_7_FLASH_OPTIONS = {
  providerOptions: ({ effort }: { effort?: false | "low" | "medium" | "high" }) => ({
    openrouter: {
      reasoning: effort ? { enabled: true, effort } : { enabled: false },
      provider: {
        sort: "price",
        allow_fallbacks: true,
        require_parameters: false
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
   * The `seed:catalog` script's dish suggester. Luna rather than Deepseek because the script
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
    model: DEEPSEEK_V4_1_FLASH,
    ...DEEPSEEK_V4_FLASH_0731_OPTIONS
  },
  /**
   * The admin's second opinion on an imported recipe (`tools/verifyRecipe.ts`). A stronger model
   * than the one that wrote the recipe, because what it is paid for is catching that one's misses.
   * Named on its own so a bake-off in `verifyRecipe.manual.test.ts` can move it without moving
   * the import.
   */
  verifier: {
    model: OPENAI_GPT_6_1_SOL,
    ...OPENAI_GPT_6_1_SOL_OPTIONS
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
