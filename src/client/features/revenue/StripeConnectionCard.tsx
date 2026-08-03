import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  ConnectedState,
  IntegrationCard,
} from "@/client/features/integrations/integrationCardParts";
import {
  disconnectStripe,
  getStripeConnection,
  listStripeProducts,
  setStripeProducts,
} from "@/serverFunctions/stripe";

const NONE = "";

/**
 * Stripe revenue connection. The API key is an instance-level env secret
 * (STRIPE_SECRET_KEY), so connecting is picking which Stripe products count
 * as this project's subscription and one-off offerings. See specs/0013.
 */
export function StripeConnectionCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = React.useState(false);
  const [subscriptionId, setSubscriptionId] = React.useState(NONE);
  const [oneOffId, setOneOffId] = React.useState(NONE);

  const connectionKey = ["stripeConnection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getStripeConnection({ data: { projectId } }),
  });
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const needsSetup = connectionQuery.isSuccess && !connection?.keyConfigured;

  const showPicker = picking || (!connected && !needsSetup);
  const productsQuery = useQuery({
    queryKey: ["stripeProducts", projectId],
    queryFn: () => listStripeProducts({ data: { projectId } }),
    enabled: Boolean(showPicker && connectionQuery.isSuccess),
  });
  const products = React.useMemo(
    () => productsQuery.data?.products ?? [],
    [productsQuery.data?.products],
  );

  React.useEffect(() => {
    if (subscriptionId !== NONE || oneOffId !== NONE) return;
    const currentSubscription = products.find((p) => p.isSubscriptionProduct);
    const currentOneOff = products.find((p) => p.isOneOffProduct);
    if (currentSubscription) setSubscriptionId(currentSubscription.productId);
    if (currentOneOff) setOneOffId(currentOneOff.productId);
  }, [products, subscriptionId, oneOffId]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: connectionKey });
    void queryClient.invalidateQueries({
      queryKey: ["stripeRevenue", projectId],
    });
  };

  const setMutation = useMutation({
    mutationFn: () =>
      setStripeProducts({
        data: {
          projectId,
          subscriptionProductId: subscriptionId || null,
          oneOffProductId: oneOffId || null,
        },
      }),
    onSuccess: () => {
      toast.success("Stripe connected");
      setPicking(false);
      invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectStripe({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Stripe disconnected");
      setPicking(false);
      setSubscriptionId(NONE);
      setOneOffId(NONE);
      invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const connectedLabel = [
    connection?.subscriptionProductName,
    connection?.oneOffProductName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <IntegrationCard
      title="Stripe"
      status={
        connectionQuery.isLoading
          ? undefined
          : needsSetup
            ? "setup_required"
            : connected
              ? "connected"
              : "disconnected"
      }
    >
      {connectionQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-base-content/50">
          <span className="loading loading-spinner loading-sm" />
          Checking…
        </div>
      ) : needsSetup ? (
        <SetupWarning />
      ) : connected && !picking ? (
        <ConnectedState
          glyph={<CreditCard className="size-[18px] text-base-content/70" />}
          changeLabel="Change products"
          siteUrl={connectedLabel}
          connectedByEmail={null}
          onChange={() => {
            setSubscriptionId(NONE);
            setOneOffId(NONE);
            setPicking(true);
          }}
          onDisconnect={() => disconnectMutation.mutate()}
          disconnecting={disconnectMutation.isPending}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-base-content/70">
            Pick which Stripe products count as this project's subscription and
            one-off offerings. Either can be left unset.
          </p>
          {productsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-base-content/50">
              <span className="loading loading-spinner loading-sm" />
              Loading Stripe products…
            </div>
          ) : productsQuery.isError ? (
            <div className="space-y-2">
              <p className="text-sm text-error">
                Couldn't list Stripe products. The key may lack read access.
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void productsQuery.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <ProductSelect
                label="Subscription product"
                value={subscriptionId}
                onChange={setSubscriptionId}
                products={products}
              />
              <ProductSelect
                label="One-off product"
                value={oneOffId}
                onChange={setOneOffId}
                products={products}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={
                    (!subscriptionId && !oneOffId) || setMutation.isPending
                  }
                  onClick={() => setMutation.mutate()}
                >
                  {setMutation.isPending ? "Saving…" : "Save"}
                </button>
                {connected ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPicking(false)}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}
    </IntegrationCard>
  );
}

function ProductSelect({
  label,
  value,
  onChange,
  products,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  products: Array<{ productId: string; name: string }>;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="select select-bordered w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value={NONE}>Not tracked</option>
        {products.map((product) => (
          <option key={product.productId} value={product.productId}>
            {product.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SetupWarning() {
  return (
    <p className="text-sm text-base-content/70">
      Stripe isn't configured on this deployment. Create a restricted API key
      with read access to Products, Subscriptions, and Checkout Sessions, then
      set{" "}
      <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
        STRIPE_SECRET_KEY
      </code>{" "}
      (via{" "}
      <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
        npx wrangler secret put STRIPE_SECRET_KEY
      </code>{" "}
      or .env.local in development).
    </p>
  );
}
