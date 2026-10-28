import { describe, expect, it } from "vitest";
import { estimateBuyOrders, ROYAL_CITIES } from "../src/index.js";
import type { MarketPrice, RoyalCity } from "../src/types.js";

const observedAt = "2026-10-28T10:00:00+07:00";
const price = (itemId: string, city: RoyalCity, highestBuyPrice: number | null, highestBuyObservedAt = observedAt, extra: Partial<MarketPrice> = {}): MarketPrice => ({
  server: "East/Asia", itemId, city, quality: 1, highestBuyPrice, highestBuyObservedAt, ...extra,
});
const fiveCities = (itemId: string, values: number[]): MarketPrice[] => ROYAL_CITIES.map((city, index) => price(itemId, city, values[index]!));

describe("estimateBuyOrders", () => {
  it("uses all five fresh cities and resolves ties in Royal City order", () => {
    const result = estimateBuyOrders({
      shoppingList: [{ itemId: "T4_ORE", quantity: 2 }],
      prices: fiveCities("T4_ORE", [100, 100, 120, 130, 140]),
      asOf: "2026-10-28T06:00:00Z",
      staleAfterHours: 6,
    });
    expect(result).toMatchObject({ status: "complete", estimatedTotal: 202 });
    expect(result.materials[0]).toMatchObject({ coverage: "complete", suggestedCity: "Bridgewatch", suggestedBidPrice: 101, estimatedSubtotal: 202 });
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
    expect(result).toMatchObject({ status: "partial", estimatedTotal: 213 });
    expect(result.materials[0]).toMatchObject({ coverage: "partial", suggestedCity: "Martlock", suggestedBidPrice: 71 });
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
    expect(result.materials[0]).toMatchObject({ suggestedCity: "Bridgewatch", suggestedBidPrice: 76, estimatedSubtotal: 304 });
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
    expect(result).toMatchObject({ status: "complete", estimatedTotal: 90 });
    expect(result.materials.map(({ estimatedSubtotal }) => estimatedSubtotal)).toEqual([24, 66]);
  });
});
