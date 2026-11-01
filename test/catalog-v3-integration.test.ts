import { describe, expect, it } from "vitest";
import { assertCatalogDataV3, assertCatalogManifestV3, calculateMaterials } from "../src/index.js";
import type { CatalogManifestV3 } from "../src/types.js";
import catalog from "./fixtures/catalog-v3.json" with { type: "json" };
import expected from "./fixtures/expected-plan-v3.json" with { type: "json" };
import manifest from "./fixtures/manifest-v3.json" with { type: "json" };

describe("CatalogData v3 integration", () => {
  it("accepts importer output with metadata unchanged and matches real golden totals", () => {
    assertCatalogDataV3(catalog);
    assertCatalogManifestV3(manifest, catalog);
    const result = calculateMaterials({
      targets: expected.targets,
      catalog,
    });
    expect(result.craftOutputs).toEqual(expected.craftOutputs);
    expect(result.craftingMaterialBreakdown).toEqual([
      { itemId: "T6_ARMOR_CLOTH_SET1", requiredQuantity: 100, processCount: 100, outputQuantity: 100, surplusQuantity: 0, ingredients: [{ itemId: "T6_CLOTH", quantity: 1600 }] },
      { itemId: "T5_SHOES_PLATE_SET1", requiredQuantity: 20, processCount: 20, outputQuantity: 20, surplusQuantity: 0, ingredients: [{ itemId: "T5_METALBAR", quantity: 160 }] },
    ]);
    expect(result.refiningPlan).toEqual(expected.refiningPlan);
    expect(result.shoppingList).toEqual(expected.shoppingList);
    expect(result.recipeWarnings).toEqual([]);
    expect(catalog.items[0]).toMatchObject({ enchantment: 0, nameStatus: "name_verified", sourceUrl: expect.stringContaining("ao-bin-dumps") });
    expect(catalog.craftingRecipes[0]).toMatchObject({ validationStatus: "upstream_snapshot", craftBonusCity: "Fort Sterling", ingredients: [{ itemId: "T6_CLOTH", quantity: 16, returnEligible: true }] });
  });

  it("aggregates duplicate real targets before expanding common lower tiers", () => {
    assertCatalogDataV3(catalog);
    const result = calculateMaterials({ targets: [{ itemId: "T6_ARMOR_CLOTH_SET1", quantity: 60 }, { itemId: "T6_ARMOR_CLOTH_SET1", quantity: 40 }, { itemId: "T5_SHOES_PLATE_SET1", quantity: 20 }], catalog });
    expect(result.craftOutputs).toEqual(expected.craftOutputs);
    expect(result.refiningPlan).toEqual(expected.refiningPlan);
    expect(result.shoppingList).toEqual(expected.shoppingList);
  });

  it("reconciles every direct crafting and refining input exactly once", () => {
    assertCatalogDataV3(catalog);
    const result = calculateMaterials({ targets: expected.targets, catalog });
    const demand = new Map<string, number>();
    for (const step of [...result.craftingMaterialBreakdown, ...result.refiningMaterialBreakdown]) {
      for (const ingredient of step.ingredients) demand.set(ingredient.itemId, (demand.get(ingredient.itemId) ?? 0) + ingredient.quantity);
    }
    for (const step of result.refiningPlan) expect(demand.get(step.itemId)).toBe(step.requiredQuantity);
    for (const item of result.shoppingList) expect(demand.get(item.itemId)).toBe(item.quantity);
    expect([...demand.keys()].sort()).toEqual([...result.refiningPlan.map(({ itemId }) => itemId), ...result.shoppingList.map(({ itemId }) => itemId)].sort());
  });

  it("types the importer manifest as schema v3", () => {
    assertCatalogManifestV3(manifest);
    expect((manifest as CatalogManifestV3).counts).toEqual({ items: 20, craftingRecipes: 2, refiningRecipes: 9 });
  });
});
