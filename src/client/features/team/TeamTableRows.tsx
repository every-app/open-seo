import { Send, Trash2 } from "lucide-react";
import { PortalMenu } from "@/client/components/PortalMenu";
import { hasOrgPermission } from "@/lib/org-permissions";

import { Badge } from "@/client/components/ui/badge";
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";
const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

function formatRole(role: string) {
  return role
    .split(",")
    .map((name) => ROLE_LABELS[name.trim()] ?? name.trim())
    .join(", ");
}

type Member = {
  id: string;
  userId: string;
  role: string;
  user: { name?: string | null; email: string };
};

type Invitation = {
  id: string;
  email: string;
  role?: string | null;
  expiresAt: Date | string;
};

export function MemberRow({
  member,
  isSelf,
  canManageTeam,
  isOwner,
  isRemoving,
  onRemove,
}: {
  member: Member;
  isSelf: boolean;
  canManageTeam: boolean;
  isOwner: boolean;
  isRemoving: boolean;
  onRemove: () => void;
}) {
  const memberIsOwner = hasOrgPermission(member.role, {
    billing: ["manage"],
  });
  // Owners are protected server-side (only an owner can touch an owner; the
  // last owner can't be removed) — don't render controls that would just 403.
  const canRemove = canManageTeam && !isSelf && (!memberIsOwner || isOwner);

  return (
    <tr className="hover">
      <td className="max-w-[280px]">
        <p className="truncate font-medium" data-ph-mask>
          {member.user.name || member.user.email}
          {isSelf ? (
            <span className="font-normal text-muted-foreground/70"> (you)</span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground/70" data-ph-mask>
          {member.user.email}
        </p>
      </td>
      <td>
        <Badge variant="secondary" className="px-2 text-[11px]">
          {formatRole(member.role)}
        </Badge>
      </td>
      <td className="text-xs text-muted-foreground">Active</td>
      <td>
        {canRemove ? (
          <PortalMenu
            ariaLabel={`Actions for ${member.user.email}`}
            menuClassName="w-52"
          >
            {(close) => (
              <DropdownMenuItem
                className="text-destructive"
                disabled={isRemoving}
                onClick={() => {
                  close();
                  if (
                    window.confirm(
                      `Remove ${member.user.email} from this organization? They lose access immediately.`,
                    )
                  ) {
                    onRemove();
                  }
                }}
              >
                <Trash2 className="size-3.5" />
                Remove member
              </DropdownMenuItem>
            )}
          </PortalMenu>
        ) : null}
      </td>
    </tr>
  );
}

export function InvitationRow({
  invitation,
  canManageTeam,
  isResending,
  isCanceling,
  onResend,
  onCancel,
}: {
  invitation: Invitation;
  canManageTeam: boolean;
  isResending: boolean;
  isCanceling: boolean;
  onResend: () => void;
  onCancel: () => void;
}) {
  return (
    <tr className="hover">
      <td className="max-w-[280px]">
        <p className="truncate font-medium" data-ph-mask>
          {invitation.email}
        </p>
      </td>
      <td>
        <Badge variant="secondary" className="px-2 text-[11px]">
          {formatRole(invitation.role ?? "member")}
        </Badge>
      </td>
      <td className="text-xs text-muted-foreground">
        Invited &middot; expires{" "}
        {new Date(invitation.expiresAt).toLocaleDateString()}
      </td>
      <td>
        {canManageTeam ? (
          <PortalMenu
            ariaLabel={`Actions for the invitation to ${invitation.email}`}
            menuClassName="w-52"
          >
            {(close) => (
              <>
                <DropdownMenuItem
                  disabled={isResending}
                  onClick={() => {
                    close();
                    onResend();
                  }}
                >
                  <Send className="size-3.5" />
                  Resend invitation
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  disabled={isCanceling}
                  onClick={() => {
                    close();
                    onCancel();
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Cancel invitation
                </DropdownMenuItem>
              </>
            )}
          </PortalMenu>
        ) : null}
      </td>
    </tr>
  );
}
