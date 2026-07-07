// Titan Toti — Auto-Updater Frontend Modul
// Prueft GitHub Releases auf Updates und zeigt ein Banner.
// KEINE Backticks, KEINE Frameworks — Vanilla JS.
// Wird von main.js geladen (separate Datei um Kollisionen zu vermeiden).

var TitanUpdate = (function() {
  "use strict";

  var CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 Minuten
  var updateTimer = null;
  var currentUpdateInfo = null;
  var invoke = null;

  function initTauriBridge() {
    if (typeof window.__TAURI__ !== "undefined" && window.__TAURI__.core) {
      invoke = window.__TAURI__.core.invoke;
    } else if (typeof window.__TAURI_INVOKE__ === "function") {
      invoke = window.__TAURI_INVOKE__;
    }
  }

  function callBackend(cmd, args) {
    if (invoke) {
      return invoke(cmd, args);
    }
    return Promise.reject("Tauri nicht verfuegbar");
  }

  // --- UPDATE BANNER UI ---

  function createBanner(info) {
    // Entferne existierendes Banner
    removeBanner();

    var main = document.querySelector(".main");
    if (!main) return;

    var banner = document.createElement("div");
    banner.id = "updateBanner";
    banner.className = "update-banner";

    var glow = document.createElement("div");
    glow.className = "update-banner-glow";
    banner.appendChild(glow);

    var content = document.createElement("div");
    content.className = "update-banner-content";

    var iconWrap = document.createElement("div");
    iconWrap.className = "update-banner-icon";
    iconWrap.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    content.appendChild(iconWrap);

    var textWrap = document.createElement("div");
    textWrap.className = "update-banner-text";

    var title = document.createElement("span");
    title.className = "update-banner-title";
    title.textContent = "Update verfuegbar! Version " + info.latest_version;
    textWrap.appendChild(title);

    var sub = document.createElement("span");
    sub.className = "update-banner-sub";
    sub.textContent = "Tippe auf \"Jetzt aktualisieren\" um die neue Version herunterzuladen.";
    textWrap.appendChild(sub);

    content.appendChild(textWrap);
    banner.appendChild(content);

    var actions = document.createElement("div");
    actions.className = "update-banner-actions";

    var btn = document.createElement("button");
    btn.className = "update-banner-btn";
    btn.id = "updateNowBtn";
    btn.textContent = "Jetzt aktualisieren";
    btn.addEventListener("click", function() {
      performUpdate(info.dmg_url);
    });
    actions.appendChild(btn);

    var dismiss = document.createElement("button");
    dismiss.className = "update-banner-dismiss";
    dismiss.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    dismiss.title = "Spaeter";
    dismiss.addEventListener("click", function() {
      removeBanner();
    });
    actions.appendChild(dismiss);

    banner.appendChild(actions);

    // Banner als erstes Kind von .main einfuegen (ueber view-header)
    main.insertBefore(banner, main.firstChild);
  }

  function removeBanner() {
    var existing = document.getElementById("updateBanner");
    if (existing) existing.remove();
  }

  function showDownloadProgress(text) {
    var btn = document.getElementById("updateNowBtn");
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML =
      '<span class="update-spinner"></span> ' + escapeText(text);
  }

  function showDownloadDone() {
    var btn = document.getElementById("updateNowBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "Installiere...";
    }
    var sub = document.querySelector(".update-banner-sub");
    if (sub) {
      sub.textContent = "Download abgeschlossen! Installation wird gestartet...";
    }
  }

  function showDownloadError(msg) {
    var btn = document.getElementById("updateNowBtn");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Erneut versuchen";
    }
    var sub = document.querySelector(".update-banner-sub");
    if (sub) {
      sub.textContent = "Fehler: " + msg;
      sub.style.color = "var(--red)";
    }
  }

  function escapeText(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- UPDATE LOGIK ---

  function performUpdate(dmgUrl) {
    if (!dmgUrl) {
      showDownloadError("Keine Download-URL verfuegbar.");
      return;
    }
    showDownloadProgress("Lade herunter...");
    callBackend("download_update", { url: dmgUrl })
      .then(function() {
        showDownloadDone();
        return callBackend("install_update", {});
      })
      .then(function() {
        // Installation wird gestartet — DMG oeffnet sich
      })
      .catch(function(err) {
        showDownloadError(String(err));
      });
  }

  function checkForUpdates(silent) {
    return callBackend("check_github_release", {})
      .then(function(result) {
        var info = null;
        try {
          info = typeof result === "string" ? JSON.parse(result) : result;
        } catch (e) {
          if (!silent) console.warn("Update-Check: Parse-Fehler", e);
          return null;
        }
        currentUpdateInfo = info;
        if (info && info.update_available) {
          createBanner(info);
        } else {
          removeBanner();
        }
        return info;
      })
      .catch(function(err) {
        if (!silent) console.warn("Update-Check fehlgeschlagen:", err);
        return null;
      });
  }

  function startAutoCheck() {
    // Erster Check beim Start (silent — keine Fehler anzeigen)
    checkForUpdates(true);
    // Wiederkehrender Check alle 30 Minuten
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = setInterval(function() {
      checkForUpdates(true);
    }, CHECK_INTERVAL_MS);
  }

  // --- SETTINGS UI ---

  function addSettingsCard() {
    var container = document.querySelector(".settings-container");
    if (!container) return;

    // Pruefe ob Karte schon existiert
    if (document.getElementById("updateSettingsCard")) return;

    var card = document.createElement("div");
    card.className = "settings-card";
    card.id = "updateSettingsCard";

    var title = document.createElement("h2");
    title.className = "settings-card-title";
    title.textContent = "Updates";
    card.appendChild(title);

    // Versions-Anzeige
    var grp1 = document.createElement("div");
    grp1.className = "form-group";
    var lbl1 = document.createElement("label");
    lbl1.textContent = "Aktuelle Version";
    grp1.appendChild(lbl1);
    var verInfo = document.createElement("div");
    verInfo.className = "hint";
    verInfo.id = "currentVersionDisplay";
    verInfo.textContent = "Wird geladen...";
    grp1.appendChild(verInfo);
    card.appendChild(grp1);

    // Letzter Check
    var grp2 = document.createElement("div");
    grp2.className = "form-group";
    var lbl2 = document.createElement("label");
    lbl2.textContent = "Letzter Update-Check";
    grp2.appendChild(lbl2);
    var checkInfo = document.createElement("div");
    checkInfo.className = "hint";
    checkInfo.id = "lastUpdateCheck";
    checkInfo.textContent = "Noch nicht geprueft";
    grp2.appendChild(checkInfo);
    card.appendChild(grp2);

    // Button
    var grp3 = document.createElement("div");
    grp3.className = "form-group";
    var btn = document.createElement("button");
    btn.className = "btn-secondary";
    btn.id = "checkUpdatesBtn";
    btn.textContent = "Nach Updates suchen";
    btn.addEventListener("click", function() {
      btn.disabled = true;
      btn.textContent = "Pruefe...";
      checkForUpdates(false).then(function(info) {
        btn.disabled = false;
        btn.textContent = "Nach Updates suchen";
        updateSettingsDisplay(info);
      });
    });
    grp3.appendChild(btn);
    var status = document.createElement("div");
    status.className = "hint";
    status.id = "updateCheckStatus";
    grp3.appendChild(status);
    card.appendChild(grp3);

    container.appendChild(card);
  }

  function updateSettingsDisplay(info) {
    var verEl = document.getElementById("currentVersionDisplay");
    var checkEl = document.getElementById("lastUpdateCheck");
    var statusEl = document.getElementById("updateCheckStatus");

    if (verEl) {
      var v = (info && info.current_version) ? info.current_version : "unbekannt";
      verEl.textContent = "Titan Toti v" + v;
    }
    if (checkEl) {
      var now = new Date();
      var h = String(now.getHours()).padStart(2, "0");
      var m = String(now.getMinutes()).padStart(2, "0");
      checkEl.textContent = "Geprueft um " + h + ":" + m;
    }
    if (statusEl && info) {
      if (info.update_available) {
        statusEl.textContent = "Neue Version " + info.latest_version + " verfuegbar!";
        statusEl.style.color = "var(--green)";
      } else {
        statusEl.textContent = "Du nutzt die neueste Version.";
        statusEl.style.color = "var(--text-secondary)";
      }
    }
  }

  // --- PUBLIC API ---

  function init() {
    initTauriBridge();
    // Warte kurz bis DOM bereit ist
    function domReady() {
      addSettingsCard();
      startAutoCheck();
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", domReady);
    } else {
      domReady();
    }
  }

  return {
    init: init,
    checkNow: function() { return checkForUpdates(false); },
    getInfo: function() { return currentUpdateInfo; }
  };
})();

// Auto-Init
TitanUpdate.init();