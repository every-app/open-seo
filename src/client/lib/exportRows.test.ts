import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { downloadFile } from "@/client/lib/download";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import { exportRows, type ExportFormat } from "./exportRows";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/client/lib/download", () => ({ downloadFile: vi.fn() }));
vi.mock("@/client/lib/exportToSheets", () => ({
  exportTableToSheets: vi.fn(),
}));
vi.mock("@/client/lib/posthog", () => ({ captureClientEvent: vi.fn() }));

const writeText = vi.fn();

describe("exportRows", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { clipboard: { writeText } });
  });

  it.each<ExportFormat>(["csv", "excel", "json", "copy-json", "sheets"])(
    "refuses to export zero rows as %s",
    async (format) => {
      await exportRows({
        format,
        feature: "test",
        headers: ["Keyword"],
        rows: [],
        filename: "empty",
      });

      expect(toast.error).toHaveBeenCalledWith("No data to export");
      expect(downloadFile).not.toHaveBeenCalled();
      expect(exportTableToSheets).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
      expect(captureClientEvent).not.toHaveBeenCalled();
    },
  );

  it("downloads Excel as CSV with an .xls name and tracks the export", async () => {
    await exportRows({
      format: "excel",
      feature: "domain_overview",
      headers: ["Keyword"],
      rows: [["seo audit"]],
      filename: "openseo.so-keywords",
    });

    expect(downloadFile).toHaveBeenCalledWith(
      '"Keyword"\n"seo audit"',
      "openseo.so-keywords.xls",
      "text/csv",
    );
    expect(captureClientEvent).toHaveBeenCalledWith("data:export", {
      source_feature: "domain_overview",
      format: "excel",
      result_count: 1,
    });
  });
});
