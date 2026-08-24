/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

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
import type * as functions_ingredients_searchCatalog from "../functions/ingredients/searchCatalog.js";
import type * as functions_ingredients_seedIngredients from "../functions/ingredients/seedIngredients.js";
import type * as functions_users_isAuthorized from "../functions/users/isAuthorized.js";
import type * as functions_users_loadUser from "../functions/users/loadUser.js";
import type * as http from "../http.js";
import type * as http_verified from "../http/verified.js";
import type * as lib_i18n_index from "../lib/i18n/index.js";
import type * as lib_secrets from "../lib/secrets.js";
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
import type * as router_users_getAccount from "../router/users/getAccount.js";
import type * as router_users_getMe from "../router/users/getMe.js";
import type * as schema_cellars from "../schema/cellars.js";
import type * as schema_households from "../schema/households.js";
import type * as schema_i18n from "../schema/i18n.js";
import type * as schema_ingredients from "../schema/ingredients.js";
import type * as schema_users from "../schema/users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
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
  "functions/ingredients/searchCatalog": typeof functions_ingredients_searchCatalog;
  "functions/ingredients/seedIngredients": typeof functions_ingredients_seedIngredients;
  "functions/users/isAuthorized": typeof functions_users_isAuthorized;
  "functions/users/loadUser": typeof functions_users_loadUser;
  http: typeof http;
  "http/verified": typeof http_verified;
  "lib/i18n/index": typeof lib_i18n_index;
  "lib/secrets": typeof lib_secrets;
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
  "router/users/getAccount": typeof router_users_getAccount;
  "router/users/getMe": typeof router_users_getMe;
  "schema/cellars": typeof schema_cellars;
  "schema/households": typeof schema_households;
  "schema/i18n": typeof schema_i18n;
  "schema/ingredients": typeof schema_ingredients;
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

export declare const components: {};
