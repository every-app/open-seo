import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { SuperAdminDashboard } from "@/client/features/super-admin/SuperAdminDashboard";
import { getSuperAdminAccess } from "@/serverFunctions/superAdmin";

export const Route = createFileRoute("/_app/admin/clients")({
  component: SuperAdminClientsRoute,
});

function SuperAdminClientsRoute() {
  const navigate = useNavigate();
  const access = useQuery({
    queryKey: ["superAdmin", "access"],
    queryFn: () => getSuperAdminAccess(),
    retry: false,
  });

  useEffect(() => {
    if (access.data && !access.data.allowed) {
      void navigate({ to: "/", replace: true });
    }
  }, [access.data, navigate]);

  if (access.isPending || !access.data?.allowed) {
    return (
      <div className="grid h-full place-items-center">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-base-100">
      <div className="mx-auto w-full max-w-7xl p-4 py-8 pb-24 sm:p-6 md:py-12 md:pb-12">
        <SuperAdminDashboard />
      </div>
    </div>
  );
}
