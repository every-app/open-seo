import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboardingRedirect } from "./useOnboardingRedirect";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  navigate: vi.fn(),
  effects: [] as Array<() => void>,
}));
vi.mock("react", () => ({
  useEffect: (effect: () => void) => mocks.effects.push(effect),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("./onboardingModel", () => ({
  onboardingAnswersQueryOptions: () => ({}),
}));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { id: "user", emailVerified: true } } }),
}));
vi.mock("@/lib/auth-mode", () => ({
  isHostedClientAuthMode: () => true,
  isEmailVerificationBypassed: () => false,
}));

describe("onboarding destination gate", () => {
  beforeEach(() => {
    mocks.effects.length = 0;
    vi.stubGlobal("window", { location: { pathname: "/" } });
  });
  it("blocks project navigation while onboarding state is loading", () => {
    mocks.query.mockReturnValue({ data: undefined, isLoading: true });
    expect(useOnboardingRedirect()).toBe(true);
    mocks.effects.forEach((effect) => effect());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("sends a new user to onboarding before mounting the dashboard", () => {
    mocks.query.mockReturnValue({ data: { completedAt: null } });
    expect(useOnboardingRedirect()).toBe(true);
    mocks.effects.forEach((effect) => effect());
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: 0 },
      replace: true,
    });
  });
  it("allows a returning completed user to open their dashboard", () => {
    mocks.query.mockReturnValue({
      data: { completedAt: "2026-09-24T00:00:00Z" },
    });
    expect(useOnboardingRedirect()).toBe(false);
    mocks.effects.forEach((effect) => effect());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("surfaces rejected sessions for recovery rather than starting onboarding", () => {
    const error = new Error("DGTL_REAUTH_REQUIRED");
    mocks.query.mockReturnValue({ error, isError: true });
    expect(() => useOnboardingRedirect()).toThrow(error);
    mocks.effects.forEach((effect) => effect());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
