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

export const models = {
  default: {
    model: DEEPSEEK_V4_FLASH_0731,
    ...DEEPSEEK_V4_FLASH_0731_OPTIONS
  },
  recipes: {
    model: OPENAI_GPT_5_6_LUNA,
    ...OPENAI_GPT_5_6_LUNA_OPTIONS
  },
  translator: {
    model: DEEPSEEK_V4_FLASH_0731,
    ...DEEPSEEK_V4_FLASH_0731_OPTIONS
  }
}
