// Privacy-first Google Analytics bootstrap for badseo.dev.
//
// A new analytics grant never loads the Google tag until the Worker has saved
// an operator-accessible consent event. Later page views use the unexpired,
// matching-version necessary receipt in browser storage. The consent interface
// is created in the browser so it does not change the raw HTML signals that
// badseo.dev's crawler fixtures exercise.

import {
  ANALYTICS_CONSENT_NOTICE,
  CONSENT_RETENTION_DAYS,
  CONSENT_STORAGE_KEY,
  CONSENT_STORAGE_VERSION,
  LEGACY_CONSENT_STORAGE_KEYS,
} from "./consent";

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;
const CONSENT_WITHDRAWAL_STORAGE_PREFIX = "badseo:analytics-withdrawal:v1:";

export function isValidGa4MeasurementId(
  value: string | undefined,
): value is string {
  return value !== undefined && MEASUREMENT_ID_PATTERN.test(value);
}

export function buildAnalyticsScript(measurementId: string): string {
  // The id is validated before this function is called and JSON-encoded before
  // insertion so a misconfigured Worker binding cannot become script content.
  const encodedMeasurementId = JSON.stringify(measurementId);

  return `(() => {
  "use strict";

  const measurementId = ${encodedMeasurementId};
  const consentEndpoint = "/analytics-consent";
  const notice = ${JSON.stringify(ANALYTICS_CONSENT_NOTICE)};
  const storageKey = ${JSON.stringify(CONSENT_STORAGE_KEY)};
  const withdrawalStoragePrefix = ${JSON.stringify(
    CONSENT_WITHDRAWAL_STORAGE_PREFIX,
  )};
  const legacyStorageKeys = ${JSON.stringify(LEGACY_CONSENT_STORAGE_KEYS)};
  const storageVersion = ${CONSENT_STORAGE_VERSION};
  const preferenceMaxAgeMs = ${CONSENT_RETENTION_DAYS} * 24 * 60 * 60 * 1000;
  const googleTagElementId = "badseo-google-analytics";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let analyticsLoaded = false;
  let consentPanel = null;
  let consentStatus = null;
  let consentRecord = null;
  let settingsButton = null;
  let restoreSettingsFocus = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  // Consent Mode v2 defaults must be queued before any config or event. This
  // is Basic Consent Mode: the Google tag remains completely unloaded while
  // consent is unknown or denied, so no pre-consent ping is sent to Google.
  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
  window.gtag("js", new Date());

  function clearStoredConsent() {
    consentRecord = null;
    try {
      window.localStorage.removeItem(storageKey);
      for (const legacyKey of legacyStorageKeys) {
        window.localStorage.removeItem(legacyKey);
      }
    } catch {
      // Storage may be unavailable in hardened/private browser contexts.
    }
  }

  function readConsentRecord() {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return null;
      const record = JSON.parse(stored);
      const updatedAt = Date.parse(record && record.updatedAt);
      const hasValidChoice =
        record && (record.choice === "granted" || record.choice === "denied");
      const hasValidReceipt =
        !record.receiptId || uuidPattern.test(record.receiptId);
      const grantHasReceipt =
        record.choice !== "granted" || uuidPattern.test(record.receiptId || "");
      const grantMatchesMeasurement =
        record.choice !== "granted" || record.measurementId === measurementId;
      const isCurrent =
        Number.isFinite(updatedAt) &&
        Date.now() - updatedAt >= 0 &&
        Date.now() - updatedAt <= preferenceMaxAgeMs;

      if (
        record.version === storageVersion &&
        record.noticeVersion === notice.noticeVersion &&
        record.privacyPolicyVersion === notice.privacyPolicyVersion &&
        hasValidChoice &&
        hasValidReceipt &&
        grantHasReceipt &&
        grantMatchesMeasurement &&
        isCurrent
      ) {
        return record;
      }
    } catch {
      // Fail closed and ask again if the stored record cannot be parsed.
    }
    clearStoredConsent();
    return null;
  }

  function persistConsentRecord(record) {
    consentRecord = record;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(record));
      for (const legacyKey of legacyStorageKeys) {
        window.localStorage.removeItem(legacyKey);
      }
      return true;
    } catch {
      // Never leave an older grant behind if an overwrite fails (for example,
      // because storage is full). Callers must fail closed when this returns
      // false so a grant is never used without its withdrawal receipt.
      clearStoredConsent();
      return false;
    }
  }

  function readConsentStorageSnapshot() {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }

  function createRandomUuid() {
    if (typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10).join("")
    ].join("-");
  }

  function cleanPageUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.origin);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return url.origin + url.pathname;
    } catch {
      return "";
    }
  }

  async function postConsentEvent(action, receiptId, options) {
    const requestId = options && options.requestId
      ? options.requestId
      : createRandomUuid();
    const keepalive = Boolean(options && options.keepalive);
    const eventMeasurementId =
      options && options.measurementId
        ? options.measurementId
        : measurementId;
    const controller = keepalive ? null : new AbortController();
    const timeout = controller
      ? window.setTimeout(() => controller.abort(), 8000)
      : null;

    try {
      const response = await window.fetch(consentEndpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        keepalive,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          receiptId,
          requestId,
          noticeVersion: notice.noticeVersion,
          privacyPolicyVersion: notice.privacyPolicyVersion,
          measurementId: eventMeasurementId
        }),
        signal: controller ? controller.signal : undefined
      });
      if (response.status === 409) {
        const error = new Error("Consent notice changed");
        error.name = "ConsentVersionMismatch";
        throw error;
      }
      if (!response.ok) throw new Error("Consent record was not saved");
      const result = await response.json();
      if (
        !result ||
        result.receiptId !== receiptId ||
        result.action !== action ||
        !Number.isFinite(Date.parse(result.recordedAt))
      ) {
        throw new Error("Consent record response was invalid");
      }
      return result;
    } finally {
      if (timeout !== null) window.clearTimeout(timeout);
    }
  }

  function readPendingWithdrawals() {
    const pending = [];
    try {
      for (let index = 0; index < window.localStorage.length; index++) {
        const key = window.localStorage.key(index);
        if (!key || !key.startsWith(withdrawalStoragePrefix)) continue;

        const receiptId = key.slice(withdrawalStoragePrefix.length);
        const raw = window.localStorage.getItem(key);
        let entry = null;
        try {
          entry = raw ? JSON.parse(raw) : null;
        } catch {
          // Invalid marker is removed below.
        }

        const createdAt = Date.parse(entry && entry.createdAt);
        const isCurrent =
          Number.isFinite(createdAt) &&
          Date.now() - createdAt >= 0 &&
          Date.now() - createdAt <= preferenceMaxAgeMs;
        const isValid =
          uuidPattern.test(receiptId) &&
          entry &&
          uuidPattern.test(entry.requestId || "") &&
          /^G-[A-Z0-9]+$/.test(entry.measurementId || "") &&
          isCurrent;

        if (isValid) {
          pending.push({
            key,
            receiptId,
            requestId: entry.requestId,
            measurementId: entry.measurementId,
            createdAt: entry.createdAt
          });
        } else {
          window.localStorage.removeItem(key);
          index -= 1;
        }
      }
    } catch {
      // Storage may be unavailable. The caller still keeps analytics denied.
    }
    return pending;
  }

  function queuePendingWithdrawal(receiptId, eventMeasurementId) {
    const entry = {
      key: withdrawalStoragePrefix + receiptId,
      receiptId,
      requestId: createRandomUuid(),
      measurementId: eventMeasurementId,
      createdAt: new Date().toISOString()
    };
    try {
      window.localStorage.setItem(
        entry.key,
        JSON.stringify({
          requestId: entry.requestId,
          measurementId: entry.measurementId,
          createdAt: entry.createdAt
        })
      );
      return { entry, persisted: true };
    } catch {
      return { entry, persisted: false };
    }
  }

  function removePendingWithdrawalMarker(entry) {
    try {
      const currentRaw = window.localStorage.getItem(entry.key);
      const current = currentRaw ? JSON.parse(currentRaw) : null;
      if (current && current.requestId === entry.requestId) {
        window.localStorage.removeItem(entry.key);
      }
    } catch {
      // The server event or newer browser decision remains authoritative.
    }
  }

  async function sendPendingWithdrawal(entry) {
    try {
      await postConsentEvent("withdraw", entry.receiptId, {
        keepalive: true,
        requestId: entry.requestId,
        measurementId: entry.measurementId
      });
      removePendingWithdrawalMarker(entry);
      return true;
    } catch {
      // A persisted marker stays available for the next page view.
      return false;
    }
  }

  async function flushPendingWithdrawals() {
    const pending = readPendingWithdrawals();
    const activeReceipt =
      consentRecord && consentRecord.choice === "granted"
        ? consentRecord.receiptId
        : null;
    const toSend = [];
    for (const entry of pending) {
      if (
        activeReceipt === entry.receiptId &&
        consentRecord.measurementId === entry.measurementId
      ) {
        // A newer grant for the same receipt supersedes this older retry.
        removePendingWithdrawalMarker(entry);
      } else {
        toSend.push(entry);
      }
    }
    const results = await Promise.all(toSend.map(sendPendingWithdrawal));
    return results.every(Boolean);
  }

  function recordWithdrawalWithRetry(receiptId, eventMeasurementId) {
    let queued;
    try {
      queued = queuePendingWithdrawal(receiptId, eventMeasurementId);
    } catch {
      return;
    }

    if (queued.persisted) {
      void sendPendingWithdrawal(queued.entry);
    } else {
      // Storage failure cannot prevent an immediate best-effort write.
      void postConsentEvent("withdraw", receiptId, {
        keepalive: true,
        requestId: queued.entry.requestId,
        measurementId: eventMeasurementId
      }).catch(() => {});
    }
  }

  function enableAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;

    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("config", measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: cleanPageUrl(window.location.href),
      page_referrer: cleanPageUrl(document.referrer)
    });

    const googleTag = document.createElement("script");
    googleTag.id = googleTagElementId;
    googleTag.async = true;
    googleTag.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(measurementId);
    document.head.appendChild(googleTag);
  }

  function deleteAnalyticsCookies() {
    const names = document.cookie
      .split(";")
      .map((cookie) => cookie.trim().split("=")[0])
      .filter((name) => name === "_ga" || name.startsWith("_ga_"));
    const host = window.location.hostname;
    const domains = new Set([host, "." + host]);
    const parts = host.split(".");
    if (parts.length > 1) domains.add("." + parts.slice(-2).join("."));

    for (const name of names) {
      document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax";
      for (const domain of domains) {
        document.cookie =
          name +
          "=; Max-Age=0; Path=/; Domain=" +
          domain +
          "; SameSite=Lax";
      }
    }
  }

  function applyDeniedConsent() {
    window.gtag("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    deleteAnalyticsCookies();
  }

  function hideConsentPanel() {
    if (!consentPanel) return;
    consentPanel.remove();
    consentPanel = null;
    consentStatus = null;
    document.documentElement.classList.remove("analytics-consent-open");
    if (restoreSettingsFocus && settingsButton) settingsButton.focus();
    restoreSettingsFocus = false;
  }

  function setPanelBusy(busy) {
    if (!consentPanel) return;
    consentPanel.setAttribute("aria-busy", String(busy));
    for (const button of consentPanel.querySelectorAll("button")) {
      button.disabled = busy;
    }
  }

  function showConsentError(message) {
    if (!consentStatus) return;
    consentStatus.textContent = message;
    consentStatus.hidden = false;
  }

  async function chooseAnalytics(choice) {
    // Another same-origin tab may have changed the preference since this page
    // loaded. Decisions must use the current receipt, not cached page state.
    consentRecord = readConsentRecord();

    if (choice === "granted") {
      const grantStorageSnapshot = readConsentStorageSnapshot();
      setPanelBusy(true);
      if (consentStatus) consentStatus.hidden = true;

      try {
        const withdrawalsSaved = await flushPendingWithdrawals();
        if (!withdrawalsSaved) {
          throw new Error("A previous withdrawal is still being saved");
        }

        // A newer cross-tab choice made during withdrawal preflight wins
        // before this tab creates any new server grant.
        if (readConsentStorageSnapshot() !== grantStorageSnapshot) {
          const latestRecord = readConsentRecord();
          consentRecord = latestRecord;
          hideConsentPanel();
          if (latestRecord && latestRecord.choice === "granted") {
            enableAnalytics();
          } else {
            applyDeniedConsent();
          }
          return;
        }

        const receiptId =
          consentRecord && uuidPattern.test(consentRecord.receiptId || "")
            ? consentRecord.receiptId
            : createRandomUuid();
        const result = await postConsentEvent("grant", receiptId);

        // A newer decision from another tab always wins. The server may have
        // recorded this grant already, so append a compensating withdrawal,
        // leave the newer browser record untouched, and never enable GA from
        // this superseded response.
        if (readConsentStorageSnapshot() !== grantStorageSnapshot) {
          const latestRecord = readConsentRecord();
          consentRecord = latestRecord;
          hideConsentPanel();
          if (latestRecord && latestRecord.choice === "granted") {
            // A newer valid grant already authorizes this measurement ID. Do
            // not append a withdrawal for a receipt that may be shared by both
            // concurrent re-grants.
            if (latestRecord.receiptId !== receiptId) {
              recordWithdrawalWithRetry(receiptId, measurementId);
            }
            enableAnalytics();
          } else {
            recordWithdrawalWithRetry(receiptId, measurementId);
            applyDeniedConsent();
          }
          return;
        }

        const preferenceSaved = persistConsentRecord({
          choice: "granted",
          version: storageVersion,
          noticeVersion: notice.noticeVersion,
          privacyPolicyVersion: notice.privacyPolicyVersion,
          measurementId,
          receiptId,
          updatedAt: result.recordedAt
        });
        if (!preferenceSaved) {
          throw new Error("Browser storage could not save the consent receipt");
        }
        hideConsentPanel();
        enableAnalytics();
      } catch (error) {
        if (error && error.name === "ConsentVersionMismatch") {
          showConsentError(
            "The consent notice changed while this page was open. Reloading it now."
          );
          window.setTimeout(() => window.location.reload(), 250);
          return;
        }
        showConsentError(
          "Analytics stayed off because we could not save your choice. Please try again."
        );
        setPanelBusy(false);
      }
      return;
    }

    const wasLoaded = analyticsLoaded;
    const wasGranted =
      wasLoaded || Boolean(consentRecord && consentRecord.choice === "granted");
    const receiptId =
      consentRecord && uuidPattern.test(consentRecord.receiptId || "")
        ? consentRecord.receiptId
        : null;
    const receiptMeasurementId =
      consentRecord && consentRecord.measurementId
        ? consentRecord.measurementId
        : measurementId;
    const pendingWithdrawal = Boolean(wasGranted && receiptId);
    // Withdrawal takes effect before any fallible receipt or storage work.
    applyDeniedConsent();
    clearStoredConsent();

    persistConsentRecord({
      choice: "denied",
      version: storageVersion,
      noticeVersion: notice.noticeVersion,
      privacyPolicyVersion: notice.privacyPolicyVersion,
      measurementId: receiptMeasurementId,
      ...(receiptId ? { receiptId } : {}),
      updatedAt: new Date().toISOString()
    });
    hideConsentPanel();
    if (pendingWithdrawal && receiptId) {
      recordWithdrawalWithRetry(receiptId, receiptMeasurementId);
    }

    // Once gtag.js has loaded it cannot be unloaded. Reload into the persisted
    // denied state so subsequent interactions send no requests to Google.
    if (wasLoaded) window.setTimeout(() => window.location.reload(), 150);
  }

  function makeChoiceButton(label, choice, variant) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "analytics-consent__choice analytics-consent__choice--" + variant;
    button.textContent = label;
    button.addEventListener("click", () => {
      void chooseAnalytics(choice);
    });
    return button;
  }

  function showConsentPanel(fromSettings) {
    if (consentPanel) {
      if (fromSettings) {
        const firstChoice = consentPanel.querySelector("button");
        if (firstChoice) firstChoice.focus();
      }
      return;
    }

    restoreSettingsFocus = fromSettings;
    const panel = document.createElement("section");
    panel.className = "analytics-consent";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", "analytics-consent-title");
    panel.setAttribute("aria-describedby", "analytics-consent-description");

    const copy = document.createElement("div");
    copy.className = "analytics-consent__copy";

    const eyebrow = document.createElement("span");
    eyebrow.className = "analytics-consent__eyebrow";
    eyebrow.textContent = notice.category.toUpperCase();

    const title = document.createElement("strong");
    title.id = "analytics-consent-title";
    title.className = "analytics-consent__title";
    title.textContent = notice.title;

    const description = document.createElement("p");
    description.id = "analytics-consent-description";
    description.className = "analytics-consent__description";
    description.append(notice.description + " ");
    const privacyLink = document.createElement("a");
    privacyLink.href = notice.privacyUrl;
    privacyLink.textContent = notice.privacyLinkLabel;
    description.appendChild(privacyLink);

    const status = document.createElement("p");
    status.className = "analytics-consent__status";
    status.setAttribute("role", "status");
    status.hidden = true;
    consentStatus = status;

    copy.append(eyebrow, title, description, status);

    const choices = document.createElement("div");
    choices.className = "analytics-consent__choices";
    choices.append(
      makeChoiceButton(notice.choices.reject, "denied", "reject"),
      makeChoiceButton(notice.choices.accept, "granted", "accept")
    );

    panel.append(copy, choices);
    consentPanel = panel;
    document.documentElement.classList.add("analytics-consent-open");
    document.body.appendChild(panel);

    if (fromSettings) {
      const firstChoice = panel.querySelector("button");
      if (firstChoice) firstChoice.focus();
    }
  }

  function addSettingsButton() {
    const footerLinks = document.querySelector(".foot-links");
    if (settingsButton) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "analytics-settings";
    button.textContent = "Cookie settings";
    button.addEventListener("click", () => showConsentPanel(true));
    if (footerLinks) {
      footerLinks.appendChild(button);
    } else {
      // A few deliberate crawler fixtures render without the shared footer
      // (notably the no-outgoing-links page). Inject a browser-only fallback so
      // withdrawal remains available without changing their raw link graph.
      button.classList.add("analytics-settings--floating");
      document.body.appendChild(button);
    }
    settingsButton = button;
  }

  function handleConsentStorageChange(event) {
    if (event.key !== storageKey) return;

    const nextRecord = readConsentRecord();
    consentRecord = nextRecord;

    if (nextRecord && nextRecord.choice === "granted") {
      hideConsentPanel();
      enableAnalytics();
      return;
    }

    // A rejection, withdrawal, invalidation, or removal in another tab takes
    // effect here immediately. A loaded Google tag requires a clean reload.
    applyDeniedConsent();
    hideConsentPanel();
    if (analyticsLoaded) {
      window.setTimeout(() => window.location.reload(), 0);
    } else if (!nextRecord && document.readyState !== "loading") {
      showConsentPanel(false);
    }
  }

  window.addEventListener("storage", handleConsentStorageChange);

  try {
    for (const legacyKey of legacyStorageKeys) {
      window.localStorage.removeItem(legacyKey);
    }
  } catch {
    // Storage may be unavailable; the current page still fails closed.
  }

  consentRecord = readConsentRecord();
  void flushPendingWithdrawals();
  if (consentRecord && consentRecord.choice === "granted") {
    enableAnalytics();
  } else {
    // Remove identifiers left by an expired, invalid, or previously withdrawn
    // grant even though the Google tag remains unloaded.
    deleteAnalyticsCookies();
  }

  function initializeInterface() {
    addSettingsButton();
    if (!consentRecord) showConsentPanel(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeInterface, {
      once: true
    });
  } else {
    initializeInterface();
  }
})();`;
}

/**
 * Remove state left by a previously-enabled GA deployment. This script makes
 * disabling any required binding a privacy-safe off switch instead of leaving
 * old grants and first-party identifiers behind until they expire.
 */
export function buildDisabledAnalyticsScript(): string {
  return `(() => {
  "use strict";
  try {
    for (const key of ${JSON.stringify([
      CONSENT_STORAGE_KEY,
      ...LEGACY_CONSENT_STORAGE_KEYS,
    ])}) {
      window.localStorage.removeItem(key);
    }
    for (let index = window.localStorage.length - 1; index >= 0; index--) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(${JSON.stringify(
        CONSENT_WITHDRAWAL_STORAGE_PREFIX,
      )})) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable; cookie cleanup can still continue.
  }

  const names = document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
  const host = window.location.hostname;
  const domains = new Set([host, "." + host]);
  const parts = host.split(".");
  if (parts.length > 1) domains.add("." + parts.slice(-2).join("."));

  for (const name of names) {
    document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax";
    for (const domain of domains) {
      document.cookie =
        name +
        "=; Max-Age=0; Path=/; Domain=" +
        domain +
        "; SameSite=Lax";
    }
  }
})();`;
}

export function analyticsScriptResponse(
  measurementId: string | undefined,
  consentLedgerAvailable: boolean,
): Response {
  const headers = {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };

  if (!isValidGa4MeasurementId(measurementId) || !consentLedgerAvailable) {
    return new Response(buildDisabledAnalyticsScript(), { headers });
  }

  return new Response(buildAnalyticsScript(measurementId), { headers });
}
