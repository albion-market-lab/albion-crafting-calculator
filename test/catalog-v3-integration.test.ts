import { describe, expect, it } from "vitest";
import { assertCatalogDataV3, assertCatalogManifestV3, calculateMaterials } from "../src/index.js";
import type { CatalogManifestV3 } from "../src/types.js";
import catalog from "./fixtures/catalog-v3.json" with { type: "json" };
import manifest from "./fixtures/manifest-v3.json" with { type: "json" };

describe("CatalogData v3 integration", () => {
  it("accepts importer output with metadata unchanged and matches real golden totals", () => {
    assertCatalogDataV3(catalog);
    assertCatalogManifestV3(manifest, catalog);
    const result = calculateMaterials({
      targets: [{ itemId: "T6_ARMOR_CLOTH_SET1", quantity: 100 }, { itemId: "T5_SHOES_PLATE_SET1", quantity: 20 }],
      catalog,
    });
    expect(result.craftOutputs).toEqual([
      { itemId: "T6_ARMOR_CLOTH_SET1", requiredQuantity: 100, processCount: 100, outputQuantity: 100, surplusQuantity: 0 },
      { itemId: "T5_SHOES_PLATE_SET1", requiredQuantity: 20, processCount: 20, outputQuantity: 20, surplusQuantity: 0 },
    ]);
    expect(result.shoppingList).toEqual([
      { itemId: "T2_FIBER", quantity: 1600 }, { itemId: "T2_ORE", quantity: 160 },
      { itemId: "T3_FIBER", quantity: 3200 }, { itemId: "T3_ORE", quantity: 320 },
      { itemId: "T4_FIBER", quantity: 3200 }, { itemId: "T4_ORE", quantity: 320 },
      { itemId: "T5_FIBER", quantity: 4800 }, { itemId: "T5_ORE", quantity: 480 },
      { itemId: "T6_FIBER", quantity: 6400 },
    ]);
    expect(catalog.items[0]).toMatchObject({ enchantment: 0, nameStatus: "name_verified", sourceUrl: expect.stringContaining("ao-bin-dumps") });
    expect(catalog.craftingRecipes[0]).toMatchObject({ validationStatus: "upstream_snapshot", craftBonusCity: "Fort Sterling", ingredients: [{ itemId: "T6_CLOTH", quantity: 16, returnEligible: true }] });
  });

  it("types the importer manifest as schema v3", () => {
    assertCatalogManifestV3(manifest);
    expect((manifest as CatalogManifestV3).counts).toEqual({ items: 20, craftingRecipes: 2, refiningRecipes: 9 });
  });
});
