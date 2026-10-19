import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, updateMock, fetchMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  updateMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    customers: { update: updateMock },
    invoices: { list: listMock },
  },
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "am_sk_test"),
}));

import {
  listOrganizationInvoices,
  setOrganizationInvoiceEmails,
} from "./invoices";

const owner = { organizationId: "org_1", role: "owner" };
const admin = { organizationId: "org_1", role: "admin" };

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  listMock.mockResolvedValue({
    nextCursor: null,
    list: [
      {
        stripeId: "in_topup",
        createdAt: 1_000,
        items: [{ periodStart: 1_000, periodEnd: 1_000 }],
      },
      {
        stripeId: "in_renewal",
        createdAt: 2_000,
        items: [
          { periodStart: 300, periodEnd: 900 },
          { periodStart: 100, periodEnd: 600 },
        ],
      },
    ],
  });
  fetchMock.mockImplementation(async (url: string) =>
    Response.json({
      number: `NUM-${url.split("/").at(-2)}`,
      invoice_pdf: `https://pay.stripe.com/${url.split("/").at(-2)}/pdf`,
    }),
  );
});

describe("listOrganizationInvoices", () => {
  it("lists the organization's invoices, newest first, with the Stripe number and PDF", async () => {
    await expect(listOrganizationInvoices(owner)).resolves.toEqual({
      hasMore: false,
      invoices: [
        expect.objectContaining({
          id: "in_renewal",
          number: "NUM-in_renewal",
          pdfUrl: "https://pay.stripe.com/in_renewal/pdf",
          periodStart: 100,
          periodEnd: 900,
        }),
        expect.objectContaining({
          id: "in_topup",
          periodStart: null,
          periodEnd: null,
        }),
      ],
    });
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "org_1" }),
    );
  });

  it("refuses a member without the billing permission", async () => {
    await expect(listOrganizationInvoices(admin)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(listMock).not.toHaveBeenCalled();
  });
});

describe("setOrganizationInvoiceEmails", () => {
  it("stores the setting on the organization's Autumn customer", async () => {
    await setOrganizationInvoiceEmails(owner, false);

    expect(updateMock).toHaveBeenCalledWith({
      customerId: "org_1",
      sendEmailReceipts: false,
    });
  });

  it("refuses a member without the billing permission", async () => {
    await expect(
      setOrganizationInvoiceEmails(admin, true),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
