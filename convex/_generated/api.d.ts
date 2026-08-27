/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent___bench___bakeOff from "../agent/__bench__/bakeOff.js";
import type * as agent___bench___format from "../agent/__bench__/format.js";
import type * as agent___bench___index from "../agent/__bench__/index.js";
import type * as agent___bench___judge from "../agent/__bench__/judge.js";
import type * as agent___bench___pool from "../agent/__bench__/pool.js";
import type * as agent___bench___provider from "../agent/__bench__/provider.js";
import type * as agent___bench___table from "../agent/__bench__/table.js";
import type * as agent___bench___transcript from "../agent/__bench__/transcript.js";
import type * as agent___bench___types from "../agent/__bench__/types.js";
import type * as agent_agents from "../agent/agents.js";
import type * as agent_config_index from "../agent/config/index.js";
import type * as agent_config_models from "../agent/config/models.js";
import type * as agent_config_prompts_sanitizeRecipe from "../agent/config/prompts/sanitizeRecipe.js";
import type * as agent_config_prompts_translateRecipe from "../agent/config/prompts/translateRecipe.js";
import type * as agent_tools_sanitizeRecipe from "../agent/tools/sanitizeRecipe.js";
import type * as agent_tools_translateRecipe from "../agent/tools/translateRecipe.js";
import type * as agent_utils_createTool from "../agent/utils/createTool.js";
import type * as agent_utils_index from "../agent/utils/index.js";
import type * as agent_utils_parseModelOutput from "../agent/utils/parseModelOutput.js";
import type * as agent_utils_providerSchema from "../agent/utils/providerSchema.js";
import type * as agent_utils_wrapAgent from "../agent/utils/wrapAgent.js";
import type * as auth from "../auth.js";
import type * as env from "../env.js";
import type * as functions_cascade from "../functions/cascade.js";
import type * as functions_cellars_addToCellar from "../functions/cellars/addToCellar.js";
import type * as functions_cellars_addToGroceryList from "../functions/cellars/addToGroceryList.js";
import type * as functions_cellars_removeFromCellar from "../functions/cellars/removeFromCellar.js";
import type * as functions_cellars_removeFromGroceryList from "../functions/cellars/removeFromGroceryList.js";
import type * as functions_cellars_removeFromRecentlyUsed from "../functions/cellars/removeFromRecentlyUsed.js";
import type * as functions_households_getForUser from "../functions/households/getForUser.js";
import type * as functions_households_isMember from "../functions/households/isMember.js";
import type * as functions_ingredients_catalogIngredient from "../functions/ingredients/catalogIngredient.js";
import type * as functions_ingredients_ingredientCatalog from "../functions/ingredients/ingredientCatalog.js";
import type * as functions_ingredients_loadIngredients from "../functions/ingredients/loadIngredients.js";
import type * as functions_ingredients_matchIngredients from "../functions/ingredients/matchIngredients.js";
import type * as functions_ingredients_searchCatalog from "../functions/ingredients/searchCatalog.js";
import type * as functions_ingredients_seedIngredients from "../functions/ingredients/seedIngredients.js";
import type * as functions_recipes_computeTags from "../functions/recipes/computeTags.js";
import type * as functions_recipes_loadForTranslation from "../functions/recipes/loadForTranslation.js";
import type * as functions_recipes_recipeSearchText from "../functions/recipes/recipeSearchText.js";
import type * as functions_recipes_saveRecipe from "../functions/recipes/saveRecipe.js";
import type * as functions_recipes_saveTranslations from "../functions/recipes/saveTranslations.js";
import type * as functions_users_isAuthorized from "../functions/users/isAuthorized.js";
import type * as functions_users_loadUser from "../functions/users/loadUser.js";
import type * as http from "../http.js";
import type * as http_verified from "../http/verified.js";
import type * as lib_i18n_index from "../lib/i18n/index.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as migrations from "../migrations.js";
import type * as procedures from "../procedures.js";
import type * as router_cellars_addToCellar from "../router/cellars/addToCellar.js";
import type * as router_cellars_addToGroceryList from "../router/cellars/addToGroceryList.js";
import type * as router_cellars_getCellar from "../router/cellars/getCellar.js";
import type * as router_cellars_getGroceryList from "../router/cellars/getGroceryList.js";
import type * as router_cellars_getRecentlyUsed from "../router/cellars/getRecentlyUsed.js";
import type * as router_cellars_removeFromCellar from "../router/cellars/removeFromCellar.js";
import type * as router_cellars_removeFromGroceryList from "../router/cellars/removeFromGroceryList.js";
import type * as router_households_getMine from "../router/households/getMine.js";
import type * as router_ingredients_getIngredient from "../router/ingredients/getIngredient.js";
import type * as router_ingredients_list from "../router/ingredients/list.js";
import type * as router_ingredients_search from "../router/ingredients/search.js";
import type * as router_ingredients_seedCatalog from "../router/ingredients/seedCatalog.js";
import type * as router_recipes_createOne from "../router/recipes/createOne.js";
import type * as router_recipes_translateOne from "../router/recipes/translateOne.js";
import type * as router_users_getAccount from "../router/users/getAccount.js";
import type * as router_users_getMe from "../router/users/getMe.js";
import type * as schema_cellars from "../schema/cellars.js";
import type * as schema_households from "../schema/households.js";
import type * as schema_i18n from "../schema/i18n.js";
import type * as schema_ingredients from "../schema/ingredients.js";
import type * as schema_recipePayloads from "../schema/recipePayloads.js";
import type * as schema_recipes from "../schema/recipes.js";
import type * as schema_users from "../schema/users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/__bench__/bakeOff": typeof agent___bench___bakeOff;
  "agent/__bench__/format": typeof agent___bench___format;
  "agent/__bench__/index": typeof agent___bench___index;
  "agent/__bench__/judge": typeof agent___bench___judge;
  "agent/__bench__/pool": typeof agent___bench___pool;
  "agent/__bench__/provider": typeof agent___bench___provider;
  "agent/__bench__/table": typeof agent___bench___table;
  "agent/__bench__/transcript": typeof agent___bench___transcript;
  "agent/__bench__/types": typeof agent___bench___types;
  "agent/agents": typeof agent_agents;
  "agent/config/index": typeof agent_config_index;
  "agent/config/models": typeof agent_config_models;
  "agent/config/prompts/sanitizeRecipe": typeof agent_config_prompts_sanitizeRecipe;
  "agent/config/prompts/translateRecipe": typeof agent_config_prompts_translateRecipe;
  "agent/tools/sanitizeRecipe": typeof agent_tools_sanitizeRecipe;
  "agent/tools/translateRecipe": typeof agent_tools_translateRecipe;
  "agent/utils/createTool": typeof agent_utils_createTool;
  "agent/utils/index": typeof agent_utils_index;
  "agent/utils/parseModelOutput": typeof agent_utils_parseModelOutput;
  "agent/utils/providerSchema": typeof agent_utils_providerSchema;
  "agent/utils/wrapAgent": typeof agent_utils_wrapAgent;
  auth: typeof auth;
  env: typeof env;
  "functions/cascade": typeof functions_cascade;
  "functions/cellars/addToCellar": typeof functions_cellars_addToCellar;
  "functions/cellars/addToGroceryList": typeof functions_cellars_addToGroceryList;
  "functions/cellars/removeFromCellar": typeof functions_cellars_removeFromCellar;
  "functions/cellars/removeFromGroceryList": typeof functions_cellars_removeFromGroceryList;
  "functions/cellars/removeFromRecentlyUsed": typeof functions_cellars_removeFromRecentlyUsed;
  "functions/households/getForUser": typeof functions_households_getForUser;
  "functions/households/isMember": typeof functions_households_isMember;
  "functions/ingredients/catalogIngredient": typeof functions_ingredients_catalogIngredient;
  "functions/ingredients/ingredientCatalog": typeof functions_ingredients_ingredientCatalog;
  "functions/ingredients/loadIngredients": typeof functions_ingredients_loadIngredients;
  "functions/ingredients/matchIngredients": typeof functions_ingredients_matchIngredients;
  "functions/ingredients/searchCatalog": typeof functions_ingredients_searchCatalog;
  "functions/ingredients/seedIngredients": typeof functions_ingredients_seedIngredients;
  "functions/recipes/computeTags": typeof functions_recipes_computeTags;
  "functions/recipes/loadForTranslation": typeof functions_recipes_loadForTranslation;
  "functions/recipes/recipeSearchText": typeof functions_recipes_recipeSearchText;
  "functions/recipes/saveRecipe": typeof functions_recipes_saveRecipe;
  "functions/recipes/saveTranslations": typeof functions_recipes_saveTranslations;
  "functions/users/isAuthorized": typeof functions_users_isAuthorized;
  "functions/users/loadUser": typeof functions_users_loadUser;
  http: typeof http;
  "http/verified": typeof http_verified;
  "lib/i18n/index": typeof lib_i18n_index;
  "lib/secrets": typeof lib_secrets;
  migrations: typeof migrations;
  procedures: typeof procedures;
  "router/cellars/addToCellar": typeof router_cellars_addToCellar;
  "router/cellars/addToGroceryList": typeof router_cellars_addToGroceryList;
  "router/cellars/getCellar": typeof router_cellars_getCellar;
  "router/cellars/getGroceryList": typeof router_cellars_getGroceryList;
  "router/cellars/getRecentlyUsed": typeof router_cellars_getRecentlyUsed;
  "router/cellars/removeFromCellar": typeof router_cellars_removeFromCellar;
  "router/cellars/removeFromGroceryList": typeof router_cellars_removeFromGroceryList;
  "router/households/getMine": typeof router_households_getMine;
  "router/ingredients/getIngredient": typeof router_ingredients_getIngredient;
  "router/ingredients/list": typeof router_ingredients_list;
  "router/ingredients/search": typeof router_ingredients_search;
  "router/ingredients/seedCatalog": typeof router_ingredients_seedCatalog;
  "router/recipes/createOne": typeof router_recipes_createOne;
  "router/recipes/translateOne": typeof router_recipes_translateOne;
  "router/users/getAccount": typeof router_users_getAccount;
  "router/users/getMe": typeof router_users_getMe;
  "schema/cellars": typeof schema_cellars;
  "schema/households": typeof schema_households;
  "schema/i18n": typeof schema_i18n;
  "schema/ingredients": typeof schema_ingredients;
  "schema/recipePayloads": typeof schema_recipePayloads;
  "schema/recipes": typeof schema_recipes;
  "schema/users": typeof schema_users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
