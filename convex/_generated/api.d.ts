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
import type * as agent_config_prompts_sanitizeIngredient from "../agent/config/prompts/sanitizeIngredient.js";
import type * as agent_config_prompts_sanitizeRecipe from "../agent/config/prompts/sanitizeRecipe.js";
import type * as agent_config_prompts_translateRecipe from "../agent/config/prompts/translateRecipe.js";
import type * as agent_tools_generateIngredientImage from "../agent/tools/generateIngredientImage.js";
import type * as agent_tools_generateRecipeImages from "../agent/tools/generateRecipeImages.js";
import type * as agent_tools_sanitizeIngredient from "../agent/tools/sanitizeIngredient.js";
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
import type * as functions_households_saveDefaults from "../functions/households/saveDefaults.js";
import type * as functions_ingredients_catalogIngredient from "../functions/ingredients/catalogIngredient.js";
import type * as functions_ingredients_createIngredient from "../functions/ingredients/createIngredient.js";
import type * as functions_ingredients_ingredientCatalog from "../functions/ingredients/ingredientCatalog.js";
import type * as functions_ingredients_ingredientImage from "../functions/ingredients/ingredientImage.js";
import type * as functions_ingredients_ingredientRow from "../functions/ingredients/ingredientRow.js";
import type * as functions_ingredients_loadIngredients from "../functions/ingredients/loadIngredients.js";
import type * as functions_ingredients_lookup_composition from "../functions/ingredients/lookup/composition.js";
import type * as functions_ingredients_lookup_data_composition from "../functions/ingredients/lookup/data/composition.js";
import type * as functions_ingredients_lookup_data_taxonomy from "../functions/ingredients/lookup/data/taxonomy.js";
import type * as functions_ingredients_lookup_foodDataCentral from "../functions/ingredients/lookup/foodDataCentral.js";
import type * as functions_ingredients_lookup_lookupHit from "../functions/ingredients/lookup/lookupHit.js";
import type * as functions_ingredients_lookup_openFoodFacts from "../functions/ingredients/lookup/openFoodFacts.js";
import type * as functions_ingredients_lookup_taxonomy from "../functions/ingredients/lookup/taxonomy.js";
import type * as functions_ingredients_rememberAlias from "../functions/ingredients/rememberAlias.js";
import type * as functions_ingredients_resolveIngredient from "../functions/ingredients/resolveIngredient.js";
import type * as functions_ingredients_searchCatalog from "../functions/ingredients/searchCatalog.js";
import type * as functions_ingredients_searchWidened from "../functions/ingredients/searchWidened.js";
import type * as functions_ingredients_seedIngredients from "../functions/ingredients/seedIngredients.js";
import type * as functions_media_deleteImage from "../functions/media/deleteImage.js";
import type * as functions_media_deleteImageFiles from "../functions/media/deleteImageFiles.js";
import type * as functions_media_getImage from "../functions/media/getImage.js";
import type * as functions_media_imageSizes from "../functions/media/imageSizes.js";
import type * as functions_media_imageTree from "../functions/media/imageTree.js";
import type * as functions_media_sanitizeImage from "../functions/media/sanitizeImage.js";
import type * as functions_media_saveImage from "../functions/media/saveImage.js";
import type * as functions_media_uploadImage from "../functions/media/uploadImage.js";
import type * as functions_media_uploadImageSizes from "../functions/media/uploadImageSizes.js";
import type * as functions_planning_availableStock from "../functions/planning/availableStock.js";
import type * as functions_planning_candidatePool from "../functions/planning/candidatePool.js";
import type * as functions_planning_planDraft from "../functions/planning/planDraft.js";
import type * as functions_planning_scaleLines from "../functions/planning/scaleLines.js";
import type * as functions_planning_selectMeals from "../functions/planning/selectMeals.js";
import type * as functions_preferences_getForUser from "../functions/preferences/getForUser.js";
import type * as functions_preferences_getPlanningSeed from "../functions/preferences/getPlanningSeed.js";
import type * as functions_preferences_save from "../functions/preferences/save.js";
import type * as functions_recipes_computeTags from "../functions/recipes/computeTags.js";
import type * as functions_recipes_deriveRecipeFields from "../functions/recipes/deriveRecipeFields.js";
import type * as functions_recipes_generateRecipe from "../functions/recipes/generateRecipe.js";
import type * as functions_recipes_listForUser from "../functions/recipes/listForUser.js";
import type * as functions_recipes_loadForTranslation from "../functions/recipes/loadForTranslation.js";
import type * as functions_recipes_loadRecipe from "../functions/recipes/loadRecipe.js";
import type * as functions_recipes_recipeCard from "../functions/recipes/recipeCard.js";
import type * as functions_recipes_recipeChangesOf from "../functions/recipes/recipeChangesOf.js";
import type * as functions_recipes_recipeImages from "../functions/recipes/recipeImages.js";
import type * as functions_recipes_recipeSearchText from "../functions/recipes/recipeSearchText.js";
import type * as functions_recipes_regenerateRecipe from "../functions/recipes/regenerateRecipe.js";
import type * as functions_recipes_resolveRecipeIngredients from "../functions/recipes/resolveRecipeIngredients.js";
import type * as functions_recipes_saveRecipe from "../functions/recipes/saveRecipe.js";
import type * as functions_recipes_saveTranslations from "../functions/recipes/saveTranslations.js";
import type * as functions_recipes_searchForUser from "../functions/recipes/searchForUser.js";
import type * as functions_recipes_toModelRecipe from "../functions/recipes/toModelRecipe.js";
import type * as functions_recipes_updateRecipe from "../functions/recipes/updateRecipe.js";
import type * as functions_users_isAuthorized from "../functions/users/isAuthorized.js";
import type * as functions_users_loadUser from "../functions/users/loadUser.js";
import type * as http from "../http.js";
import type * as http_verified from "../http/verified.js";
import type * as lib_i18n_index from "../lib/i18n/index.js";
import type * as lib_media_node from "../lib/media/node.js";
import type * as lib_nanoid from "../lib/nanoid.js";
import type * as lib_path from "../lib/path.js";
import type * as lib_replicate_node from "../lib/replicate/node.js";
import type * as lib_replicate_utils from "../lib/replicate/utils.js";
import type * as lib_runpod_removeBackground from "../lib/runpod/removeBackground.js";
import type * as lib_s3_node from "../lib/s3/node.js";
import type * as lib_scraping_fetchPage from "../lib/scraping/fetchPage.js";
import type * as lib_scraping_scrapePage from "../lib/scraping/scrapePage.js";
import type * as lib_scraping_toRecipeDraft from "../lib/scraping/toRecipeDraft.js";
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
import type * as router_households_saveDefaults from "../router/households/saveDefaults.js";
import type * as router_ingredients_generateImage from "../router/ingredients/generateImage.js";
import type * as router_ingredients_generateImageNode from "../router/ingredients/generateImageNode.js";
import type * as router_ingredients_getIngredient from "../router/ingredients/getIngredient.js";
import type * as router_ingredients_list from "../router/ingredients/list.js";
import type * as router_ingredients_resolve from "../router/ingredients/resolve.js";
import type * as router_ingredients_search from "../router/ingredients/search.js";
import type * as router_ingredients_seedCatalog from "../router/ingredients/seedCatalog.js";
import type * as router_media_images_deleteOne from "../router/media/images/deleteOne.js";
import type * as router_media_images_deleteOneNode from "../router/media/images/deleteOneNode.js";
import type * as router_media_images_getMany from "../router/media/images/getMany.js";
import type * as router_media_images_getOne from "../router/media/images/getOne.js";
import type * as router_media_images_saveMany from "../router/media/images/saveMany.js";
import type * as router_media_images_saveSizes from "../router/media/images/saveSizes.js";
import type * as router_media_images_uploadMany from "../router/media/images/uploadMany.js";
import type * as router_media_images_uploadOne from "../router/media/images/uploadOne.js";
import type * as router_media_images_uploadSizes from "../router/media/images/uploadSizes.js";
import type * as router_planning_getDraft from "../router/planning/getDraft.js";
import type * as router_preferences_getMine from "../router/preferences/getMine.js";
import type * as router_preferences_getPlanningSeed from "../router/preferences/getPlanningSeed.js";
import type * as router_preferences_save from "../router/preferences/save.js";
import type * as router_recipes_createOne from "../router/recipes/createOne.js";
import type * as router_recipes_generateImages from "../router/recipes/generateImages.js";
import type * as router_recipes_getAll from "../router/recipes/getAll.js";
import type * as router_recipes_getOne from "../router/recipes/getOne.js";
import type * as router_recipes_importOne from "../router/recipes/importOne.js";
import type * as router_recipes_importOneNode from "../router/recipes/importOneNode.js";
import type * as router_recipes_search from "../router/recipes/search.js";
import type * as router_recipes_translateOne from "../router/recipes/translateOne.js";
import type * as router_recipes_updateOne from "../router/recipes/updateOne.js";
import type * as router_users_getAccount from "../router/users/getAccount.js";
import type * as router_users_getMe from "../router/users/getMe.js";
import type * as schema_cellars from "../schema/cellars.js";
import type * as schema_households from "../schema/households.js";
import type * as schema_i18n from "../schema/i18n.js";
import type * as schema_ingredientPayloads from "../schema/ingredientPayloads.js";
import type * as schema_ingredients from "../schema/ingredients.js";
import type * as schema_media from "../schema/media.js";
import type * as schema_planning from "../schema/planning.js";
import type * as schema_preferences from "../schema/preferences.js";
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
  "agent/config/prompts/sanitizeIngredient": typeof agent_config_prompts_sanitizeIngredient;
  "agent/config/prompts/sanitizeRecipe": typeof agent_config_prompts_sanitizeRecipe;
  "agent/config/prompts/translateRecipe": typeof agent_config_prompts_translateRecipe;
  "agent/tools/generateIngredientImage": typeof agent_tools_generateIngredientImage;
  "agent/tools/generateRecipeImages": typeof agent_tools_generateRecipeImages;
  "agent/tools/sanitizeIngredient": typeof agent_tools_sanitizeIngredient;
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
  "functions/households/saveDefaults": typeof functions_households_saveDefaults;
  "functions/ingredients/catalogIngredient": typeof functions_ingredients_catalogIngredient;
  "functions/ingredients/createIngredient": typeof functions_ingredients_createIngredient;
  "functions/ingredients/ingredientCatalog": typeof functions_ingredients_ingredientCatalog;
  "functions/ingredients/ingredientImage": typeof functions_ingredients_ingredientImage;
  "functions/ingredients/ingredientRow": typeof functions_ingredients_ingredientRow;
  "functions/ingredients/loadIngredients": typeof functions_ingredients_loadIngredients;
  "functions/ingredients/lookup/composition": typeof functions_ingredients_lookup_composition;
  "functions/ingredients/lookup/data/composition": typeof functions_ingredients_lookup_data_composition;
  "functions/ingredients/lookup/data/taxonomy": typeof functions_ingredients_lookup_data_taxonomy;
  "functions/ingredients/lookup/foodDataCentral": typeof functions_ingredients_lookup_foodDataCentral;
  "functions/ingredients/lookup/lookupHit": typeof functions_ingredients_lookup_lookupHit;
  "functions/ingredients/lookup/openFoodFacts": typeof functions_ingredients_lookup_openFoodFacts;
  "functions/ingredients/lookup/taxonomy": typeof functions_ingredients_lookup_taxonomy;
  "functions/ingredients/rememberAlias": typeof functions_ingredients_rememberAlias;
  "functions/ingredients/resolveIngredient": typeof functions_ingredients_resolveIngredient;
  "functions/ingredients/searchCatalog": typeof functions_ingredients_searchCatalog;
  "functions/ingredients/searchWidened": typeof functions_ingredients_searchWidened;
  "functions/ingredients/seedIngredients": typeof functions_ingredients_seedIngredients;
  "functions/media/deleteImage": typeof functions_media_deleteImage;
  "functions/media/deleteImageFiles": typeof functions_media_deleteImageFiles;
  "functions/media/getImage": typeof functions_media_getImage;
  "functions/media/imageSizes": typeof functions_media_imageSizes;
  "functions/media/imageTree": typeof functions_media_imageTree;
  "functions/media/sanitizeImage": typeof functions_media_sanitizeImage;
  "functions/media/saveImage": typeof functions_media_saveImage;
  "functions/media/uploadImage": typeof functions_media_uploadImage;
  "functions/media/uploadImageSizes": typeof functions_media_uploadImageSizes;
  "functions/planning/availableStock": typeof functions_planning_availableStock;
  "functions/planning/candidatePool": typeof functions_planning_candidatePool;
  "functions/planning/planDraft": typeof functions_planning_planDraft;
  "functions/planning/scaleLines": typeof functions_planning_scaleLines;
  "functions/planning/selectMeals": typeof functions_planning_selectMeals;
  "functions/preferences/getForUser": typeof functions_preferences_getForUser;
  "functions/preferences/getPlanningSeed": typeof functions_preferences_getPlanningSeed;
  "functions/preferences/save": typeof functions_preferences_save;
  "functions/recipes/computeTags": typeof functions_recipes_computeTags;
  "functions/recipes/deriveRecipeFields": typeof functions_recipes_deriveRecipeFields;
  "functions/recipes/generateRecipe": typeof functions_recipes_generateRecipe;
  "functions/recipes/listForUser": typeof functions_recipes_listForUser;
  "functions/recipes/loadForTranslation": typeof functions_recipes_loadForTranslation;
  "functions/recipes/loadRecipe": typeof functions_recipes_loadRecipe;
  "functions/recipes/recipeCard": typeof functions_recipes_recipeCard;
  "functions/recipes/recipeChangesOf": typeof functions_recipes_recipeChangesOf;
  "functions/recipes/recipeImages": typeof functions_recipes_recipeImages;
  "functions/recipes/recipeSearchText": typeof functions_recipes_recipeSearchText;
  "functions/recipes/regenerateRecipe": typeof functions_recipes_regenerateRecipe;
  "functions/recipes/resolveRecipeIngredients": typeof functions_recipes_resolveRecipeIngredients;
  "functions/recipes/saveRecipe": typeof functions_recipes_saveRecipe;
  "functions/recipes/saveTranslations": typeof functions_recipes_saveTranslations;
  "functions/recipes/searchForUser": typeof functions_recipes_searchForUser;
  "functions/recipes/toModelRecipe": typeof functions_recipes_toModelRecipe;
  "functions/recipes/updateRecipe": typeof functions_recipes_updateRecipe;
  "functions/users/isAuthorized": typeof functions_users_isAuthorized;
  "functions/users/loadUser": typeof functions_users_loadUser;
  http: typeof http;
  "http/verified": typeof http_verified;
  "lib/i18n/index": typeof lib_i18n_index;
  "lib/media/node": typeof lib_media_node;
  "lib/nanoid": typeof lib_nanoid;
  "lib/path": typeof lib_path;
  "lib/replicate/node": typeof lib_replicate_node;
  "lib/replicate/utils": typeof lib_replicate_utils;
  "lib/runpod/removeBackground": typeof lib_runpod_removeBackground;
  "lib/s3/node": typeof lib_s3_node;
  "lib/scraping/fetchPage": typeof lib_scraping_fetchPage;
  "lib/scraping/scrapePage": typeof lib_scraping_scrapePage;
  "lib/scraping/toRecipeDraft": typeof lib_scraping_toRecipeDraft;
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
  "router/households/saveDefaults": typeof router_households_saveDefaults;
  "router/ingredients/generateImage": typeof router_ingredients_generateImage;
  "router/ingredients/generateImageNode": typeof router_ingredients_generateImageNode;
  "router/ingredients/getIngredient": typeof router_ingredients_getIngredient;
  "router/ingredients/list": typeof router_ingredients_list;
  "router/ingredients/resolve": typeof router_ingredients_resolve;
  "router/ingredients/search": typeof router_ingredients_search;
  "router/ingredients/seedCatalog": typeof router_ingredients_seedCatalog;
  "router/media/images/deleteOne": typeof router_media_images_deleteOne;
  "router/media/images/deleteOneNode": typeof router_media_images_deleteOneNode;
  "router/media/images/getMany": typeof router_media_images_getMany;
  "router/media/images/getOne": typeof router_media_images_getOne;
  "router/media/images/saveMany": typeof router_media_images_saveMany;
  "router/media/images/saveSizes": typeof router_media_images_saveSizes;
  "router/media/images/uploadMany": typeof router_media_images_uploadMany;
  "router/media/images/uploadOne": typeof router_media_images_uploadOne;
  "router/media/images/uploadSizes": typeof router_media_images_uploadSizes;
  "router/planning/getDraft": typeof router_planning_getDraft;
  "router/preferences/getMine": typeof router_preferences_getMine;
  "router/preferences/getPlanningSeed": typeof router_preferences_getPlanningSeed;
  "router/preferences/save": typeof router_preferences_save;
  "router/recipes/createOne": typeof router_recipes_createOne;
  "router/recipes/generateImages": typeof router_recipes_generateImages;
  "router/recipes/getAll": typeof router_recipes_getAll;
  "router/recipes/getOne": typeof router_recipes_getOne;
  "router/recipes/importOne": typeof router_recipes_importOne;
  "router/recipes/importOneNode": typeof router_recipes_importOneNode;
  "router/recipes/search": typeof router_recipes_search;
  "router/recipes/translateOne": typeof router_recipes_translateOne;
  "router/recipes/updateOne": typeof router_recipes_updateOne;
  "router/users/getAccount": typeof router_users_getAccount;
  "router/users/getMe": typeof router_users_getMe;
  "schema/cellars": typeof schema_cellars;
  "schema/households": typeof schema_households;
  "schema/i18n": typeof schema_i18n;
  "schema/ingredientPayloads": typeof schema_ingredientPayloads;
  "schema/ingredients": typeof schema_ingredients;
  "schema/media": typeof schema_media;
  "schema/planning": typeof schema_planning;
  "schema/preferences": typeof schema_preferences;
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
