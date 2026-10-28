import { CalculationError } from "./errors.js";
import {
  ROYAL_CITIES,
  type BuyOrderEstimateInput,
  type BuyOrderEstimateResult,
  type CityPriceCandidate,
  type MarketPrice,
  type MaterialBuyOrderEstimate,
  type PriceWarning,
  type RoyalCity,
} from "./types.js";

const HOUR_MS = 3_600_000;
const cityOrder = new Map<RoyalCity, number>(ROYAL_CITIES.map((city, index) => [city, index]));

interface ObservedPrice {
  value: MarketPrice;
  observedAtMs: number;
}

export function estimateBuyOrders(input: BuyOrderEstimateInput): BuyOrderEstimateResult {
  const asOfMs = Date.parse(input.asOf);
  const bidIncrement = input.bidIncrement ?? 1;
  const server = input.server ?? "East/Asia";
  const quality = input.quality ?? 1;
  if (!Number.isFinite(asOfMs) || input.staleAfterHours <= 0 || !Number.isFinite(input.staleAfterHours)) {
    throw new CalculationError("INVALID_INPUT", "asOf must be valid and staleAfterHours must be positive.");
  }
  if (!Number.isSafeInteger(bidIncrement) || bidIncrement < 0 || !Number.isInteger(quality) || quality < 1 || quality > 5 || server !== "East/Asia") {
    throw new CalculationError("INVALID_INPUT", "bidIncrement, quality, or server is invalid.");
  }

  const quantities = new Map<string, number>();
  for (const item of input.shoppingList) {
    if (!item.itemId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new CalculationError("INVALID_INPUT", "Shopping-list quantities must be positive safe integers.", { item });
    }
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

  const materials: MaterialBuyOrderEstimate[] = [];
  for (const [itemId, quantity] of quantities) {
    const candidates: CityPriceCandidate[] = ROYAL_CITIES.map((city) => {
      const observed = newest.get(`${itemId}\0${city}`);
      const price = observed?.value.highestBuyPrice;
      if (!observed || typeof price !== "number" || !Number.isSafeInteger(price) || price <= 0) {
        warnings.push({ code: "MISSING_PRICE", itemId, city, message: `BUY price for '${itemId}' in ${city} is missing.` });
        return observed
          ? { city, status: "missing", observedAt: new Date(observed.observedAtMs).toISOString(), ageHours: (asOfMs - observed.observedAtMs) / HOUR_MS }
          : { city, status: "missing" };
      }
      const bidPrice = price + bidIncrement;
      const subtotal = bidPrice * quantity;
      if (!Number.isSafeInteger(bidPrice) || !Number.isSafeInteger(subtotal)) {
        throw new CalculationError("INVALID_INPUT", `Estimated cost for '${itemId}' exceeds the safe integer range.`, { itemId, city });
      }
      const ageHours = (asOfMs - observed.observedAtMs) / HOUR_MS;
      const status = ageHours <= input.staleAfterHours ? "fresh" : "stale";
      if (status === "stale") warnings.push({ code: "STALE_PRICE", itemId, city, message: `BUY price for '${itemId}' in ${city} is ${ageHours} hours old.` });
      return { city, status, highestBuyPrice: price, observedAt: new Date(observed.observedAtMs).toISOString(), ageHours, bidPrice, subtotal };
    });
    const available = candidates.filter((candidate): candidate is CityPriceCandidate & { bidPrice: number; subtotal: number } => candidate.status !== "missing")
      .sort((a, b) => a.bidPrice - b.bidPrice || cityOrder.get(a.city)! - cityOrder.get(b.city)!);
    const coverage = available.length === ROYAL_CITIES.length && available.every(({ status }) => status === "fresh") ? "complete" : available.length ? "partial" : "none";
    if (coverage === "partial") warnings.push({ code: "PARTIAL_COVERAGE", itemId, message: `City coverage for '${itemId}' is partial; the suggested city is not a definitive cheapest-city claim.` });
    const material: MaterialBuyOrderEstimate = { itemId, quantity, quality, candidates, coverage };
    const suggestion = available[0];
    if (suggestion) {
      material.suggestedCity = suggestion.city;
      material.suggestedBidPrice = suggestion.bidPrice;
      material.estimatedSubtotal = suggestion.subtotal;
    }
    materials.push(material);
  }

  const estimated = materials.filter((material): material is MaterialBuyOrderEstimate & { estimatedSubtotal: number } => material.estimatedSubtotal !== undefined);
  const estimatedTotal = estimated.length ? estimated.reduce((total, material) => total + material.estimatedSubtotal, 0) : null;
  if (estimatedTotal !== null && !Number.isSafeInteger(estimatedTotal)) throw new CalculationError("INVALID_INPUT", "Estimated total exceeds the safe integer range.");
  const status = estimated.length === 0 ? "unavailable" : estimated.length === materials.length && materials.every(({ coverage }) => coverage === "complete") ? "complete" : "partial";
  return { materials, estimatedTotal, status, warnings };
}
