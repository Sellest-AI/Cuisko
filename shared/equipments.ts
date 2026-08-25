export const EQUIPMENTS = [
  "oven",
  "blender",
  "food processor",
  "mixer",
  "stand mixer",
  "microwave",
  "slow cooker",
  "pressure cooker",
  "rice cooker",
  "air fryer",
  "grill",
  "waffle maker",
  "toaster"
] as const;

/** The vocabulary as a type — what `vEquipments` validates and what a sanitized recipe carries. */
export type Equipment = (typeof EQUIPMENTS)[number];
