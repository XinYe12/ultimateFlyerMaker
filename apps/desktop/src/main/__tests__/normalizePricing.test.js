import { describe, it, expect } from "vitest";
import { normalizePricing } from "../ipc/parseDiscountText.js";

describe("normalizePricing", () => {
  it("leaves a plain single-item price unchanged", () => {
    const result = normalizePricing({ sale_price: "2.99", unit: "", quantity: null, size: "" });
    expect(result.quantity).toBeNull();
    expect(result.unit).toBe("");
    expect(result.sale_price).toBe("2.99");
  });

  it("moves gram-unit quantity into size", () => {
    const result = normalizePricing({ sale_price: "5.99", unit: "g", quantity: 924, size: "" });
    expect(result.size).toBe("924g");
    expect(result.quantity).toBeNull();
    expect(result.unit).toBe("");
  });

  it("moves implicit gram quantity (50–9999 range) into size", () => {
    const result = normalizePricing({ sale_price: "5.99", unit: "", quantity: 650, size: "" });
    expect(result.size).toBe("650g");
    expect(result.quantity).toBeNull();
  });

  it("does NOT move a small multi-buy quantity into size", () => {
    // quantity=2 is below 50 — should stay as multi-buy
    const result = normalizePricing({ sale_price: "4.99", unit: "pcs", quantity: 2, size: "" });
    expect(result.quantity).toBe(2);
    expect(result.size).toBe("");
  });

  it("parses '2for' unit as multi-buy quantity", () => {
    const result = normalizePricing({ sale_price: "4.99", unit: "2for", quantity: null, size: "" });
    expect(result.quantity).toBe("2");
    expect(result.unit).toBe("pcs");
  });

  it("appends gram quantity to existing size string", () => {
    const result = normalizePricing({ sale_price: "3.99", unit: "g", quantity: 360, size: "Box" });
    expect(result.size).toBe("Box 360g");
  });
});
