import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedPlayer, getPlayer, type PlayerDetail } from "./api";

// A minimal stand-in: the cache never looks inside a player.
const detail = (id: string) => ({ id, name: `Player ${id}` }) as unknown as PlayerDetail;

function mockFetch(respond: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((url: string) => Promise.resolve(respond(url)));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("getPlayer — remembers each player for the visit", () => {
  it("fetches a player once; a return is served from memory, synchronously too", async () => {
    const fetch = mockFetch((url) => ok(detail(url.split("/").pop()!)));
    expect(cachedPlayer("101")).toBeNull();
    const first = await getPlayer("101");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cachedPlayer("101")).toBe(first); // what a returning page reads in its first render
    expect(await getPlayer("101")).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1); // no second request
  });

  it("shares one request between two asks for the same player in flight", async () => {
    const fetch = mockFetch((url) => ok(detail(url.split("/").pop()!)));
    const [a, b] = await Promise.all([getPlayer("102"), getPlayer("102")]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("doesn't remember a failure: the next ask retries", async () => {
    let calls = 0;
    const fetch = mockFetch(() => (++calls === 1 ? new Response("boom", { status: 500 }) : ok(detail("103"))));
    await expect(getPlayer("103")).rejects.toThrow(/500/);
    expect(cachedPlayer("103")).toBeNull();
    expect((await getPlayer("103")).id).toBe("103");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
