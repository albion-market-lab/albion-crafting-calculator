import { describe, expect, it } from "vitest";
import { assertCatalogManifestV3, calculateMaterials, CalculationError } from "../src/index.js";
import type { CatalogData } from "../src/types.js";
import { catalogFixture } from "./fixtures/catalog.js";

const calculationError = (fn: () => unknown): CalculationError | undefined => {
  try { fn(); } catch (error) { return error instanceof CalculationError ? error : undefined; }
  return undefined;
};
const errorCode = (fn: () => unknown): string | undefined => calculationError(fn)?.code;

describe("calculateMaterials", () => {
  it("calculates one target with one terminal material", () => {
    const result = calculateMaterials({ targets: [{ itemId: "ONE_MATERIAL_ITEM", quantity: 2 }], catalog: catalogFixture });
    expect(result.shoppingList).toEqual([{ itemId: "RAW_A", quantity: 6 }]);
    expect(result.refiningPlan).toEqual([]);
  });

  it("calculates one target with multiple material types", () => {
    const result = calculateMaterials({ targets: [{ itemId: "MULTI_MATERIAL_ITEM", quantity: 2 }], catalog: catalogFixture });
    expect(result.shoppingList).toEqual([{ itemId: "RAW_A", quantity: 6 }, { itemId: "RAW_B", quantity: 2 }]);
  });

  it("aggregates a shared material across multiple targets", () => {
    const result = calculateMaterials({ targets: [{ itemId: "ONE_MATERIAL_ITEM", quantity: 2 }, { itemId: "SHARED_MATERIAL_ITEM", quantity: 3 }], catalog: catalogFixture });
    expect(result.shoppingList).toContainEqual({ itemId: "RAW_A", quantity: 18 });
  });

  it("expands multi-tier refining recipes recursively", () => {
    const result = calculateMaterials({ targets: [{ itemId: "BATCH_ITEM", quantity: 3 }], catalog: catalogFixture });
    expect(result.refiningPlan).toEqual([
      { itemId: "REFINED_HIGH", requiredQuantity: 2, processCount: 1, outputQuantity: 2, surplusQuantity: 0 },
      { itemId: "REFINED_A", requiredQuantity: 3, processCount: 2, outputQuantity: 4, surplusQuantity: 1 },
    ]);
    expect(result.shoppingList).toEqual([{ itemId: "RAW_A", quantity: 6 }, { itemId: "RAW_B", quantity: 1 }, { itemId: "SPECIAL", quantity: 1 }]);
  });

  it("rounds process count using recipe output quantity", () => {
    const result = calculateMaterials({ targets: [{ itemId: "BATCH_ITEM", quantity: 4 }], catalog: catalogFixture });
    expect(result.craftOutputs).toEqual([{ itemId: "BATCH_ITEM", requiredQuantity: 4, processCount: 2, outputQuantity: 6, surplusQuantity: 2 }]);
    expect(result.refiningPlan[0]).toMatchObject({ itemId: "REFINED_HIGH", requiredQuantity: 4, processCount: 2 });
  });

  it("fails with a structured error when a crafting recipe is unavailable", () => {
    expect(errorCode(() => calculateMaterials({ targets: [{ itemId: "RAW_A", quantity: 1 }], catalog: catalogFixture }))).toBe("CRAFTING_RECIPE_NOT_FOUND");
  });

  it("fails when a recipe references an unknown item ID", () => {
    const catalog: CatalogData = { ...catalogFixture, craftingRecipes: [{ ...catalogFixture.craftingRecipes[0]!, ingredients: [{ itemId: "MISSING", quantity: 1 }] }] };
    expect(errorCode(() => calculateMaterials({ targets: [{ itemId: "ONE_MATERIAL_ITEM", quantity: 1 }], catalog }))).toBe("ITEM_NOT_FOUND");
  });

  it("detects circular refining dependencies and reports the path", () => {
    const catalog: CatalogData = {
      ...catalogFixture,
      items: catalogFixture.items.map((item) => item.itemId === "RAW_A" ? { ...item, terminalStatus: "requires_recipe", purchasable: false, hasRefiningRecipe: true } : item),
      refiningRecipes: [
        ...catalogFixture.refiningRecipes,
        { recipeId: "R_RAW_A", recipeType: "refining", outputItemId: "RAW_A", outputQuantity: 1, ingredients: [{ itemId: "REFINED_A", quantity: 1 }], validationStatus: "fixture", sourceUrl: "fixture" },
      ],
    };
    expect(errorCode(() => calculateMaterials({ targets: [{ itemId: "MULTI_MATERIAL_ITEM", quantity: 1 }], catalog }))).toBe("CIRCULAR_DEPENDENCY");
  });

  it("keeps an explicitly terminal special material in the shopping list", () => {
    const result = calculateMaterials({ targets: [{ itemId: "BATCH_ITEM", quantity: 1 }], catalog: catalogFixture });
    expect(result.shoppingList).toContainEqual({ itemId: "SPECIAL", quantity: 1 });
    expect(result.recipeWarnings).toContainEqual(expect.objectContaining({ code: "TERMINAL_MATERIAL", itemId: "SPECIAL" }));
  });

  it("does not treat an unknown recipe as a terminal material", () => {
    const catalog: CatalogData = { ...catalogFixture, items: catalogFixture.items.map((item) => item.itemId === "REFINED_A" ? { ...item, purchasable: false } : item), refiningRecipes: catalogFixture.refiningRecipes.filter((recipe) => recipe.outputItemId !== "REFINED_A") };
    expect(errorCode(() => calculateMaterials({ targets: [{ itemId: "MULTI_MATERIAL_ITEM", quantity: 1 }], catalog }))).toBe("REFINING_RECIPE_NOT_FOUND");
  });

  it.each([
    ["unknown", "UNKNOWN_MATERIAL"],
    ["unsupported", "UNSUPPORTED_MATERIAL"],
  ] as const)("returns a structured error for %s material", (terminalStatus, code) => {
    const catalog: CatalogData = { ...catalogFixture, items: catalogFixture.items.map((item) => item.itemId === "SPECIAL" ? { ...item, terminalStatus, purchasable: false } : item) };
    expect(calculationError(() => calculateMaterials({ targets: [{ itemId: "BATCH_ITEM", quantity: 1 }], catalog }))).toMatchObject({
      code,
      details: { itemId: "SPECIAL", terminalStatus, reason: expect.any(String) },
    });
  });

  it("rejects contradictory terminal status and purchasable flag", () => {
    const catalog: CatalogData = { ...catalogFixture, items: catalogFixture.items.map((item) => item.itemId === "RAW_A" ? { ...item, purchasable: false } : item) };
    expect(errorCode(() => calculateMaterials({ targets: [{ itemId: "ONE_MATERIAL_ITEM", quantity: 1 }], catalog }))).toBe("INVALID_CATALOG");
  });

  it("rejects duplicate recipe IDs even when outputs differ", () => {
    const catalog: CatalogData = { ...catalogFixture, craftingRecipes: catalogFixture.craftingRecipes.map((recipe, index) => index === 1 ? { ...recipe, recipeId: catalogFixture.craftingRecipes[0]!.recipeId } : recipe) };
    expect(errorCode(() => calculateMaterials({ targets: [{ itemId: "ONE_MATERIAL_ITEM", quantity: 1 }], catalog }))).toBe("INVALID_CATALOG");
  });

  it("validates the separate catalog manifest boundary", () => {
    expect(() => assertCatalogManifestV3({ schemaVersion: "3", importedAt: "2026-10-28T00:00:00Z", source: "fixture", counts: { items: 1, craftingRecipes: 0, refiningRecipes: 0 } })).not.toThrow();
    expect(errorCode(() => assertCatalogManifestV3({ schemaVersion: "2" }))).toBe("INVALID_CATALOG");
    expect(errorCode(() => assertCatalogManifestV3({ schemaVersion: "3", importedAt: "2026-10-28T00:00:00Z", source: "fixture", counts: { items: 0, craftingRecipes: 0, refiningRecipes: 0 } }, catalogFixture))).toBe("INVALID_CATALOG");
  });

  it("aggregates duplicate target rows before applying output rounding", () => {
    const result = calculateMaterials({ targets: [{ itemId: "BATCH_ITEM", quantity: 1 }, { itemId: "BATCH_ITEM", quantity: 2 }], catalog: catalogFixture });
    expect(result.craftOutputs).toHaveLength(1);
    expect(result.craftOutputs[0]).toMatchObject({ requiredQuantity: 3, processCount: 1, outputQuantity: 3 });
  });
});
