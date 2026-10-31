export interface CraftTarget {
  itemId: string;
  quantity: number;
}

export interface CatalogItem {
  itemId: string;
  displayName: string;
  tier?: number;
  enchantment: number;
  category?: string;
  purchasable: boolean;
  terminalStatus: TerminalStatus;
  nameStatus: string;
  hasCraftingRecipe: boolean;
  hasRefiningRecipe: boolean;
  sourceUrl: string;
}

export type TerminalStatus = "terminal" | "requires_recipe" | "unknown" | "unsupported";

export interface RecipeIngredient {
  itemId: string;
  quantity: number;
  returnEligible?: boolean;
}

interface RecipeBase {
  recipeId: string;
  outputItemId: string;
  outputQuantity: number;
  ingredients: RecipeIngredient[];
  craftBonusCity?: string;
  validationStatus: string;
  notes?: string;
  sourceUrl: string;
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

export interface CatalogManifestV3 {
  schemaVersion: "3";
  importedAt: string;
  source: string;
  counts: { items: number; craftingRecipes: number; refiningRecipes: number };
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
  code: "SPECIAL_TERMINAL_MATERIAL";
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
  activity?: MarketActivity[];
  asOf: string;
  staleAfterHours: number;
  bidIncrement?: number;
  server?: "East/Asia";
  quality?: number;
}

export interface MarketActivity {
  server: string;
  itemId: string;
  city: string;
  quality: number;
  averageDailyUnits: number;
  coverageDays: number;
  observedAt: string;
}

export type BestValueReason = "PRICE_TOO_HIGH" | "LOW_TRADING_ACTIVITY" | "INSUFFICIENT_HISTORY" | "STALE_MARKET_DATA" | "MISSING_MARKET_DATA" | "NO_ECONOMIC_ADVANTAGE" | "ELIGIBLE";

export interface CityPriceCandidate {
  city: RoyalCity;
  status: PriceStatus;
  highestBuyPrice?: number;
  observedAt?: string;
  ageHours?: number;
  bidPrice?: number;
  subtotal?: number;
  lowestSellPrice?: number;
  averageDailyUnits?: number;
  activityCoverageDays?: number;
  activityCapacity48h?: number;
  bestValueReason: BestValueReason;
}

export interface MaterialBuyOrderEstimate {
  itemId: string;
  quantity: number;
  quality: number;
  candidates: CityPriceCandidate[];
  coverage: "complete" | "partial" | "none";
  cheapestCity?: RoyalCity;
  cheapestBidPrice?: number;
  priceOnlySubtotal?: number;
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
  priceOnlyEstimatedTotal: number | null;
  status: "complete" | "partial" | "unavailable";
  warnings: PriceWarning[];
}
