import { describe, expect, it } from "vitest";
import { estimateBuyOrders, ROYAL_CITIES } from "../src/index.js";
import type { MarketActivity, MarketPrice, RoyalCity } from "../src/types.js";

const observedAt = "2026-10-28T10:00:00+07:00";
const price = (itemId: string, city: RoyalCity, highestBuyPrice: number | null, highestBuyObservedAt = observedAt, extra: Partial<MarketPrice> = {}): MarketPrice => ({
  server: "East/Asia", itemId, city, quality: 1, highestBuyPrice, highestBuyObservedAt, ...extra,
});
const fiveCities = (itemId: string, values: number[]): MarketPrice[] => ROYAL_CITIES.map((city, index) => price(itemId, city, values[index]!));
const activity = (itemId: string, city: RoyalCity, averageDailyUnits: number, coverageDays = 6, activityObservedAt = "2026-10-28T05:00:00Z"): MarketActivity => ({
  server: "East/Asia", itemId, city, quality: 1, averageDailyUnits, coverageDays, observedAt: activityObservedAt,
});

describe("estimateBuyOrders", () => {
  it("uses all five fresh cities and resolves ties in Royal City order", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T4_ORE", quantity: 2 }],
      prices: fiveCities("T4_ORE", [100, 100, 120, 130, 140]),
      asOf: "2026-10-28T06:00:00Z",
      staleAfterHours: 6,
    });
    expect(result).toMatchObject({ status: "unavailable", estimatedTotal: null, priceOnlyEstimatedTotal: 202 });
    expect(result.materials[0]).toMatchObject({ coverage: "complete", cheapestCity: "Bridgewatch", cheapestBidPrice: 101, priceOnlySubtotal: 202 });
    expect(result.materials[0]!.candidates.map(({ city }) => city)).toEqual(ROYAL_CITIES);
  });

  it("shows stale data with timezone-aware age but marks incomplete city coverage", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T4_ORE", quantity: 3 }],
      prices: [
        price("T4_ORE", "Bridgewatch", 80),
        price("T4_ORE", "Martlock", 70, "2026-10-27T20:00:00Z", { lowestSellPrice: 1, lowestSellObservedAt: "2026-10-28T05:00:00Z" }),
        price("T4_ORE", "Lymhurst", 1, observedAt, { server: "Europe" }),
        price("T4_ORE", "Fort Sterling", 1, observedAt, { quality: 2 }),
        price("T4_ORE@1", "Thetford", 1),
      ],
      asOf: "2026-10-28T06:00:00Z",
      staleAfterHours: 6,
    });
    expect(result).toMatchObject({ status: "unavailable", estimatedTotal: null, priceOnlyEstimatedTotal: 213 });
    expect(result.materials[0]).toMatchObject({ coverage: "partial", cheapestCity: "Martlock", cheapestBidPrice: 71 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Bridgewatch")).toMatchObject({ status: "fresh", ageHours: 3 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Martlock")).toMatchObject({ status: "stale", ageHours: 10 });
  });

  it("treats zero and absent BUY prices as missing, never zero cost", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T4_FIBER", quantity: 10 }],
      prices: [price("T4_FIBER", "Bridgewatch", 0)],
      asOf: "2026-10-28T06:00:00Z",
      staleAfterHours: 6,
    });
    expect(result).toMatchObject({ status: "unavailable", estimatedTotal: null });
    expect(result.materials[0]).toMatchObject({ coverage: "none" });
    expect(result.materials[0]!.candidates.every(({ status }) => status === "missing")).toBe(true);
    expect(result.materials[0]!.candidates[0]).toMatchObject({ observedAt: "2026-10-28T03:00:00.000Z", ageHours: 3 });
  });

  it("chooses the newest duplicate BUY observation and ignores invalid timestamps", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T5_HIDE", quantity: 4 }],
      prices: [
        price("T5_HIDE", "Bridgewatch", 50, "2026-10-28T01:00:00Z"),
        price("T5_HIDE", "Bridgewatch", 75, "2026-10-28T05:00:00Z"),
        price("T5_HIDE", "Martlock", 1, "not-a-date"),
      ],
      asOf: "2026-10-28T06:00:00Z",
      staleAfterHours: 6,
    });
    expect(result.materials[0]).toMatchObject({ cheapestCity: "Bridgewatch", cheapestBidPrice: 76, priceOnlySubtotal: 304 });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "INVALID_TIMESTAMP", city: "Martlock" }));
  });

  it("sums multiple materials and supports a configured bid increment", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T4_ORE", quantity: 2 }, { itemId: "T4_FIBER", quantity: 3 }],
      prices: [...fiveCities("T4_ORE", [10, 11, 12, 13, 14]), ...fiveCities("T4_FIBER", [20, 21, 22, 23, 24])],
      asOf: "2026-10-28T06:00:00Z",
      staleAfterHours: 6,
      bidIncrement: 2,
    });
    expect(result).toMatchObject({ status: "unavailable", estimatedTotal: null, priceOnlyEstimatedTotal: 90 });
    expect(result.materials.map(({ priceOnlySubtotal }) => priceOnlySubtotal)).toEqual([24, 66]);
  });

  it("prefers a slightly more expensive city when the cheapest city cannot cover the required quantity", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T4_ORE", quantity: 100 }],
      prices: fiveCities("T4_ORE", [100, 105, 120, 130, 140]),
      activity: [activity("T4_ORE", "Bridgewatch", 100), activity("T4_ORE", "Martlock", 1_000), ...ROYAL_CITIES.slice(2).map((city) => activity("T4_ORE", city, 5_000))],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials[0]).toMatchObject({ cheapestCity: "Bridgewatch", suggestedCity: "Martlock", suggestedBidPrice: 106, estimatedSubtotal: 10_600 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Bridgewatch")).toMatchObject({ bestValueReason: "LOW_TRADING_ACTIVITY", activityCapacity48h: 40 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Martlock")).toMatchObject({ bestValueReason: "ELIGIBLE" });
  });

  it("rejects high-volume cities outside the price premium and changes eligibility with quantity", () => {
    const base = { prices: fiveCities("T4_HIDE", [100, 110, 130, 140, 150]), activity: ROYAL_CITIES.map((city) => activity("T4_HIDE", city, 1_000)), asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6 };
    const small = estimateBuyOrders({ ...base, shoppingList: [{ itemId: "T4_HIDE", quantity: 300 }] });
    expect(small.materials[0]).toMatchObject({ suggestedCity: "Bridgewatch" });
    expect(small.materials[0]!.candidates.find(({ city }) => city === "Martlock")?.bestValueReason).toBe("PRICE_TOO_HIGH");
    const large = estimateBuyOrders({ ...base, shoppingList: [{ itemId: "T4_HIDE", quantity: 500 }] });
    expect(large.materials[0]?.suggestedCity).toBeUndefined();
    expect(large.materials[0]!.candidates[0]?.bestValueReason).toBe("LOW_TRADING_ACTIVITY");
  });

  it("uses volume then Royal City order as deterministic tie breakers", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T5_FIBER", quantity: 10 }], prices: fiveCities("T5_FIBER", [100, 100, 120, 130, 140]),
      activity: [activity("T5_FIBER", "Bridgewatch", 1_000), activity("T5_FIBER", "Martlock", 2_000)],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials[0]).toMatchObject({ suggestedCity: "Martlock", suggestedBidPrice: 101, estimatedSubtotal: 1_010 });
  });

  it("distinguishes insufficient history, low activity, stale prices, and sell sanity failures", () => {
    const prices = fiveCities("T5_ORE", [100, 101, 102, 103, 104]);
    prices[3] = price("T5_ORE", "Fort Sterling", 103, "2026-10-27T00:00:00Z");
    prices[4] = price("T5_ORE", "Thetford", 104, observedAt, { lowestSellPrice: 105, lowestSellObservedAt: "2026-10-28T05:00:00Z" });
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T5_ORE", quantity: 100 }], prices,
      activity: [activity("T5_ORE", "Bridgewatch", 1_000, 4), activity("T5_ORE", "Martlock", 100), activity("T5_ORE", "Lymhurst", 1_000), activity("T5_ORE", "Thetford", 1_000)],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    const reasons = Object.fromEntries(result.materials[0]!.candidates.map(({ city, bestValueReason }) => [city, bestValueReason]));
    expect(reasons).toMatchObject({ Bridgewatch: "INSUFFICIENT_HISTORY", Martlock: "LOW_TRADING_ACTIVITY", Lymhurst: "ELIGIBLE", "Fort Sterling": "STALE_MARKET_DATA", Thetford: "NO_ECONOMIC_ADVANTAGE" });
    expect(result.materials[0]).toMatchObject({ suggestedCity: "Lymhurst", suggestedBidPrice: 103, estimatedSubtotal: 10_300 });
    expect(result.estimatedTotal).toBeNull();
  });
});
