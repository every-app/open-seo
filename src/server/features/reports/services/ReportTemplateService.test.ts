import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteReportTemplate,
  saveReportTemplate,
} from "./ReportTemplateService";
import {
  REPORT_TEMPLATE_MAX_PER_PROJECT,
  type ReportTemplate,
} from "@/types/schemas/report-templates";

const mocks = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  insertTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

vi.mock(
  "@/server/features/reports/repositories/ReportTemplateRepository",
  () => ({ ReportTemplateRepository: mocks }),
);

const stored = (overrides: Partial<ReportTemplate> = {}): ReportTemplate => ({
  id: "template_1",
  projectId: "project_1",
  name: "Client-ready audit summary",
  description: "For the site owner, non-technical.",
  instructions: "Audience: the site owner. Sections: what we found.",
  createdBy: "Claude Code",
  createdByUserId: "user_1",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  ...overrides,
});

const save = (
  overrides: Partial<Parameters<typeof saveReportTemplate>[0]> = {},
) =>
  saveReportTemplate({
    projectId: "project_1",
    name: "Client-ready audit summary",
    description: "For the site owner, non-technical.",
    instructions: "Audience: the site owner. Sections: what we found.",
    createdBy: "Claude Code",
    createdByUserId: "user_1",
    ...overrides,
  });

beforeEach(() => {
  mocks.listTemplates.mockResolvedValue([]);
});

describe("saveReportTemplate", () => {
  it("creates a template in the project", async () => {
    const result = await save();

    expect(result.created).toBe(true);
    expect(mocks.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project_1" }),
    );
  });

  it("updates by id instead of inserting", async () => {
    mocks.listTemplates.mockResolvedValue([stored()]);

    const result = await save({ templateId: "template_1", name: "Renamed" });

    expect(result).toEqual({
      templateId: "template_1",
      name: "Renamed",
      created: false,
    });
    expect(mocks.insertTemplate).not.toHaveBeenCalled();
    expect(mocks.updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: "template_1",
        projectId: "project_1",
        name: "Renamed",
      }),
    );
  });

  it("refuses an unknown templateId", async () => {
    await expect(save({ templateId: "template_other" })).rejects.toThrow(
      /No report template template_other/,
    );
  });

  it("refuses a name another template in the project already uses, ignoring case", async () => {
    mocks.listTemplates.mockResolvedValue([
      stored({ id: "template_other", name: "client-ready AUDIT summary" }),
    ]);

    await expect(save()).rejects.toThrow(
      /exists in this project \(id template_other\)/,
    );
    expect(mocks.insertTemplate).not.toHaveBeenCalled();
  });

  it("refuses a create at the per-project cap", async () => {
    mocks.listTemplates.mockResolvedValue(
      Array.from({ length: REPORT_TEMPLATE_MAX_PER_PROJECT }, (_, index) =>
        stored({ id: `template_${index}`, name: `Template ${index}` }),
      ),
    );

    await expect(save()).rejects.toThrow(/report templates, the limit/);
    expect(mocks.insertTemplate).not.toHaveBeenCalled();
  });
});

describe("deleteReportTemplate", () => {
  it("refuses a template that does not resolve in this project", async () => {
    mocks.deleteTemplate.mockResolvedValue(false);

    await expect(
      deleteReportTemplate("project_1", "template_x"),
    ).rejects.toThrow(/No report template template_x/);
    expect(mocks.deleteTemplate).toHaveBeenCalledWith(
      "project_1",
      "template_x",
    );
  });
});
