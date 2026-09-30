export function GoogleAdsAvailabilityNotice() {
  return (
    <div
      className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-base-content"
      role="status"
      aria-label="Google Ads metric availability"
    >
      Google Ads-only market: KD <code>not_available</code>; intent{" "}
      <code>not_available</code>.
    </div>
  );
}
