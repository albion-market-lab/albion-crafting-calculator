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
    expect(result).toMatchObject({ status: "unavailable", estimatedTotal: null, priceOnlyEstimatedTotal: 243 });
    expect(result.materials[0]).toMatchObject({ coverage: "partial", cheapestCity: "Bridgewatch", cheapestBidPrice: 81, priceOnlySubtotal: 243 });
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

  it("recommends the cheapest city that can meet the quantity within two days", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T4_ORE", quantity: 3_000 }],
      prices: fiveCities("T4_ORE", [99, 114, 124, 130, 140]),
      activity: [activity("T4_ORE", "Bridgewatch", 1_000), activity("T4_ORE", "Martlock", 2_000), ...ROYAL_CITIES.slice(2).map((city) => activity("T4_ORE", city, 6_000))],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials[0]).toMatchObject({ cheapestCity: "Bridgewatch", suggestedCity: "Martlock", suggestedBidPrice: 115, estimatedSubtotal: 345_000 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Bridgewatch")).toMatchObject({ bestValueReason: "EXCEEDS_TWO_DAY_TARGET", estimatedDays: 3 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Martlock")).toMatchObject({ bestValueReason: "ELIGIBLE", estimatedDays: 1.5 });
  });

  it("allows a qualifying city above the former premium limit and changes eligibility with quantity", () => {
    const base = { prices: fiveCities("T4_HIDE", [99, 114, 130, 140, 150]), activity: [activity("T4_HIDE", "Bridgewatch", 1_000), ...ROYAL_CITIES.slice(1).map((city) => activity("T4_HIDE", city, 2_000))], asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6 };
    const small = estimateBuyOrders({ ...base, shoppingList: [{ itemId: "T4_HIDE", quantity: 1_000 }] });
    expect(small.materials[0]).toMatchObject({ suggestedCity: "Bridgewatch" });
    const large = estimateBuyOrders({ ...base, shoppingList: [{ itemId: "T4_HIDE", quantity: 3_000 }] });
    expect(large.materials[0]).toMatchObject({ cheapestCity: "Bridgewatch", suggestedCity: "Martlock", suggestedBidPrice: 115 });
  });

  it("uses volume then Royal City order as deterministic tie breakers", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T5_FIBER", quantity: 10 }], prices: fiveCities("T5_FIBER", [100, 100, 120, 130, 140]),
      activity: [activity("T5_FIBER", "Bridgewatch", 1_000), activity("T5_FIBER", "Martlock", 2_000)],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials[0]).toMatchObject({ suggestedCity: "Martlock", suggestedBidPrice: 101, estimatedSubtotal: 1_010 });
  });

  it("keeps the cheaper eligible city even when another city has much higher volume", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T5_FIBER", quantity: 1_000 }], prices: fiveCities("T5_FIBER", [99, 104, 120, 130, 140]),
      activity: [activity("T5_FIBER", "Bridgewatch", 5_000), activity("T5_FIBER", "Martlock", 25_000)],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials[0]).toMatchObject({ suggestedCity: "Bridgewatch", suggestedBidPrice: 100 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Bridgewatch")?.estimatedDays).toBe(0.2);
  });

  it("accepts exactly two days, rejects slightly above two, and leaves all-slow materials unrecommended", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T5_HIDE", quantity: 2_000 }], prices: fiveCities("T5_HIDE", [99, 104, 119, 129, 139]),
      activity: [activity("T5_HIDE", "Bridgewatch", 999.9), activity("T5_HIDE", "Martlock", 1_000), ...ROYAL_CITIES.slice(2).map((city) => activity("T5_HIDE", city, 500))],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials[0]).toMatchObject({ cheapestCity: "Bridgewatch", suggestedCity: "Martlock", suggestedBidPrice: 105 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Bridgewatch")).toMatchObject({ bestValueReason: "EXCEEDS_TWO_DAY_TARGET", estimatedDays: expect.any(Number) });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Martlock")).toMatchObject({ bestValueReason: "ELIGIBLE", estimatedDays: 2 });

    const none = estimateBuyOrders({
      shoppingList: [{ itemId: "T5_HIDE", quantity: 3_000 }], prices: fiveCities("T5_HIDE", [99, 104, 119, 129, 139]),
      activity: ROYAL_CITIES.map((city) => activity("T5_HIDE", city, 1_000)), asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(none.materials[0]).toMatchObject({ cheapestCity: "Bridgewatch" });
    expect(none.materials[0]?.suggestedCity).toBeUndefined();
    expect(none).toMatchObject({ status: "unavailable", estimatedTotal: null, priceOnlyEstimatedTotal: 300_000 });
  });

  it("does not use Lowest Sell Order as an eligibility filter", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T6_ORE", quantity: 800 }],
      prices: [
        price("T6_ORE", "Bridgewatch", 46, observedAt, { lowestSellPrice: 47, lowestSellObservedAt: "2026-10-28T05:00:00Z" }),
        price("T6_ORE", "Martlock", 48, observedAt, { lowestSellPrice: 48, lowestSellObservedAt: "2026-10-28T05:00:00Z" }),
      ],
      activity: [activity("T6_ORE", "Bridgewatch", 1_000), activity("T6_ORE", "Martlock", 1_000)],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials[0]).toMatchObject({ suggestedCity: "Bridgewatch", suggestedBidPrice: 47 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Bridgewatch")).toMatchObject({ lowestSellPrice: 47, bestValueReason: "ELIGIBLE", estimatedDays: 0.8 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Martlock")).toMatchObject({ lowestSellPrice: 48, bestValueReason: "ELIGIBLE" });
  });

  it("reports zero, stale, and missing activity without producing misleading durations", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T6_HIDE", quantity: 100 }], prices: fiveCities("T6_HIDE", [100, 101, 102, 103, 104]),
      activity: [activity("T6_HIDE", "Bridgewatch", 0), activity("T6_HIDE", "Martlock", 1_000, 6, "2026-10-27T00:00:00Z")],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Bridgewatch")).toMatchObject({ bestValueReason: "NO_TRADING_ACTIVITY", averageDailyUnits: 0 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Bridgewatch")?.estimatedDays).toBeUndefined();
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Martlock")).toMatchObject({ bestValueReason: "STALE_ACTIVITY", estimatedDays: 0.1 });
    expect(result.materials[0]!.candidates.find(({ city }) => city === "Lymhurst")?.bestValueReason).toBe("MISSING_ACTIVITY");
  });

  it("distinguishes activity quality failures while keeping Lowest Sell Order informational", () => {
    const prices = fiveCities("T5_ORE", [100, 101, 102, 103, 104]);
    prices[3] = price("T5_ORE", "Fort Sterling", 103, "2026-10-27T00:00:00Z");
    prices[4] = price("T5_ORE", "Thetford", 104, observedAt, { lowestSellPrice: 105, lowestSellObservedAt: "2026-10-28T05:00:00Z" });
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T5_ORE", quantity: 300 }], prices,
      activity: [activity("T5_ORE", "Bridgewatch", 1_000, 4), activity("T5_ORE", "Martlock", 100), activity("T5_ORE", "Thetford", 1_000)],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    const reasons = Object.fromEntries(result.materials[0]!.candidates.map(({ city, bestValueReason }) => [city, bestValueReason]));
    expect(reasons).toMatchObject({ Bridgewatch: "INSUFFICIENT_HISTORY", Martlock: "EXCEEDS_TWO_DAY_TARGET", Lymhurst: "MISSING_ACTIVITY", "Fort Sterling": "STALE_MARKET_DATA", Thetford: "ELIGIBLE" });
    expect(result.materials[0]).toMatchObject({ suggestedCity: "Thetford", suggestedBidPrice: 105, estimatedSubtotal: 31_500 });
    expect(result).toMatchObject({ estimatedTotal: 31_500, status: "complete" });
  });

  it("totals every recommended material even when unrelated city coverage is partial", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T4_ORE", quantity: 10 }, { itemId: "T4_HIDE", quantity: 20 }],
      prices: [price("T4_ORE", "Martlock", 100), price("T4_HIDE", "Thetford", 200)],
      activity: [activity("T4_ORE", "Martlock", 1_000), activity("T4_HIDE", "Thetford", 1_000)],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials.map(({ coverage }) => coverage)).toEqual(["partial", "partial"]);
    expect(result.materials.map(({ suggestedCity }) => suggestedCity)).toEqual(["Martlock", "Thetford"]);
    expect(result).toMatchObject({ status: "complete", estimatedTotal: 5_030, priceOnlyEstimatedTotal: 5_030 });
    expect(result.warnings.filter(({ code }) => code === "PARTIAL_COVERAGE")).toHaveLength(2);
  });

  it("keeps totals null when one required material has no recommendation", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T4_ORE", quantity: 10 }, { itemId: "T4_HIDE", quantity: 20 }],
      prices: [price("T4_ORE", "Martlock", 100), price("T4_HIDE", "Thetford", 200)],
      activity: [activity("T4_ORE", "Martlock", 1_000)],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials[0]?.suggestedCity).toBe("Martlock");
    expect(result.materials[1]?.suggestedCity).toBeUndefined();
    expect(result).toMatchObject({ status: "partial", estimatedTotal: null, priceOnlyEstimatedTotal: 5_030 });
  });

  it("never labels or totals entirely stale prices as current cheapest", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T6_ORE", quantity: 5 }],
      prices: [price("T6_ORE", "Bridgewatch", 1, "2026-10-27T00:00:00Z"), price("T6_ORE", "Martlock", 10, "2026-10-27T01:00:00Z")],
      asOf: "2026-10-28T06:00:00Z", staleAfterHours: 6,
    });
    expect(result.materials[0]).toMatchObject({ coverage: "partial" });
    expect(result.materials[0]?.cheapestCity).toBeUndefined();
    expect(result.materials[0]?.priceOnlySubtotal).toBeUndefined();
    expect(result.priceOnlyEstimatedTotal).toBeNull();
  });
});
