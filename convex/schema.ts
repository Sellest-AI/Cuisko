import { authTables } from "@convex-dev/auth/server";
import { defineSchema } from "convex/server";

import { appConfig } from "./schema/appConfig";
import { usersExtended } from "./schema/users";
import { userPreferences } from "./schema/preferences";
import { households, householdFormerMembers, householdUsers } from "./schema/households";
import { ingredients } from "./schema/ingredients";
import { groceryListItems, cellarItems, recentlyUsedIngredients } from "./schema/cellars";
import { recipeContents, recipeFavorites, recipeIngredients, recipes } from "./schema/recipes";
import { mealPlans, plannedMealIngredients, plannedMeals } from "./schema/planning";
import { imageSizes, imageObjects, images, userImages } from "./schema/media";

/**
 * `authTables` (users, authAccounts, authSessions, …) are owned by @convex-dev/auth.
 * They carry no `updatedAt` (S5) because the component writes them, and we write them in one place
 * only: the account-deletion purge (docs/ARCHITECTURE.md § Identity).
 * Everything of ours goes in a sibling table instead.
 */
export default defineSchema({
  ...authTables,
  appConfig,
  usersExtended,
  userPreferences,
  households,
  householdUsers,
  householdFormerMembers,
  mealPlans,
  plannedMeals,
  plannedMealIngredients,
  ingredients,
  groceryListItems,
  cellarItems,
  recentlyUsedIngredients,
  recipes,
  recipeContents,
  recipeIngredients,
  recipeFavorites,
  images,
  imageSizes,
  imageObjects,
  userImages,
});
