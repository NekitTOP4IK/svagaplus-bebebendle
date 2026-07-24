// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTwitchAuthorizeUrl,
  generateOAuthState,
  readTwitchOAuthConfig,
  exchangeTwitchCode,
  fetchTwitchHelixUser,
} from "@/lib/twitch-oauth";

const mockFetch = vi.fn();

describe("twitch-oauth helpers", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    process.env = { ...originalEnv };
    process.env.TWITCH_CLIENT_ID = "cid";
    process.env.TWITCH_CLIENT_SECRET = "csecret";
    process.env.TWITCH_REDIRECT_URI = "http://localhost:3000/api/auth/twitch/callback";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("readTwitchOAuthConfig requires all three env vars", () => {
    expect(readTwitchOAuthConfig()).toEqual({
      clientId: "cid",
      clientSecret: "csecret",
      redirectUri: "http://localhost:3000/api/auth/twitch/callback",
    });
    delete process.env.TWITCH_CLIENT_SECRET;
    expect(readTwitchOAuthConfig()).toBeNull();
  });

  it("generateOAuthState is 64 hex chars", () => {
    const a = generateOAuthState();
    const b = generateOAuthState();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("buildTwitchAuthorizeUrl sets code flow params", () => {
    const url = new URL(
      buildTwitchAuthorizeUrl(
        {
          clientId: "cid",
          redirectUri: "http://localhost:3000/api/auth/twitch/callback",
        },
        "abc",
      ),
    );
    expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/twitch/callback",
    );
  });

  it("exchangeTwitchCode returns access token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "tok", token_type: "bearer" }),
    });
    const result = await exchangeTwitchCode(readTwitchOAuthConfig()!, "code1");
    expect(result).toEqual({ accessToken: "tok" });
  });

  it("fetchTwitchHelixUser maps helix payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: "123",
            login: "loginx",
            display_name: "LoginX",
            profile_image_url: "https://img/x.png",
          },
        ],
      }),
    });
    const result = await fetchTwitchHelixUser("cid", "tok");
    expect(result).toEqual({
      id: "123",
      login: "loginx",
      displayName: "LoginX",
      profileImageUrl: "https://img/x.png",
    });
  });
});
