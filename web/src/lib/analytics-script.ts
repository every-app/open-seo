import { IS_REPORT_PATH_JS } from "@/lib/seo-report/links";

/**
 * Loads Plausible and OpenAnalytics, in the page's head. Both count visits
 * without cookies, so they run for everyone; the Visit counts opt-out
 * (plausible_ignore) skips OpenAnalytics. Deferred to idle so they never
 * compete with the page's own work.
 *
 * Neither loads on a written report: they record the page's address, and a
 * report's address is the only way to it.
 */
export const ANALYTICS_SCRIPT = `(function(){if(${IS_REPORT_PATH_JS})return;function loadAnalytics(){if(window.__openSeoAnalyticsLoaded)return;window.__openSeoAnalyticsLoaded=true;window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init({endpoint:'/api/event'});var script=document.createElement('script');script.defer=true;script.src='/js/script.js';document.head.appendChild(script);try{if(localStorage.getItem('plausible_ignore')==='true')return}catch(e){}var openAnalytics=document.createElement('script');openAnalytics.defer=true;openAnalytics.src='https://analytics.everyapp.team/script.js?siteId=72114522-d4bd-4f7e-b73b-62ccdaeae482';openAnalytics.setAttribute('data-openseo-openanalytics','');document.head.appendChild(openAnalytics)}function schedule(){if('requestIdleCallback'in window){window.requestIdleCallback(loadAnalytics,{timeout:2000});return}window.setTimeout(loadAnalytics,2000)}if(document.readyState==='complete'){schedule();return}window.addEventListener('load',schedule,{once:true})})();`;
