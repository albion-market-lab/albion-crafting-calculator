export type CalculationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_CATALOG"
  | "ITEM_NOT_FOUND"
  | "CRAFTING_RECIPE_NOT_FOUND"
  | "REFINING_RECIPE_NOT_FOUND"
  | "UNKNOWN_MATERIAL"
  | "UNSUPPORTED_MATERIAL"
  | "CIRCULAR_DEPENDENCY";

export class CalculationError extends Error {
  constructor(
    public readonly code: CalculationErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "CalculationError";
  }
}
