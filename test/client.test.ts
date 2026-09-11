import { describe, expect, it, vi } from "vitest";
import { ArkoviaClient, ArkoviaError } from "../src/index.js";

describe("ArkoviaClient", () => {
  it("encodes Nxt-compatible requests", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(String(init?.body)).toContain("requestType=getCurrency");
      expect(String(init?.body)).toContain("code=VELR");
      return new Response(JSON.stringify({ currency: "123", code: "VELR" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new ArkoviaClient({
      nodes: ["https://node.example/nxt"],
      fetch: fetchMock as typeof fetch,
    });

    const currency = await client.getCurrency({ code: "VELR" });
    expect(currency.code).toBe("VELR");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails over when a node cannot be reached", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ numberOfBlocks: 42 }), { status: 200 }),
      );

    const client = new ArkoviaClient({
      nodes: ["https://one.example/nxt", "https://two.example/nxt"],
      fetch: fetchMock as typeof fetch,
    });

    const status = await client.getBlockchainStatus();
    expect(status.numberOfBlocks).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces API errors without retrying another node", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ errorCode: 5, errorDescription: "Unknown account" }),
        { status: 200 },
      ),
    );

    const client = new ArkoviaClient({
      nodes: ["https://node.example/nxt"],
      fetch: fetchMock as typeof fetch,
    });

    await expect(client.getBalance("123")).rejects.toBeInstanceOf(ArkoviaError);
  });
});
