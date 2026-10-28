import { CalculationError } from "./errors.js";
import type { CatalogData, CatalogItem, CraftingRecipe, RefiningRecipe } from "./types.js";

export class RecipeResolver {
  private readonly items: Map<string, CatalogItem>;
  private readonly crafting: Map<string, CraftingRecipe>;
  private readonly refining: Map<string, RefiningRecipe>;

  constructor(catalog: CatalogData) {
    this.items = this.indexUnique(catalog.items, (value) => value.itemId, "item");
    this.crafting = this.indexUnique(catalog.craftingRecipes, (value) => value.outputItemId, "crafting recipe");
    this.refining = this.indexUnique(catalog.refiningRecipes, (value) => value.outputItemId, "refining recipe");
    catalog.items.forEach((item) => {
      const hasRecipe = this.crafting.has(item.itemId) || this.refining.has(item.itemId);
      const validStatus = ["terminal", "requires_recipe", "unknown", "unsupported"].includes(item.terminalStatus);
      if (!validStatus || (item.terminalStatus === "terminal") !== item.purchasable || (item.terminalStatus !== "requires_recipe" && hasRecipe)) {
        throw new CalculationError("INVALID_CATALOG", `Catalog status for '${item.itemId}' contradicts purchasable or recipe data.`, { itemId: item.itemId, terminalStatus: item.terminalStatus, purchasable: item.purchasable, hasRecipe });
      }
    });
    const recipeIds = new Set<string>();
    [...catalog.craftingRecipes, ...catalog.refiningRecipes].forEach((recipe) => {
      if (!recipe.recipeId || recipeIds.has(recipe.recipeId)) {
        throw new CalculationError("INVALID_CATALOG", `Duplicate or empty recipe ID '${recipe.recipeId}'.`, { recipeId: recipe.recipeId });
      }
      recipeIds.add(recipe.recipeId);
      if (!Number.isInteger(recipe.outputQuantity) || recipe.outputQuantity <= 0 || recipe.ingredients.length === 0) {
        throw new CalculationError("INVALID_CATALOG", `Invalid recipe ${recipe.recipeId}.`, { recipeId: recipe.recipeId });
      }
      this.requireItem(recipe.outputItemId);
      recipe.ingredients.forEach((ingredient) => {
        if (!Number.isInteger(ingredient.quantity) || ingredient.quantity <= 0) {
          throw new CalculationError("INVALID_CATALOG", `Invalid ingredient quantity in ${recipe.recipeId}.`, { recipeId: recipe.recipeId, itemId: ingredient.itemId });
        }
        this.requireItem(ingredient.itemId);
      });
    });
  }

  requireItem(itemId: string): CatalogItem {
    const item = this.items.get(itemId);
    if (!item) throw new CalculationError("ITEM_NOT_FOUND", `Catalog item '${itemId}' was not found.`, { itemId });
    return item;
  }

  requireCraftingRecipe(itemId: string): CraftingRecipe {
    this.requireItem(itemId);
    const recipe = this.crafting.get(itemId);
    if (!recipe) throw new CalculationError("CRAFTING_RECIPE_NOT_FOUND", `Crafting recipe for '${itemId}' was not found.`, { itemId });
    return recipe;
  }

  getRefiningRecipe(itemId: string): RefiningRecipe | undefined {
    return this.refining.get(itemId);
  }

  private indexUnique<T>(values: T[], keyOf: (value: T) => string, label: string): Map<string, T> {
    const result = new Map<string, T>();
    for (const value of values) {
      const key = keyOf(value);
      if (!key || result.has(key)) throw new CalculationError("INVALID_CATALOG", `Duplicate or empty ${label} key '${key}'.`, { key });
      result.set(key, value);
    }
    return result;
  }
}
