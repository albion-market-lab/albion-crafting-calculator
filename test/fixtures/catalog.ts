import type { CatalogData } from "../../src/types.js";

/** Synthetic, arithmetic-only data. These IDs and ratios are not Albion recipes. */
export const catalogFixture: CatalogData = {
  items: [
    { itemId: "RAW_A", displayName: "Raw A", purchasable: true },
    { itemId: "RAW_B", displayName: "Raw B", purchasable: true },
    { itemId: "SPECIAL", displayName: "Special terminal", purchasable: true },
    { itemId: "REFINED_A", displayName: "Refined A", purchasable: false },
    { itemId: "REFINED_HIGH", displayName: "Refined high", purchasable: false },
    { itemId: "ONE_MATERIAL_ITEM", displayName: "One-material item", purchasable: false },
    { itemId: "MULTI_MATERIAL_ITEM", displayName: "Multi-material item", purchasable: false },
    { itemId: "SHARED_MATERIAL_ITEM", displayName: "Shared-material item", purchasable: false },
    { itemId: "BATCH_ITEM", displayName: "Batch item", purchasable: false },
  ],
  craftingRecipes: [
    { recipeId: "C_ONE", recipeType: "crafting", outputItemId: "ONE_MATERIAL_ITEM", outputQuantity: 1, ingredients: [{ itemId: "RAW_A", quantity: 3 }] },
    { recipeId: "C_MULTI", recipeType: "crafting", outputItemId: "MULTI_MATERIAL_ITEM", outputQuantity: 1, ingredients: [{ itemId: "REFINED_A", quantity: 2 }, { itemId: "RAW_B", quantity: 1 }] },
    { recipeId: "C_SHARED", recipeType: "crafting", outputItemId: "SHARED_MATERIAL_ITEM", outputQuantity: 1, ingredients: [{ itemId: "RAW_A", quantity: 4 }] },
    { recipeId: "C_BATCH", recipeType: "crafting", outputItemId: "BATCH_ITEM", outputQuantity: 3, ingredients: [{ itemId: "REFINED_HIGH", quantity: 2 }, { itemId: "SPECIAL", quantity: 1 }] },
  ],
  refiningRecipes: [
    { recipeId: "R_A", recipeType: "refining", outputItemId: "REFINED_A", outputQuantity: 2, ingredients: [{ itemId: "RAW_A", quantity: 3 }] },
    { recipeId: "R_HIGH", recipeType: "refining", outputItemId: "REFINED_HIGH", outputQuantity: 2, ingredients: [{ itemId: "REFINED_A", quantity: 3 }, { itemId: "RAW_B", quantity: 1 }] },
  ],
};
