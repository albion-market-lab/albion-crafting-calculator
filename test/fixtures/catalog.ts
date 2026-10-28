import type { CatalogData, CatalogItem, TerminalStatus } from "../../src/types.js";

const item = (itemId: string, displayName: string, terminalStatus: TerminalStatus, hasCraftingRecipe = false, hasRefiningRecipe = false): CatalogItem => ({
  itemId, displayName, enchantment: 0, purchasable: terminalStatus === "terminal", terminalStatus,
  nameStatus: "name_verified", hasCraftingRecipe, hasRefiningRecipe, sourceUrl: "fixture",
});

/** Synthetic, arithmetic-only data. These IDs and ratios are not Albion recipes. */
export const catalogFixture: CatalogData = {
  items: [
    item("RAW_A", "Raw A", "terminal"),
    item("RAW_B", "Raw B", "terminal"),
    item("SPECIAL", "Special terminal", "terminal"),
    item("REFINED_A", "Refined A", "requires_recipe", false, true),
    item("REFINED_HIGH", "Refined high", "requires_recipe", false, true),
    item("ONE_MATERIAL_ITEM", "One-material item", "requires_recipe", true),
    item("MULTI_MATERIAL_ITEM", "Multi-material item", "requires_recipe", true),
    item("SHARED_MATERIAL_ITEM", "Shared-material item", "requires_recipe", true),
    item("BATCH_ITEM", "Batch item", "requires_recipe", true),
  ],
  craftingRecipes: [
    { recipeId: "C_ONE", recipeType: "crafting", outputItemId: "ONE_MATERIAL_ITEM", outputQuantity: 1, ingredients: [{ itemId: "RAW_A", quantity: 3 }], validationStatus: "fixture", sourceUrl: "fixture" },
    { recipeId: "C_MULTI", recipeType: "crafting", outputItemId: "MULTI_MATERIAL_ITEM", outputQuantity: 1, ingredients: [{ itemId: "REFINED_A", quantity: 2 }, { itemId: "RAW_B", quantity: 1 }], validationStatus: "fixture", sourceUrl: "fixture" },
    { recipeId: "C_SHARED", recipeType: "crafting", outputItemId: "SHARED_MATERIAL_ITEM", outputQuantity: 1, ingredients: [{ itemId: "RAW_A", quantity: 4 }], validationStatus: "fixture", sourceUrl: "fixture" },
    { recipeId: "C_BATCH", recipeType: "crafting", outputItemId: "BATCH_ITEM", outputQuantity: 3, ingredients: [{ itemId: "REFINED_HIGH", quantity: 2 }, { itemId: "SPECIAL", quantity: 1 }], validationStatus: "fixture", sourceUrl: "fixture" },
  ],
  refiningRecipes: [
    { recipeId: "R_A", recipeType: "refining", outputItemId: "REFINED_A", outputQuantity: 2, ingredients: [{ itemId: "RAW_A", quantity: 3 }], validationStatus: "fixture", sourceUrl: "fixture" },
    { recipeId: "R_HIGH", recipeType: "refining", outputItemId: "REFINED_HIGH", outputQuantity: 2, ingredients: [{ itemId: "REFINED_A", quantity: 3 }, { itemId: "RAW_B", quantity: 1 }], validationStatus: "fixture", sourceUrl: "fixture" },
  ],
};
