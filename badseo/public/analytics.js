/* oxlint-disable typescript-eslint/no-unsafe-argument, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-member-access -- This standalone browser script defines Google's dynamic dataLayer globals. */
(function () {
  "use strict";

  var measurementId = "G-7MXV9FH7SS";
  var storageKey = "badseo.analyticsConsent";
  var granted = "granted";
  var denied = "denied";

  function readConsent() {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }

  function writeConsent(value) {
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // The choice still applies to this page when storage is unavailable.
    }
  }

  function loadAnalytics() {
    if (document.getElementById("ga4-script")) return;

    window["ga-disable-" + measurementId] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    window.gtag("js", new Date());
    window.gtag("config", measurementId);

    var script = document.createElement("script");
    script.id = "ga4-script";
    script.async = true;
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(measurementId);
    document.head.appendChild(script);
  }

  function deleteAnalyticsCookies() {
    document.cookie.split(";").forEach(function (cookie) {
      var name = cookie.split("=")[0].trim();
      if (name !== "_ga" && !name.startsWith("_ga_")) return;

      document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax";
      if (window.location.hostname.endsWith("badseo.dev")) {
        document.cookie =
          name + "=; Max-Age=0; path=/; domain=.badseo.dev; SameSite=Lax";
      }
    });
  }

  function createBanner() {
    var banner = document.createElement("div");
    banner.className = "consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-modal", "true");
    banner.setAttribute("aria-labelledby", "consent-title");
    banner.hidden = true;
    banner.innerHTML =
      '<div class="consent-copy">' +
      '<strong id="consent-title">This website uses cookies</strong>' +
      "<p>We use cookies to ensure you get the best experience.</p>" +
      '<a href="/privacy">Privacy policy</a>' +
      "</div>" +
      '<div class="consent-actions">' +
      '<button type="button" data-consent="denied">Reject</button>' +
      '<button type="button" class="consent-accept" data-consent="granted">Accept</button>' +
      "</div>";
    document.body.appendChild(banner);

    banner.addEventListener("click", function (event) {
      var button = event.target.closest("[data-consent]");
      if (!button) return;

      var previous = readConsent();
      var choice = button.getAttribute("data-consent");
      writeConsent(choice);
      banner.hidden = true;

      if (choice === granted) {
        loadAnalytics();
        return;
      }

      window["ga-disable-" + measurementId] = true;
      deleteAnalyticsCookies();
      if (previous === granted) window.location.reload();
    });

    return banner;
  }

  var banner = createBanner();
  var consent = readConsent();
  if (consent === granted) loadAnalytics();
  else if (consent !== denied) banner.hidden = false;

  document.addEventListener("click", function (event) {
    if (!event.target.closest("[data-cookie-settings]")) return;
    banner.hidden = false;
    banner.querySelector("button").focus();
  });
})();
