import { CalculationError } from "./errors.js";
import { ROYAL_CITIES, type ActivityDataStatus, type BuyOrderEstimateInput, type BuyOrderEstimateResult, type CityPriceCandidate, type MarketActivity, type MarketPrice, type MaterialBuyOrderEstimate, type PriceWarning, type RoyalCity } from "./types.js";

export const BEST_VALUE_POLICY = {
  maxEstimatedDays: 2, activityCoverageDays: 5, evaluationIntervalHours: 24,
  priceStaleAfterHours: 6, bidIncrement: 1,
} as const;

const HOUR_MS = 3_600_000;
const cityOrder = new Map<RoyalCity, number>(ROYAL_CITIES.map((city, index) => [city, index]));
interface ObservedPrice { value: MarketPrice; observedAtMs: number }
interface ObservedActivity { value: MarketActivity; observedAtMs: number }

function activityStatus(observed: ObservedActivity | undefined, asOfMs: number): ActivityDataStatus {
  if (!observed) return "missing";
  if (observed.value.coverageDays < BEST_VALUE_POLICY.activityCoverageDays) return "insufficient_history";
  if ((asOfMs - observed.observedAtMs) / HOUR_MS > BEST_VALUE_POLICY.evaluationIntervalHours) return "stale";
  return observed.value.averageDailyUnits === 0 ? "no_volume" : "valid";
}

export function estimateBuyOrders(input: BuyOrderEstimateInput): BuyOrderEstimateResult {
  const asOfMs = Date.parse(input.asOf);
  const bidIncrement = input.bidIncrement ?? BEST_VALUE_POLICY.bidIncrement;
  const server = input.server ?? "East/Asia";
  const quality = input.quality ?? 1;
  if (!Number.isFinite(asOfMs) || input.staleAfterHours <= 0 || !Number.isFinite(input.staleAfterHours)) throw new CalculationError("INVALID_INPUT", "asOf must be valid and staleAfterHours must be positive.");
  if (!Number.isSafeInteger(bidIncrement) || bidIncrement < 0 || !Number.isInteger(quality) || quality < 1 || quality > 5 || server !== "East/Asia") throw new CalculationError("INVALID_INPUT", "bidIncrement, quality, or server is invalid.");

  const quantities = new Map<string, number>();
  for (const item of input.shoppingList) {
    if (!item.itemId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new CalculationError("INVALID_INPUT", "Shopping-list quantities must be positive safe integers.", { item });
    const quantity = (quantities.get(item.itemId) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) throw new CalculationError("INVALID_INPUT", `Quantity for '${item.itemId}' exceeds the safe integer range.`);
    quantities.set(item.itemId, quantity);
  }

  const warnings: PriceWarning[] = [];
  const newest = new Map<string, ObservedPrice>();
  for (const price of input.prices) {
    if (!quantities.has(price.itemId) || price.server !== server || price.quality !== quality || !ROYAL_CITIES.includes(price.city as RoyalCity)) continue;
    const observedAtMs = Date.parse(price.highestBuyObservedAt ?? "");
    if (!Number.isFinite(observedAtMs) || observedAtMs > asOfMs) {
      warnings.push({ code: "INVALID_TIMESTAMP", itemId: price.itemId, city: price.city as RoyalCity, message: `BUY timestamp for '${price.itemId}' in ${price.city} is invalid.` });
      continue;
    }
    const key = `${price.itemId}\0${price.city}`;
    const current = newest.get(key);
    if (!current || observedAtMs >= current.observedAtMs) newest.set(key, { value: price, observedAtMs });
  }

  const activity = new Map<string, ObservedActivity>();
  for (const value of input.activity ?? []) {
    if (!quantities.has(value.itemId) || value.server !== server || value.quality !== quality || !ROYAL_CITIES.includes(value.city as RoyalCity)) continue;
    const observedAtMs = Date.parse(value.observedAt);
    if (!Number.isFinite(observedAtMs) || observedAtMs > asOfMs || !Number.isFinite(value.averageDailyUnits) || value.averageDailyUnits < 0 || !Number.isInteger(value.coverageDays) || value.coverageDays < 0) continue;
    const key = `${value.itemId}\0${value.city}`;
    const current = activity.get(key);
    if (!current || observedAtMs >= current.observedAtMs) activity.set(key, { value, observedAtMs });
  }

  const materials: MaterialBuyOrderEstimate[] = [];
  for (const [itemId, quantity] of quantities) {
    const candidates: CityPriceCandidate[] = ROYAL_CITIES.map((city) => {
      const observed = newest.get(`${itemId}\0${city}`);
      const price = observed?.value.highestBuyPrice;
      const marketActivity = activity.get(`${itemId}\0${city}`);
      const averageDailyUnits = marketActivity?.value.averageDailyUnits;
      const estimatedDays = averageDailyUnits !== undefined && averageDailyUnits > 0 ? quantity / averageDailyUnits : undefined;
      const activityFields = {
        activityStatus: activityStatus(marketActivity, asOfMs),
        ...(averageDailyUnits === undefined ? {} : { averageDailyUnits, activityCoverageDays: marketActivity!.value.coverageDays }),
        ...(estimatedDays === undefined ? {} : { estimatedDays }),
      };
      if (!observed || typeof price !== "number" || !Number.isSafeInteger(price) || price <= 0) {
        warnings.push({ code: "MISSING_PRICE", itemId, city, message: `BUY price for '${itemId}' in ${city} is missing.` });
        return observed ? { city, status: "missing", observedAt: new Date(observed.observedAtMs).toISOString(), ageHours: (asOfMs - observed.observedAtMs) / HOUR_MS, ...activityFields, bestValueReason: "MISSING_MARKET_DATA" } : { city, status: "missing", ...activityFields, bestValueReason: "MISSING_MARKET_DATA" };
      }
      const bidPrice = price + bidIncrement;
      const subtotal = bidPrice * quantity;
      if (!Number.isSafeInteger(bidPrice) || !Number.isSafeInteger(subtotal)) throw new CalculationError("INVALID_INPUT", `Estimated cost for '${itemId}' exceeds the safe integer range.`, { itemId, city });
      const ageHours = (asOfMs - observed.observedAtMs) / HOUR_MS;
      const status = ageHours <= BEST_VALUE_POLICY.priceStaleAfterHours ? "fresh" : "stale";
      if (status === "stale") warnings.push({ code: "STALE_PRICE", itemId, city, message: `BUY price for '${itemId}' in ${city} is ${ageHours} hours old.` });
      const sellObservedAtMs = Date.parse(observed.value.lowestSellObservedAt ?? "");
      const freshSell = Number.isSafeInteger(observed.value.lowestSellPrice) && observed.value.lowestSellPrice! > 0 && Number.isFinite(sellObservedAtMs) && sellObservedAtMs <= asOfMs && (asOfMs - sellObservedAtMs) / HOUR_MS <= BEST_VALUE_POLICY.priceStaleAfterHours ? observed.value.lowestSellPrice! : undefined;
      return {
        city, status, highestBuyPrice: price, observedAt: new Date(observed.observedAtMs).toISOString(), ageHours, bidPrice, subtotal,
        ...(freshSell === undefined ? {} : { lowestSellPrice: freshSell }),
        ...activityFields,
        bestValueReason: status === "stale" ? "STALE_MARKET_DATA" : "INSUFFICIENT_HISTORY",
      };
    });

    const available = candidates.filter((candidate): candidate is CityPriceCandidate & { bidPrice: number; subtotal: number } => candidate.status !== "missing").sort((a, b) => a.bidPrice - b.bidPrice || cityOrder.get(a.city)! - cityOrder.get(b.city)!);
    const fresh = available.filter((candidate) => candidate.status === "fresh");
    for (const candidate of fresh) {
      if (candidate.activityStatus === "missing") candidate.bestValueReason = "MISSING_ACTIVITY";
      else if (candidate.activityStatus === "insufficient_history") candidate.bestValueReason = "INSUFFICIENT_HISTORY";
      else if (candidate.activityStatus === "stale") candidate.bestValueReason = "STALE_ACTIVITY";
      else if (candidate.activityStatus === "no_volume") candidate.bestValueReason = "NO_TRADING_ACTIVITY";
      else if (candidate.estimatedDays === undefined) candidate.bestValueReason = "NO_TRADING_ACTIVITY";
      else if (candidate.estimatedDays > BEST_VALUE_POLICY.maxEstimatedDays) candidate.bestValueReason = "EXCEEDS_TWO_DAY_TARGET";
      else candidate.bestValueReason = "ELIGIBLE";
    }

    const coverage = available.length === ROYAL_CITIES.length && available.every(({ status }) => status === "fresh") ? "complete" : available.length ? "partial" : "none";
    if (coverage === "partial") warnings.push({ code: "PARTIAL_COVERAGE", itemId, message: `City coverage for '${itemId}' is partial; the suggested city is not a definitive cheapest-city claim.` });
    const validActivityCities = candidates.filter(({ activityStatus }) => activityStatus === "valid" || activityStatus === "no_volume").length;
    const material: MaterialBuyOrderEstimate = { itemId, quantity, quality, candidates, coverage, activityCoverage: { validCities: validActivityCities, totalCities: ROYAL_CITIES.length } };
    const cheapest = fresh[0];
    if (cheapest) { material.cheapestCity = cheapest.city; material.cheapestBidPrice = cheapest.bidPrice; material.priceOnlySubtotal = cheapest.subtotal; }
    const suggestion = candidates.filter((candidate): candidate is CityPriceCandidate & { bidPrice: number; subtotal: number; averageDailyUnits: number } => candidate.bestValueReason === "ELIGIBLE").sort((a, b) => a.bidPrice - b.bidPrice || b.averageDailyUnits - a.averageDailyUnits || cityOrder.get(a.city)! - cityOrder.get(b.city)!)[0];
    if (suggestion) { material.suggestedCity = suggestion.city; material.suggestedBidPrice = suggestion.bidPrice; material.estimatedSubtotal = suggestion.subtotal; }
    materials.push(material);
  }

  const recommended = materials.filter((material): material is MaterialBuyOrderEstimate & { estimatedSubtotal: number } => material.estimatedSubtotal !== undefined);
  const completeRecommendation = recommended.length === materials.length;
  const estimatedTotal = completeRecommendation ? recommended.reduce((total, material) => total + material.estimatedSubtotal, 0) : null;
  const priced = materials.filter((material): material is MaterialBuyOrderEstimate & { priceOnlySubtotal: number } => material.priceOnlySubtotal !== undefined);
  const priceOnlyEstimatedTotal = priced.length === materials.length ? priced.reduce((total, material) => total + material.priceOnlySubtotal, 0) : null;
  if ((estimatedTotal !== null && !Number.isSafeInteger(estimatedTotal)) || (priceOnlyEstimatedTotal !== null && !Number.isSafeInteger(priceOnlyEstimatedTotal))) throw new CalculationError("INVALID_INPUT", "Estimated total exceeds the safe integer range.");
  const status = recommended.length === 0 ? "unavailable" : completeRecommendation ? "complete" : "partial";
  return { materials, estimatedTotal, priceOnlyEstimatedTotal, status, warnings };
}
