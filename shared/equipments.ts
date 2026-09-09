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
