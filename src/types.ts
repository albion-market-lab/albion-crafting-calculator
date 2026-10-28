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

export const ROYAL_CITIES = ["Bridgewatch", "Martlock", "Lymhurst", "Fort Sterling", "Thetford"] as const;
export type RoyalCity = (typeof ROYAL_CITIES)[number];
export type PriceStatus = "fresh" | "stale" | "missing";

export interface MarketPrice {
  server: string;
  itemId: string;
  city: string;
  quality: number;
  highestBuyPrice?: number | null;
  highestBuyObservedAt?: string | null;
  lowestSellPrice?: number | null;
  lowestSellObservedAt?: string | null;
}

export interface BuyOrderEstimateInput {
  shoppingList: ShoppingListItem[];
  prices: MarketPrice[];
  asOf: string;
  staleAfterHours: number;
  bidIncrement?: number;
  server?: "East/Asia";
  quality?: number;
}

export interface CityPriceCandidate {
  city: RoyalCity;
  status: PriceStatus;
  highestBuyPrice?: number;
  observedAt?: string;
  ageHours?: number;
  bidPrice?: number;
  subtotal?: number;
}

export interface MaterialBuyOrderEstimate {
  itemId: string;
  quantity: number;
  quality: number;
  candidates: CityPriceCandidate[];
  coverage: "complete" | "partial" | "none";
  suggestedCity?: RoyalCity;
  suggestedBidPrice?: number;
  estimatedSubtotal?: number;
}

export interface PriceWarning {
  code: "INVALID_TIMESTAMP" | "MISSING_PRICE" | "STALE_PRICE" | "PARTIAL_COVERAGE";
  itemId: string;
  city?: RoyalCity;
  message: string;
}

export interface BuyOrderEstimateResult {
  materials: MaterialBuyOrderEstimate[];
  estimatedTotal: number | null;
  status: "complete" | "partial" | "unavailable";
  warnings: PriceWarning[];
}
