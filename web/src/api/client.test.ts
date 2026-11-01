import { afterEach, expect, test, vi } from "vitest";
import { identityApi } from "./identity";
import { sunApi } from "./sun";
import { setSessionExpiredHandler } from "./client";
import { fakeApi, json, testUser } from "../test/fakeApi";

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionExpiredHandler(() => {});
});

test("every request carries the CSRF header", async () => {
  const api = fakeApi({ "GET /api/v1/auth/me": json(200, testUser) });
  await identityApi.GET("/me");
  expect(api.calls[0]?.headers.get("X-Shotlyst-Client")).toBe("web");
});

test("a 401 is refreshed once and the original request retried with its body", async () => {
  let patched = 0;
  const api = fakeApi({
    "PATCH /api/v1/auth/me": async (req) => {
      patched++;
      if (patched === 1) return json(401, { title: "Unauthorized", status: 401 });
      expect(await req.json()).toEqual({ display_name: "Kim" });
      return json(200, testUser);
    },
    "POST /api/v1/auth/refresh": json(204),
  });

  const { data, response } = await identityApi.PATCH("/me", { body: { display_name: "Kim" } });
  expect(response.status).toBe(200);
  expect(data?.display_name).toBe("Kim");
  expect(api.count("POST", "/api/v1/auth/refresh")).toBe(1);
});

test("concurrent 401s share one refresh, across services", async () => {
  let refreshed = false;
  const unauthorizedUntilRefresh = (ok: Response) => () =>
    refreshed ? ok.clone() : json(401, { title: "Unauthorized", status: 401 });
  const api = fakeApi({
    "GET /api/v1/auth/me": unauthorizedUntilRefresh(json(200, testUser)),
    "GET /api/v1/sun/times": unauthorizedUntilRefresh(json(200, {})),
    "POST /api/v1/auth/refresh": async () => {
      await new Promise((r) => setTimeout(r, 10));
      refreshed = true;
      return json(204);
    },
  });

  const [me, sun] = await Promise.all([
    identityApi.GET("/me"),
    sunApi.GET("/times", { params: { query: { lat: 1, lon: 2, date: "2026-11-01", tz: "UTC" } } }),
  ]);
  expect([me.response.status, sun.response.status]).toEqual([200, 200]);
  expect(api.count("POST", "/api/v1/auth/refresh")).toBe(1);
});

test("a failed refresh reports the session as expired and returns the 401", async () => {
  const expired = vi.fn();
  setSessionExpiredHandler(expired);
  fakeApi({
    "GET /api/v1/auth/me": json(401, { title: "Unauthorized", status: 401 }),
    "POST /api/v1/auth/refresh": json(401, { title: "Unauthorized", status: 401 }),
  });
  const { response } = await identityApi.GET("/me");
  expect(response.status).toBe(401);
  expect(expired).toHaveBeenCalledOnce();
});

test("a 401 from login means wrong credentials and is not refreshed", async () => {
  const api = fakeApi({ "POST /api/v1/auth/login": json(401, { title: "Unauthorized", status: 401 }) });
  const { response } = await identityApi.POST("/login", { body: { email: "a@b.de", password: "nope nope" } });
  expect(response.status).toBe(401);
  expect(api.count("POST", "/api/v1/auth/refresh")).toBe(0);
});
