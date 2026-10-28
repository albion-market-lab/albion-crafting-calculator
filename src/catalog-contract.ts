import { CalculationError } from "./errors.js";
import { RecipeResolver } from "./recipe-resolver.js";
import type { CatalogData, CatalogManifestV3, CraftingRecipe, RefiningRecipe } from "./types.js";

type CatalogRecipe = CraftingRecipe | RefiningRecipe;

export function assertCatalogDataV3(value: unknown): asserts value is CatalogData {
  const catalog = value as Partial<CatalogData> | null;
  if (!Array.isArray(catalog?.items) || !Array.isArray(catalog.craftingRecipes) || !Array.isArray(catalog.refiningRecipes)) {
    throw new CalculationError("INVALID_CATALOG", "CatalogData v3 must contain item, crafting recipe, and refining recipe arrays.");
  }
  const validItems = catalog.items.every((item) => item && typeof item.itemId === "string" && typeof item.displayName === "string" && Number.isInteger(item.enchantment) && item.enchantment >= 0 && item.enchantment <= 4 &&
    typeof item.nameStatus === "string" && typeof item.sourceUrl === "string" && typeof item.hasCraftingRecipe === "boolean" && typeof item.hasRefiningRecipe === "boolean");
  const validRecipes = (recipes: unknown[], recipeType: CatalogRecipe["recipeType"]) => recipes.every((value) => {
    const recipe = value as Partial<CatalogRecipe>;
    return recipe?.recipeType === recipeType && typeof recipe.validationStatus === "string" && typeof recipe.sourceUrl === "string" && Array.isArray(recipe.ingredients) &&
      recipe.ingredients.every((ingredient) => ingredient && (ingredient.returnEligible === undefined || typeof ingredient.returnEligible === "boolean"));
  });
  if (!validItems || !validRecipes(catalog.craftingRecipes, "crafting") || !validRecipes(catalog.refiningRecipes, "refining")) {
    throw new CalculationError("INVALID_CATALOG", "CatalogData does not match the v3 metadata contract.");
  }
  new RecipeResolver(catalog as CatalogData);
}

export function assertCatalogManifestV3(value: unknown, catalog?: CatalogData): asserts value is CatalogManifestV3 {
  const manifest = value as Partial<CatalogManifestV3> | null;
  const counts = manifest?.counts;
  if (manifest?.schemaVersion !== "3" || typeof manifest.importedAt !== "string" || !Number.isFinite(Date.parse(manifest.importedAt)) || typeof manifest.source !== "string" || !manifest.source ||
      !counts || !Number.isInteger(counts.items) || counts.items < 0 || !Number.isInteger(counts.craftingRecipes) || counts.craftingRecipes < 0 || !Number.isInteger(counts.refiningRecipes) || counts.refiningRecipes < 0) {
    throw new CalculationError("INVALID_CATALOG", "Catalog manifest must use schemaVersion '3' with valid metadata.", { manifest: value });
  }
  if (catalog && (counts.items !== catalog.items.length || counts.craftingRecipes !== catalog.craftingRecipes.length || counts.refiningRecipes !== catalog.refiningRecipes.length)) {
    throw new CalculationError("INVALID_CATALOG", "Catalog manifest counts do not match CatalogData.", { counts });
  }
}
