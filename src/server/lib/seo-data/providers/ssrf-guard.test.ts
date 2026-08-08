import { describe, it, expect } from "vitest";
import { isPrivateIp, isBlockedHostname, isCrawlTargetBlocked } from "./ssrf-guard";

describe("SSRF Guard", () => {
  describe("isPrivateIp", () => {
    it("blocks loopback addresses", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
      expect(isPrivateIp("::1")).toBe(true);
      expect(isPrivateIp("0.0.0.0")).toBe(true);
    });

    it("blocks private 10.x range", () => {
      expect(isPrivateIp("10.0.0.1")).toBe(true);
      expect(isPrivateIp("10.255.255.255")).toBe(true);
    });

    it("blocks private 172.16-31.x range", () => {
      expect(isPrivateIp("172.16.0.1")).toBe(true);
      expect(isPrivateIp("172.31.255.255")).toBe(true);
    });

    it("does NOT block 172.15.x or 172.32.x", () => {
      expect(isPrivateIp("172.15.0.1")).toBe(false);
      expect(isPrivateIp("172.32.0.1")).toBe(false);
    });

    it("blocks private 192.168.x range", () => {
      expect(isPrivateIp("192.168.0.1")).toBe(true);
      expect(isPrivateIp("192.168.1.100")).toBe(true);
    });

    it("blocks link-local 169.254.x range", () => {
      expect(isPrivateIp("169.254.1.1")).toBe(true);
    });

    it("blocks cloud metadata endpoint 169.254.169.254", () => {
      expect(isPrivateIp("169.254.169.254")).toBe(true);
    });

    it("allows public IPs", () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false);
      expect(isPrivateIp("1.1.1.1")).toBe(false);
      expect(isPrivateIp("142.250.190.46")).toBe(false);
    });
  });

  describe("isBlockedHostname", () => {
    it("blocks localhost", () => {
      expect(isBlockedHostname("localhost")).toBe(true);
    });

    it("blocks .internal TLD", () => {
      expect(isBlockedHostname("api.internal")).toBe(true);
      expect(isBlockedHostname("my-service.internal")).toBe(true);
    });

    it("blocks .local TLD", () => {
      expect(isBlockedHostname("myhost.local")).toBe(true);
    });

    it("blocks .localhost TLD", () => {
      expect(isBlockedHostname("api.localhost")).toBe(true);
    });

    it("blocks metadata.google.internal", () => {
      expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    });

    it("allows public hostnames", () => {
      expect(isBlockedHostname("example.com")).toBe(false);
      expect(isBlockedHostname("api.example.com")).toBe(false);
      expect(isBlockedHostname("google.com")).toBe(false);
    });
  });

  describe("isCrawlTargetBlocked", () => {
    it("blocks localhost URLs", async () => {
      expect(await isCrawlTargetBlocked("http://localhost/")).toBe(true);
      expect(await isCrawlTargetBlocked("http://127.0.0.1/")).toBe(true);
    });

    it("blocks private IP URLs", async () => {
      expect(await isCrawlTargetBlocked("http://10.0.0.1/")).toBe(true);
      expect(await isCrawlTargetBlocked("http://192.168.1.1/")).toBe(true);
      expect(await isCrawlTargetBlocked("http://172.16.0.1/")).toBe(true);
    });

    it("blocks metadata endpoints", async () => {
      expect(
        await isCrawlTargetBlocked("http://169.254.169.254/latest/meta-data/"),
      ).toBe(true);
      expect(
        await isCrawlTargetBlocked("http://metadata.google.internal/"),
      ).toBe(true);
    });

    it("blocks non-http protocols", async () => {
      expect(await isCrawlTargetBlocked("file:///etc/passwd")).toBe(true);
      expect(await isCrawlTargetBlocked("ftp://example.com/")).toBe(true);
    });

    it("blocks malformed URLs", async () => {
      expect(await isCrawlTargetBlocked("not-a-url")).toBe(true);
      expect(await isCrawlTargetBlocked("")).toBe(true);
    });

    it("allows public URLs", async () => {
      expect(await isCrawlTargetBlocked("https://example.com/")).toBe(false);
      expect(await isCrawlTargetBlocked("https://openseo.so/")).toBe(false);
      expect(await isCrawlTargetBlocked("http://example.com/page")).toBe(false);
    });
  });
});