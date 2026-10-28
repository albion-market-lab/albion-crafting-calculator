import { CalculationError } from "./errors.js";
import { RecipeResolver } from "./recipe-resolver.js";
import type { CalculationInput, CalculationResult, ProcessPlan, RecipeWarning } from "./types.js";

const add = (map: Map<string, number>, itemId: string, quantity: number): void => {
  map.set(itemId, (map.get(itemId) ?? 0) + quantity);
};

export function calculateMaterials(input: CalculationInput): CalculationResult {
  if (input.targets.length === 0) throw new CalculationError("INVALID_INPUT", "At least one craft target is required.");
  const resolver = new RecipeResolver(input.catalog);
  const targets = new Map<string, number>();
  for (const target of input.targets) {
    if (!target.itemId || !Number.isInteger(target.quantity) || target.quantity <= 0) {
      throw new CalculationError("INVALID_INPUT", "Target quantity must be a positive integer.", { target });
    }
    add(targets, target.itemId, target.quantity);
  }

  const materialDemand = new Map<string, number>();
  const craftOutputs: ProcessPlan[] = [];
  for (const [itemId, requiredQuantity] of targets) {
    const recipe = resolver.requireCraftingRecipe(itemId);
    const processCount = Math.ceil(requiredQuantity / recipe.outputQuantity);
    const outputQuantity = processCount * recipe.outputQuantity;
    craftOutputs.push({ itemId, requiredQuantity, processCount, outputQuantity, surplusQuantity: outputQuantity - requiredQuantity });
    recipe.ingredients.forEach((ingredient) => add(materialDemand, ingredient.itemId, ingredient.quantity * processCount));
  }

  const depths = new Map<string, number>();
  const visit = (itemId: string, path: string[]): number => {
    const cached = depths.get(itemId);
    if (cached !== undefined) return cached;
    const cycleAt = path.indexOf(itemId);
    if (cycleAt >= 0) {
      const cycle = [...path.slice(cycleAt), itemId];
      throw new CalculationError("CIRCULAR_DEPENDENCY", `Circular refining dependency: ${cycle.join(" -> ")}.`, { cycle });
    }
    const item = resolver.requireItem(itemId);
    const recipe = resolver.getRefiningRecipe(itemId);
    if (!recipe) {
      if (item.terminalStatus === "terminal") {
        depths.set(itemId, 0);
        return 0;
      }
      if (item.terminalStatus === "unknown") throw new CalculationError("UNKNOWN_MATERIAL", `Material '${itemId}' has unknown catalog status and cannot be purchased safely.`, { itemId, terminalStatus: item.terminalStatus, reason: "No verified terminal classification or refining recipe." });
      if (item.terminalStatus === "unsupported") throw new CalculationError("UNSUPPORTED_MATERIAL", `Material '${itemId}' requires unsupported handling.`, { itemId, terminalStatus: item.terminalStatus, reason: "The catalog marks this material as unsupported." });
      throw new CalculationError("REFINING_RECIPE_NOT_FOUND", `Required refining recipe for '${itemId}' was not found.`, { itemId, terminalStatus: item.terminalStatus, reason: "Catalog status requires a recipe." });
    }
    const depth = 1 + Math.max(...recipe.ingredients.map((ingredient) => visit(ingredient.itemId, [...path, itemId])));
    depths.set(itemId, depth);
    return depth;
  };
  [...materialDemand.keys()].forEach((itemId) => visit(itemId, []));

  const refiningPlan: ProcessPlan[] = [];
  const ordered = [...depths.entries()].filter(([, depth]) => depth > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [itemId] of ordered) {
    const requiredQuantity = materialDemand.get(itemId) ?? 0;
    if (requiredQuantity === 0) continue;
    const recipe = resolver.getRefiningRecipe(itemId)!;
    const processCount = Math.ceil(requiredQuantity / recipe.outputQuantity);
    const outputQuantity = processCount * recipe.outputQuantity;
    refiningPlan.push({ itemId, requiredQuantity, processCount, outputQuantity, surplusQuantity: outputQuantity - requiredQuantity });
    recipe.ingredients.forEach((ingredient) => add(materialDemand, ingredient.itemId, ingredient.quantity * processCount));
  }

  const shoppingList = [...materialDemand.entries()]
    .filter(([itemId]) => depths.get(itemId) === 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
  const recipeWarnings: RecipeWarning[] = shoppingList.map(({ itemId }) => ({
    code: "TERMINAL_MATERIAL",
    itemId,
    message: `Material '${itemId}' is explicitly terminal/purchasable and has no refining recipe.`,
  }));

  return { craftOutputs, refiningPlan, shoppingList, recipeWarnings };
}
