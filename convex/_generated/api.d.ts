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
import type * as functions_users_isAuthorized from "../functions/users/isAuthorized.js";
import type * as functions_users_loadUser from "../functions/users/loadUser.js";
import type * as http from "../http.js";
import type * as http_verified from "../http/verified.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as procedures from "../procedures.js";
import type * as router_users_getAccount from "../router/users/getAccount.js";
import type * as router_users_getMe from "../router/users/getMe.js";
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
  "functions/users/isAuthorized": typeof functions_users_isAuthorized;
  "functions/users/loadUser": typeof functions_users_loadUser;
  http: typeof http;
  "http/verified": typeof http_verified;
  "lib/secrets": typeof lib_secrets;
  procedures: typeof procedures;
  "router/users/getAccount": typeof router_users_getAccount;
  "router/users/getMe": typeof router_users_getMe;
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
