import { Pencil, Trash2 } from "lucide-react";
import { PortalMenu } from "@/client/components/PortalMenu";
import { formatRelativeTime } from "@/client/lib/relative-time";
import type { ReportTemplate } from "@/types/schemas/report-templates";

export function ReportTemplatesList({
  templates,
  onEdit,
  onDelete,
}: {
  templates: ReportTemplate[];
  onEdit: (template: ReportTemplate) => void;
  onDelete: (template: ReportTemplate) => void;
}) {
  if (templates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-base-300 px-4 py-6 text-sm text-base-content/60">
        No templates yet. A template is a reusable brief for a kind of report:
        who it is for, which sections it has, how it sounds.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => (
            <tr key={template.id}>
              <td className="font-medium">{template.name}</td>
              <td className="max-w-[420px] text-base-content/70">
                {template.description}
              </td>
              <td className="whitespace-nowrap text-base-content/70">
                {formatRelativeTime(template.updatedAt)}
              </td>
              <td className="w-10 text-right">
                <PortalMenu ariaLabel={`Actions for ${template.name}`}>
                  {(close) => (
                    <>
                      <li>
                        <button
                          onClick={() => {
                            close();
                            onEdit(template);
                          }}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </button>
                      </li>
                      <li>
                        <button
                          className="text-error"
                          onClick={() => {
                            close();
                            onDelete(template);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      </li>
                    </>
                  )}
                </PortalMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
