import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  FolderKanban,
  Mail,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { getSuperAdminOverview } from "@/serverFunctions/superAdmin";

const metricCards = [
  { key: "clients", label: "Client workspaces", icon: Building2 },
  { key: "projects", label: "Active websites", icon: FolderKanban },
  { key: "members", label: "Client users", icon: Users },
  { key: "pendingInvitations", label: "Pending invitations", icon: Mail },
] as const;

export function SuperAdminDashboard() {
  const [query, setQuery] = useState("");
  const overview = useQuery({
    queryKey: ["superAdmin", "overview"],
    queryFn: () => getSuperAdminOverview(),
    retry: false,
  });
  const clients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return overview.data?.clients ?? [];
    return (overview.data?.clients ?? []).filter((client) =>
      `${client.name} ${client.slug}`.toLowerCase().includes(normalized),
    );
  }, [overview.data?.clients, query]);

  if (overview.isPending) {
    return <span className="loading loading-spinner loading-md" />;
  }

  if (overview.isError || !overview.data) {
    return (
      <div role="alert" className="alert alert-error">
        You do not have access to the DGTL super-admin dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <ShieldCheck className="size-4" /> DGTL platform administration
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            Client management
          </h1>
          <p className="mt-1 text-sm text-base-content/60">
            Monitor isolated client workspaces, their websites, users, and
            outstanding invitations.
          </p>
        </div>
        <span className="badge badge-success gap-1.5 py-3">
          <ShieldCheck className="size-3.5" /> Super admin
        </span>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(({ key, label, icon: Icon }) => (
          <article
            key={key}
            className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between text-base-content/55">
              <span className="text-sm">{label}</span>
              <Icon className="size-4" />
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {overview.data.totals[key]}
            </p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-base-300 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Client workspaces</h2>
            <p className="text-sm text-base-content/55">
              One organization per client keeps access and data isolated.
            </p>
          </div>
          <label className="input input-bordered input-sm flex items-center gap-2 sm:w-72">
            <Search className="size-4 text-base-content/45" />
            <input
              aria-label="Search clients"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or slug"
              className="grow"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Websites</th>
                <th>Users</th>
                <th>Pending invites</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <div className="font-medium">{client.name}</div>
                    <div className="text-xs text-base-content/45">
                      {client.slug}
                    </div>
                  </td>
                  <td className="tabular-nums">{client.projectCount}</td>
                  <td className="tabular-nums">{client.memberCount}</td>
                  <td className="tabular-nums">
                    {client.pendingInvitationCount}
                  </td>
                  <td className="text-sm text-base-content/65">
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                    }).format(new Date(client.createdAt))}
                  </td>
                </tr>
              ))}
              {clients.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-10 text-center text-base-content/55"
                  >
                    No client workspaces match this search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
