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

  it("types the importer manifest as schema v3", () => {
    assertCatalogManifestV3(manifest);
    expect((manifest as CatalogManifestV3).counts).toEqual({ items: 20, craftingRecipes: 2, refiningRecipes: 9 });
  });
});
