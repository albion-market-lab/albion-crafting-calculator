export interface CraftTarget {
  itemId: string;
  quantity: number;
}

export interface CatalogItem {
  itemId: string;
  displayName: string;
  tier?: number;
  category?: string;
  /** Explicitly marks an item that should be bought instead of expanded. */
  purchasable: boolean;
}

export interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

interface RecipeBase {
  recipeId: string;
  outputItemId: string;
  outputQuantity: number;
  ingredients: RecipeIngredient[];
}

export interface CraftingRecipe extends RecipeBase {
  recipeType: "crafting";
}

export interface RefiningRecipe extends RecipeBase {
  recipeType: "refining";
}

export interface CatalogData {
  items: CatalogItem[];
  craftingRecipes: CraftingRecipe[];
  refiningRecipes: RefiningRecipe[];
}

export interface CalculationInput {
  targets: CraftTarget[];
  catalog: CatalogData;
}

export interface ProcessPlan {
  itemId: string;
  requiredQuantity: number;
  processCount: number;
  outputQuantity: number;
  surplusQuantity: number;
}

export interface ShoppingListItem {
  itemId: string;
  quantity: number;
}

export interface RecipeWarning {
  code: "TERMINAL_MATERIAL";
  itemId: string;
  message: string;
}

export interface CalculationResult {
  craftOutputs: ProcessPlan[];
  refiningPlan: ProcessPlan[];
  shoppingList: ShoppingListItem[];
  recipeWarnings: RecipeWarning[];
}
