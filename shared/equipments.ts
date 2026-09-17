export const EQUIPMENTS = [
  "oven",
  "rice cooker",
  "air fryer",
  "microwave",
  "slow cooker",
  "mixer",
  "grill",
  "pressure cooker",
  "toaster",
  "blender",
  "food processor",
  "waffle maker",
  "stand mixer",
] as const;

/** The vocabulary as a type — what `vEquipments` validates and what a sanitized recipe carries. */
export type Equipment = (typeof EQUIPMENTS)[number];

/**
 * Whether a kitchen owning `kitchen` can make a recipe declaring `needs`.
 *
 * `needs` lists ALTERNATIVES, which is the sanitizer's own contract: "six hours in the slow cooker,
 * or the same covered in the oven" carries both appliances because the cook needs any ONE of them.
 * So one appliance in common is enough, and an empty `needs` is a recipe made with pans and a
 * knife alone — it passes every kitchen, an empty one included.
 *
 * That last rule is not the untimed-recipe rule of `candidatePool`: an empty list is a positive
 * answer the sanitizer was asked for ("empty is a normal answer"), not data nobody wrote.
 */
export const canBeMadeWith = (needs: readonly Equipment[], kitchen: readonly Equipment[]): boolean =>
  needs.length === 0 || needs.some((equipment) => kitchen.includes(equipment));
