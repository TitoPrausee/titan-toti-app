// Titan Toti v2.3 — Major Overhaul Frontend
// Vanilla JS — KEINE Backticks, KEINE Frameworks
// Nutzt window.__TAURI__.core.invoke fuer alle Rust-Calls

(function() {
  "use strict";

  // --- STORAGE KEYS ---
  var STORAGE_KEYS = {
    apiUrl: "titantoti_api_url",
    apiKey: "titantoti_api_key",
    model: "titantoti_model",
    fallbackModels: "titantoti_fallback_models",
    temperature: "titantoti_temperature",
    maxTokens: "titantoti_max_tokens",
    systemPrompt: "titantoti_system_prompt",
    systemAccess: "titantoti_system_access",
    skillsEnabled: "titantoti_skills_enabled",
    bypassPermissions: "titantoti_bypass_permissions",
    autoScreenshot: "titantoti_auto_screenshot",
    continuousMode: "titantoti_continuous_mode",
    theme: "titantoti_theme",
    currentSession: "titantoti_current_session",
    setupDone: "titantoti_setup_done"
  };

  var defaults = {
    apiUrl: "http://localhost:11434",
    apiKey: "",
    model: "llama3.2",
    fallbackModels: "",
    temperature: 0.7,
    maxTokens: 8192,
    systemPrompt: "",
    systemAccess: true,
    skillsEnabled: true,
    bypassPermissions: false,
    autoScreenshot: false,
    continuousMode: false,
    theme: "dark"
  };

  var DEFAULT_SYSTEM_PROMPT_FALLBACK = "Du bist Titan Toti \u2014 ein autonomer KI-Agent auf macOS. Du erreichst Ziele SELBSTSTAENDIG durch Nachdenken und Ausprobieren.\n\nDu hast folgende Tools zur Verfuegung:\n- [TOOL:system_command:BEFEHL,ARG1,ARG2,...] \u2014 Fuehrt einen System-Befehl aus (z.B. [TOOL:system_command:open,https://google.com])\n- [TOOL:read_file:PFAD] \u2014 Liest eine Datei\n- [TOOL:write_file:PFAD,INHALT] \u2014 Schreibt eine Datei\n- [TOOL:list_dir:PFAD] \u2014 Listet ein Verzeichnis\n- [TOOL:screenshot:] \u2014 Macht einen Screenshot\n\nREGELN:\n1. Ueberlege zuerst was zu tun ist, dann nutze ein Tool.\n2. Wenn ein Tool fehlschlaegt, probiere einen ANDEREN Weg. Gib nicht auf.\n3. Du kannst MEHRERE Tools nacheinander nutzen bis du am Ziel bist.\n4. Wenn du fertig bist, schreibe eine normale Antwort OHNE Tool-Aufruf.\n5. Du sprichst Deutsch. Du bist kurz und auf den Punkt.\n6. Probier IMMER selbststaendig zu loesen, bevor du den Nutzer fragst.\n\nBEISPIEL: Nutzer sagt oeffne google.com -> Du antwortest [TOOL:system_command:open,https://www.google.com] -> nach Resultat: Google.com wurde geoeffnet.";

  function getSetting(key, fallback) {
    var val = localStorage.getItem(key);
    if (val === null || val === undefined || val === "") return fallback;
    return val;
  }
  function getSettingBool(key, fallback) {
    var val = localStorage.getItem(key);
    if (val === null || val === undefined) return fallback;
    return val === "true" || val === "1";
  }
  function getSettingNum(key, fallback) {
    var val = localStorage.getItem(key);
    if (val === null || val === undefined || val === "") return fallback;
    var num = parseFloat(val);
    return isNaN(num) ? fallback : num;
  }
  function setSetting(key, val) { localStorage.setItem(key, val); }

  // Aktuelle Settings
  var settings = {
    apiUrl: getSetting(STORAGE_KEYS.apiUrl, defaults.apiUrl),
    apiKey: getSetting(STORAGE_KEYS.apiKey, defaults.apiKey),
    model: getSetting(STORAGE_KEYS.model, defaults.model),
    fallbackModels: getSetting(STORAGE_KEYS.fallbackModels, defaults.fallbackModels),
    temperature: getSettingNum(STORAGE_KEYS.temperature, defaults.temperature),
    maxTokens: getSettingNum(STORAGE_KEYS.maxTokens, defaults.maxTokens),
    systemPrompt: getSetting(STORAGE_KEYS.systemPrompt, ""),
    systemAccess: getSettingBool(STORAGE_KEYS.systemAccess, defaults.systemAccess),
    skillsEnabled: getSettingBool(STORAGE_KEYS.skillsEnabled, defaults.skillsEnabled),
    bypassPermissions: getSettingBool(STORAGE_KEYS.bypassPermissions, defaults.bypassPermissions),
    autoScreenshot: getSettingBool(STORAGE_KEYS.autoScreenshot, defaults.autoScreenshot),
    continuousMode: getSettingBool(STORAGE_KEYS.continuousMode, defaults.continuousMode),
    theme: getSetting(STORAGE_KEYS.theme, defaults.theme),
    currentSession: getSetting(STORAGE_KEYS.currentSession, "")
  };

  // In-memory Chat-Historie (pro Session)
  var chatHistory = {};

  // --- TAUURI BRIDGE ---
  var invoke = null;
  if (typeof window.__TAURI__ !== "undefined") {
    if (window.__TAURI__.core) {
      invoke = window.__TAURI__.core.invoke;
    } else if (window.__TAURI__.invoke) {
      invoke = window.__TAURI__.invoke;
    }
  }

  function callBackend(cmd, args) {
    if (invoke) {
      return invoke(cmd, args || {});
    }
    return Promise.reject("Tauri nicht verfuegbar");
  }

  // --- DOM HELPERS ---
  function $(id) { return document.getElementById(id); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    return h + ":" + m;
  }

  function formatTimestamp(ts) {
    var d = new Date(ts);
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    var s = String(d.getSeconds()).padStart(2, "0");
    return h + ":" + m + ":" + s;
  }

  function generateId() {
    return "s_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  }

  // --- ACTIVITY ICONS ---
  var ACTIVITY_ICONS = {
    thinking: { icon: "🧠", color: "thinking" },
    action: { icon: "⚡", color: "action" },
    skill: { icon: "🔧", color: "skill" },
    file_read: { icon: "📖", color: "file_read" },
    file_write: { icon: "✏️", color: "file_write" },
    command: { icon: "💻", color: "command" },
    agent_started: { icon: "🚀", color: "agent_started" },
    agent_completed: { icon: "✅", color: "agent_completed" },
    error: { icon: "❌", color: "error" },
    memory_saved: { icon: "💾", color: "memory_saved" }
  };

  // --- MARKDOWN RENDERING ---
  function renderMarkdown(text) {
    var html = escapeHtml(text);
    var codeBlocks = [];
    var codeRegex = /```(\w*)\n([\s\S]*?)```/g;
    html = html.replace(codeRegex, function(match, lang, code) {
      var idx = codeBlocks.length;
      var langLabel = lang || "code";
      codeBlocks.push({lang: langLabel, code: code});
      return "@@CODEBLOCK_" + idx + "@@";
    });
    html = html.replace(/`([^`]+)`/g, function(m, c) {
      return "<code>" + escapeHtml(c) + "</code>";
    });
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/(^|[^"=])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    // Listen
    html = html.replace(/^[\*\-]\s+(.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
    // Tabellen (einfaches Markdown-Table)
    html = html.replace(/^\|(.+)\|\n\|[-:\s|]+\|\n([\s\S]*?)(?=\n\n|\n$|$)/gm, function(match, header, rows) {
      var heads = header.split("|").map(function(h) { return h.trim(); }).filter(function(h) { return h.length > 0; });
      var thead = "<thead><tr>" + heads.map(function(h) { return "<th>" + escapeHtml(h) + "</th>"; }).join("") + "</tr></thead>";
      var rowLines = rows.trim().split("\n");
      var tbody = "<tbody>";
      rowLines.forEach(function(r) {
        var cells = r.split("|").map(function(c) { return c.trim(); }).filter(function(c, i, arr) { return c.length > 0 || i > 0; });
        tbody += "<tr>" + cells.map(function(c) { return "<td>" + escapeHtml(c) + "</td>"; }).join("") + "</tr>";
      });
      tbody += "</tbody>";
      return "<table>" + thead + tbody + "</table>";
    });
    // Absaetze
    var parts = html.split(/\n\n+/);
    html = parts.map(function(p) {
      if (p.indexOf("<ul>") === 0 || p.indexOf("<ol>") === 0) return p;
      if (p.indexOf("<table") === 0) return p;
      if (p.indexOf("@@CODEBLOCK_") >= 0) return p;
      return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
    }).join("\n");
    html = html.replace(/@@CODEBLOCK_(\d+)@@/g, function(match, idx) {
      var block = codeBlocks[parseInt(idx, 10)];
      if (!block) return match;
      return '<div class="code-block"><div class="code-block-header"><span>' + escapeHtml(block.lang) + '</span><button class="copy-btn" data-code="' + encodeURIComponent(block.code) + '">Kopieren</button></div><pre>' + escapeHtml(block.code) + '</pre></div>';
    });
    return html;
  }

  // --- MODAL HELPERS ---
  function openModal(backdropId, modalId) {
    var backdrop = $(backdropId);
    var modal = $(modalId);
    backdrop.style.display = "block";
    modal.style.display = "flex";
    modal.classList.remove("modal-closing");
    modal.classList.add("modal-opening");
  }

  function closeModal(backdropId, modalId) {
    var backdrop = $(backdropId);
    var modal = $(modalId);
    modal.classList.remove("modal-opening");
    modal.classList.add("modal-closing");
    setTimeout(function() {
      modal.style.display = "none";
      backdrop.style.display = "none";
      modal.classList.remove("modal-closing");
    }, 300);
  }

  // --- CONFIRM DIALOG ---
  var confirmCallback = null;
  function showConfirm(title, message, callback) {
    $("confirmTitle").textContent = title;
    $("confirmMessage").textContent = message;
    confirmCallback = callback;
    openModal("confirmBackdrop", "confirmModal");
  }

  // --- MODELL-AUSWAHL MODAL ---
  var modelModalContext = "setup";
  var availableModels = [];

  function openModelModal(context, models) {
    modelModalContext = context || "setup";
    availableModels = models || [];
    openModal("modelModalBackdrop", "modelModal");
    $("modelSearchInput").value = "";
    renderModelList(availableModels, "");
    setTimeout(function() { $("modelSearchInput").focus(); }, 100);
  }

  function closeModelModal() { closeModal("modelModalBackdrop", "modelModal"); }

  function renderModelList(models, filter) {
    var container = $("modelListContainer");
    var filtered = models;
    if (filter) {
      var f = filter.toLowerCase();
      filtered = models.filter(function(m) {
        var name = typeof m === "string" ? m : (m.name || m);
        return name.toLowerCase().indexOf(f) >= 0;
      });
    }
    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Keine Modelle gefunden.</p></div>';
      return;
    }
    container.innerHTML = "";
    filtered.forEach(function(m) {
      var name = typeof m === "string" ? m : (m.name || m);
      var isVision = typeof m === "object" && m.vision;
      var card = document.createElement("div");
      card.className = "model-card";
      card.setAttribute("data-model", name);
      var visionBadge = isVision ? '<div class="model-card-vision">Vision</div>' : "";
      card.innerHTML = '<div class="model-card-name">' + escapeHtml(name) + '</div>' + visionBadge;
      card.addEventListener("click", function() { selectModelFromModal(name); });
      container.appendChild(card);
    });
  }

  function selectModelFromModal(modelName) {
    if (modelModalContext === "setup") {
      $("setupModelInput").value = modelName;
      $("setupModelDisplay").value = modelName;
      $("setupModelStatus").textContent = "Modell: " + modelName + " ausgewaehlt";
      $("setupModelStatus").className = "hint success";
    } else {
      $("modelDisplay").value = modelName;
      settings.model = modelName;
      setSetting(STORAGE_KEYS.model, modelName);
      $("settingsModelStatus").textContent = "Modell: " + modelName + " ausgewaehlt";
      $("settingsModelStatus").className = "hint success";
    }
    closeModelModal();
  }

  function setupModelModalEvents() {
    $("modelModalClose").addEventListener("click", closeModelModal);
    $("modelModalBackdrop").addEventListener("click", closeModelModal);
    $("modelSearchInput").addEventListener("input", function() {
      renderModelList(availableModels, this.value);
    });
  }

  // --- OLLAMA CONNECT MODAL ---
  var ollamaConnectContext = "setup";
  var ollamaAuthPollTimer = null;
  var ollamaAuthStartTime = 0;
  var OLLAMA_AUTH_TIMEOUT = 60000;

  function openOllamaConnectModal(context) {
    ollamaConnectContext = context || "setup";
    openModal("ollamaConnectBackdrop", "ollamaConnectModal");
    $("ollamaConnectKey").value = "";
    $("ollamaConnectFallback").open = false;
    $("ollamaConnectSpinner").style.display = "none";
    $("ollamaConnectResult").style.display = "none";
    $("ollamaConnectResult").innerHTML = "";
    $("ollamaConnectStatus").innerHTML = '<span class="ollama-spinner"></span> Starte Device-Auth-Flow...';
    $("ollamaConnectStatus").className = "hint";

    callBackend("start_ollama_auth", {}).then(function(resp) {
      var data = typeof resp === "string" ? JSON.parse(resp) : resp;
      if (data.success || data.browser_opened) {
        $("ollamaConnectStatus").textContent = data.message || "Browser geoeffnet. Bitte klicke auf Connect.";
        $("ollamaConnectStatus").className = "hint success";
        $("ollamaConnectSpinner").style.display = "block";
        startAuthPolling();
      } else {
        $("ollamaConnectStatus").textContent = data.message || "Auth-Flow konnte nicht gestartet werden.";
        $("ollamaConnectStatus").className = "hint error";
        $("ollamaConnectFallback").open = true;
      }
    }).catch(function(err) {
      $("ollamaConnectStatus").textContent = "Fehler: " + err;
      $("ollamaConnectStatus").className = "hint error";
      $("ollamaConnectFallback").open = true;
    });
  }

  function startAuthPolling() {
    if (ollamaAuthPollTimer) clearInterval(ollamaAuthPollTimer);
    ollamaAuthStartTime = Date.now();
    ollamaAuthPollTimer = setInterval(pollAuthStatus, 2000);
    pollAuthStatus();
  }

  function pollAuthStatus() {
    var elapsed = Date.now() - ollamaAuthStartTime;
    if (elapsed > OLLAMA_AUTH_TIMEOUT) {
      stopAuthPolling();
      callBackend("stop_auth", {}).catch(function() {});
      $("ollamaConnectSpinner").style.display = "none";
      $("ollamaConnectStatus").textContent = "Zeitueberschreitung. Bitte versuche es erneut.";
      $("ollamaConnectStatus").className = "hint error";
      $("ollamaConnectFallback").open = true;
      return;
    }
    var remaining = Math.ceil((OLLAMA_AUTH_TIMEOUT - elapsed) / 1000);
    $("ollamaConnectPollMsg").textContent = "Warte auf Bestaetigung im Browser... (" + remaining + "s)";
    callBackend("check_auth_status", {}).then(function(resp) {
      var data = typeof resp === "string" ? JSON.parse(resp) : resp;
      if (data.authenticated) {
        stopAuthPolling();
        $("ollamaConnectSpinner").style.display = "none";
        $("ollamaConnectResult").style.display = "block";
        $("ollamaConnectResult").innerHTML = '<div style="font-size:48px;">🎉</div><p style="font-size:16px;font-weight:600;color:#2d9d2d;margin-top:8px;">Verbunden!</p>';
        $("ollamaConnectStatus").textContent = "Verbunden! 🎉";
        $("ollamaConnectStatus").className = "hint success";
        handleAuthSuccess();
      } else if (data.message) {
        $("ollamaConnectStatus").textContent = data.message;
        $("ollamaConnectStatus").className = "hint";
      }
    }).catch(function() {});
  }

  function stopAuthPolling() {
    if (ollamaAuthPollTimer) { clearInterval(ollamaAuthPollTimer); ollamaAuthPollTimer = null; }
  }

  function handleAuthSuccess() {
    var apiUrl = "http://localhost:11434";
    if (ollamaConnectContext === "setup") {
      $("setupApiUrl").value = apiUrl;
      $("setupApiKey").value = "";
      $("setupApiKeyGroup").style.display = "none";
    } else {
      $("apiUrlInput").value = apiUrl;
      $("apiKeyInput").value = "";
      $("ollamaLoginStatus").textContent = "Verbunden mit Ollama Cloud (Device Auth)! 🎉";
      $("ollamaLoginStatus").className = "hint success";
      saveSettings();
    }
    setTimeout(closeOllamaConnectModal, 2000);
  }

  function closeOllamaConnectModal() {
    stopAuthPolling();
    callBackend("stop_auth", {}).catch(function() {});
    closeModal("ollamaConnectBackdrop", "ollamaConnectModal");
  }

  function setupOllamaConnectEvents() {
    $("ollamaConnectClose").addEventListener("click", closeOllamaConnectModal);
    $("ollamaConnectBackdrop").addEventListener("click", closeOllamaConnectModal);
    $("ollamaReopenLoginBtn").addEventListener("click", function() {
      callBackend("open_ollama_login", {}).catch(function() {});
    });
    $("ollamaOpenKeysBtn").addEventListener("click", function() {
      callBackend("open_ollama_keys", {}).catch(function() {});
    });
    $("ollamaConnectConfirmBtn").addEventListener("click", function() {
      var key = $("ollamaConnectKey").value.trim();
      if (!key) {
        $("ollamaConnectStatus").textContent = "Bitte API Key eingeben.";
        $("ollamaConnectStatus").className = "hint error";
        return;
      }
      var apiUrl = ollamaConnectContext === "setup" ? ($("setupApiUrl").value.trim() || "https://api.ollama.ai") : ($("apiUrlInput").value.trim() || "https://api.ollama.ai");
      callBackend("ollama_health", { apiUrl: apiUrl }).then(function(ok) {
        if (ollamaConnectContext === "setup") {
          $("setupApiUrl").value = apiUrl;
          $("setupApiKey").value = key;
          $("setupApiKeyGroup").style.display = "block";
        } else {
          $("apiUrlInput").value = apiUrl;
          $("apiKeyInput").value = key;
          saveSettings();
        }
        $("ollamaConnectStatus").textContent = "API Key gespeichert.";
        $("ollamaConnectStatus").className = "hint success";
        setTimeout(closeOllamaConnectModal, 1000);
      }).catch(function(err) {
        $("ollamaConnectStatus").textContent = "Fehler: " + err;
        $("ollamaConnectStatus").className = "hint error";
      });
    });
  }

  // --- GLOBAL ESC ---
  function setupGlobalEscListener() {
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        if ($("modelModal").style.display !== "none") closeModelModal();
        if ($("ollamaConnectModal").style.display !== "none") closeOllamaConnectModal();
        if ($("skillModal").style.display !== "none") closeModal("skillModalBackdrop", "skillModal");
        if ($("memoryEditModal").style.display !== "none") closeModal("memoryEditBackdrop", "memoryEditModal");
        if ($("pwEditModal").style.display !== "none") closeModal("pwEditBackdrop", "pwEditModal");
        if ($("agentModal").style.display !== "none") closeModal("agentModalBackdrop", "agentModal");
        if ($("confirmModal").style.display !== "none") closeModal("confirmBackdrop", "confirmModal");
      }
    });
  }

  // --- SETUP SCREEN ---
  function initSetup() {
    var setupDone = getSettingBool(STORAGE_KEYS.setupDone, false);
    if (setupDone && settings.apiUrl) {
      showMainApp();
      return;
    }
    $("setupScreen").style.display = "flex";
    $("mainApp").style.display = "none";

    // Subtle FBM wave shader behind the setup card
    initWaveBackground("setupWaveCanvas", 0.15);

    $$("#setupScreen [data-mode]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var mode = btn.getAttribute("data-mode");
        var config = $("setupConfig");
        var urlInput = $("setupApiUrl");
        var keyGroup = $("setupApiKeyGroup");
        config.style.display = "block";
        if (mode === "local") {
          urlInput.value = "http://localhost:11434";
          keyGroup.style.display = "none";
          loadSetupModels(urlInput.value, "");
        } else if (mode === "cloud") {
          urlInput.value = "https://api.ollama.ai";
          keyGroup.style.display = "none";
          openOllamaConnectModal("setup");
          loadSetupModels(urlInput.value, $("setupApiKey").value);
        } else {
          urlInput.value = "http://localhost:11434";
          keyGroup.style.display = "block";
          loadSetupModels(urlInput.value, $("setupApiKey").value);
        }
      });
    });

    $("setupModelChooseBtn").addEventListener("click", function() {
      loadSetupModels($("setupApiUrl").value.trim(), $("setupApiKey").value.trim());
    });
    $("setupModelDisplay").addEventListener("click", function() { $("setupModelChooseBtn").click(); });

    $("setupConnectBtn").addEventListener("click", function() {
      var url = $("setupApiUrl").value.trim();
      var key = $("setupApiKey").value.trim();
      var model = $("setupModelInput").value.trim() || $("setupModelDisplay").value.trim();
      if (!url) {
        $("setupStatus").textContent = "Bitte API URL eingeben.";
        $("setupStatus").className = "hint error";
        return;
      }
      $("setupStatus").textContent = "Teste Verbindung...";
      $("setupStatus").className = "hint";
      callBackend("ollama_health", { apiUrl: url }).then(function(ok) {
        if (ok) {
          settings.apiUrl = url; settings.apiKey = key; settings.model = model || "llama3.2";
          setSetting(STORAGE_KEYS.apiUrl, url);
          setSetting(STORAGE_KEYS.apiKey, key);
          setSetting(STORAGE_KEYS.model, settings.model);
          setSetting(STORAGE_KEYS.setupDone, "true");
          $("setupStatus").textContent = "Verbunden! Starte App...";
          $("setupStatus").className = "hint success";
          setTimeout(showMainApp, 800);
        } else {
          $("setupStatus").textContent = "Keine Verbindung zu Ollama unter " + url + ".";
          $("setupStatus").className = "hint error";
        }
      }).catch(function(err) {
        $("setupStatus").textContent = "Fehler: " + err;
        $("setupStatus").className = "hint error";
      });
    });

    $("setupOfflineBtn").addEventListener("click", function() {
      settings.apiUrl = $("setupApiUrl").value.trim() || defaults.apiUrl;
      settings.apiKey = $("setupApiKey").value.trim();
      settings.model = $("setupModelInput").value.trim() || $("setupModelDisplay").value.trim() || defaults.model;
      setSetting(STORAGE_KEYS.apiUrl, settings.apiUrl);
      setSetting(STORAGE_KEYS.apiKey, settings.apiKey);
      setSetting(STORAGE_KEYS.model, settings.model);
      setSetting(STORAGE_KEYS.setupDone, "true");
      showMainApp();
    });
  }

  function loadSetupModels(url, key) {
    callBackend("ollama_list_models", { apiUrl: url, apiKey: key }).then(function(models) {
      if (models && models.length > 0) {
        openModelModal("setup", models);
      } else {
        $("setupModelStatus").textContent = "Keine Modelle gefunden. Bitte manuell eingeben.";
        $("setupModelStatus").className = "hint";
      }
    }).catch(function() {
      $("setupModelStatus").textContent = "Modelle konnten nicht geladen werden.";
      $("setupModelStatus").className = "hint";
    });
  }

  function showMainApp() {
    $("setupScreen").style.display = "none";
    $("mainApp").style.display = "flex";
    initMain();
  }

  // --- MAIN APP INIT ---
  function initMain() {
    applyTheme();
    initSettings();

    // Subtle FBM wave shader backgrounds for the main app surfaces
    initWaveBackground("sidebarWaveCanvas", 0.08);
    initWaveBackground("welcomeWaveCanvas", 0.12);
    initWaveBackground("chatWaveCanvas", 0.06);
    callBackend("app_version", {}).then(function(v) {
      $("appVersion").textContent = "v" + v;
    }).catch(function() {});

    callBackend("memory_path", {}).then(function(p) {
      $("memoryPathDisplay").textContent = p;
    }).catch(function() {});

    if (!settings.systemPrompt) {
      callBackend("default_system_prompt", {}).then(function(p) {
        settings.systemPrompt = p;
        setSetting(STORAGE_KEYS.systemPrompt, p);
        $("systemPromptInput").value = p;
      }).catch(function() {
        settings.systemPrompt = DEFAULT_SYSTEM_PROMPT_FALLBACK;
        $("systemPromptInput").value = DEFAULT_SYSTEM_PROMPT_FALLBACK;
      });
    }

    updateSessionSelect();
    loadChatFromMemory();
    // Auto-Cleanup beim App-Start (abgelaufene Immediate + Short-Term Eintraege)
    callBackend("memory_auto_cleanup", {}).then(function() {
      callBackend("memory_flow", {}).catch(function() {});
    }).catch(function() {});
    startStatusTimer();
    startActivityPolling();
    startAgentPolling();

    setupNavigation();
    setupChat();
    setupActivity();
    setupMemoryView();
    setupSkillsView();
    setupPasswordManager();
    setupSettingsEvents();
    setupResponsive();
    setupModelModalEvents();
    setupOllamaConnectEvents();
    setupGlobalEscListener();
    setupSkillModal();
    setupMemoryEditModal();
    setupPwEditModal();
    setupAgentModal();
    setupConfirmDialog();
  }

  // --- RESPONSIVE ---
  function setupResponsive() {
    var hamburger = $("hamburgerBtn");
    var sidebar = $("sidebar");
    var backdrop = $("sidebarBackdrop");
    var closeBtn = $("sidebarClose");

    function isMobile() { return window.innerWidth < 700; }
    function openSidebar() { sidebar.classList.add("open"); backdrop.classList.add("visible"); }
    function closeSidebar() { sidebar.classList.remove("open"); backdrop.classList.remove("visible"); }

    if (hamburger) hamburger.addEventListener("click", function() {
      if (sidebar.classList.contains("open")) closeSidebar(); else openSidebar();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
    if (backdrop) backdrop.addEventListener("click", closeSidebar);

    window.addEventListener("resize", function() {
      if (window.innerWidth >= 700) { closeSidebar(); sidebar.style.display = ""; }
      else { sidebar.style.display = ""; }
      if (brainViewerInitialized) onBrainResize();
    });

    if (!isMobile()) closeSidebar();
  }

  // --- NAVIGATION ---
  function setupNavigation() {
    $$(".nav-item").forEach(function(btn) {
      btn.addEventListener("click", function() {
        switchView(btn.getAttribute("data-view"));
      });
    });
  }

  function switchView(view) {
    $$(".view").forEach(function(v) { v.classList.remove("active"); });
    $$(".nav-item").forEach(function(n) { n.classList.remove("active"); });
    $("view-" + view).classList.add("active");
    var navBtn = document.querySelector('.nav-item[data-view="' + view + '"]');
    if (navBtn) navBtn.classList.add("active");
    if (view === "memory") { initBrainViewer(); loadMemoryZone("immediate"); updateFlowStats(); }
    if (view === "skills") loadSkills();
    if (view === "passwords") loadPasswords();
    if (view === "activity") loadActivities();
    var sidebar = $("sidebar");
    var backdrop = $("sidebarBackdrop");
    if (window.innerWidth < 700) {
      sidebar.classList.remove("open");
      backdrop.classList.remove("visible");
    }
  }

  // --- STATUS CHECK ---
  var statusTimer = null;
  function checkStatus() {
    var dot = $("statusDot");
    var text = $("statusText");
    if (dot) { dot.className = "status-dot checking"; text.textContent = "Pruefe..."; }
    callBackend("ollama_health", { apiUrl: settings.apiUrl }).then(function(ok) {
      if (dot) {
        dot.className = "status-dot " + (ok ? "online" : "offline");
        text.textContent = ok ? "Online — " + settings.model : "Offline";
      }
    }).catch(function() {
      if (dot) { dot.className = "status-dot offline"; text.textContent = "Offline"; }
    });
  }
  function startStatusTimer() {
    checkStatus();
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(checkStatus, 30000);
  }

  // --- ACTIVITY FEED ---
  var activityTimer = null;
  var lastActivityCount = 0;
  var currentActivityFilter = "";

  // Activity-Kategorien fuer das Spektrum
  var ACTIVITY_CATEGORIES = {
    chat: { label: "Chat", color: "#0071e3", icon: "💬", types: ["thinking", "action"] },
    skill: { label: "Skills", color: "#30d158", icon: "🔧", types: ["skill"] },
    command: { label: "Befehl", color: "#ff9500", icon: "💻", types: ["command"] },
    file: { label: "Datei", color: "#00d4ff", icon: "📁", types: ["file_read", "file_write"] },
    error: { label: "Fehler", color: "#ff3b30", icon: "❌", types: ["error"] },
    agent: { label: "Agent", color: "#bf5af2", icon: "🚀", types: ["agent_started", "agent_completed"] },
    memory: { label: "Memory", color: "#ffd60a", icon: "💾", types: ["memory_saved"] }
  };

  // Nuterprofil aus localStorage laden
  var userProfile = loadUserProfile();

  function loadUserProfile() {
    try {
      var saved = localStorage.getItem("titan_user_profile");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      categoryCounts: {},
      totalActivities: 0,
      sessions: 0,
      topActions: {},
      lastSaved: 0
    };
  }

  function saveUserProfile() {
    try {
      userProfile.lastSaved = Date.now();
      localStorage.setItem("titan_user_profile", JSON.stringify(userProfile));
    } catch (e) {}
  }

  // Baut Kontext-String fuer System-Prompt aus Nutzerprofil
  function buildUserProfileContext() {
    var counts = userProfile.categoryCounts || {};
    var sortedCats = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
    if (sortedCats.length === 0) return "";
    var parts = [];
    parts.push("Nutzerprofil (aus Activity-Historie gelernt):");
    parts.push("- Sessions: " + (userProfile.sessions || 0));
    parts.push("- Activities gesamt: " + (userProfile.totalActivities || 0));
    var topCats = sortedCats.slice(0, 3).map(function(cat) {
      var cfg = ACTIVITY_CATEGORIES[cat] || { label: cat };
      var pct = Math.round((counts[cat] / userProfile.totalActivities) * 100);
      return "  " + cfg.label + ": " + pct + "% (" + counts[cat] + ")";
    });
    parts.push("- Top-Kategorien: " + topCats.join(", "));
    var topActions = userProfile.topActions || {};
    var sortedActions = Object.keys(topActions).sort(function(a, b) { return topActions[b] - topActions[a]; });
    if (sortedActions.length > 0) {
      var top3 = sortedActions.slice(0, 3).map(function(a) { return a + " (" + topActions[a] + "x)"; });
      parts.push("- Haeufigste Aktionen: " + top3.join(", "));
    }
    if (sortedCats.length > 0) {
      var topCat = sortedCats[0];
      var cfg = ACTIVITY_CATEGORIES[topCat] || { label: topCat };
      parts.push("- Der Nutzer fragt meistens nach: " + cfg.label);
    }
    return parts.join("\n");
  }

  function categorizeActivity(type) {
    for (var cat in ACTIVITY_CATEGORIES) {
      if (ACTIVITY_CATEGORIES[cat].types.indexOf(type) >= 0) return cat;
    }
    return "chat";
  }

  function updateUserProfile(activities) {
    var changed = false;
    activities.forEach(function(a) {
      var cat = categorizeActivity(a.type);
      userProfile.categoryCounts[cat] = (userProfile.categoryCounts[cat] || 0) + 1;
      userProfile.totalActivities++;
      var msgShort = (a.message || a.type).substring(0, 80);
      userProfile.topActions[msgShort] = (userProfile.topActions[msgShort] || 0) + 1;
      changed = true;
    });
    if (changed) {
      // Session-Zaehler beim ersten Activity dieser Session
      var sessionKey = "titan_session_started";
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, "1");
        userProfile.sessions = (userProfile.sessions || 0) + 1;
      }
      saveUserProfile();
    }
  }

  function startActivityPolling() {
    loadActivities();
    if (activityTimer) clearInterval(activityTimer);
    activityTimer = setInterval(loadActivities, 2000);
  }

  function setupActivity() {
    $("clearActivityBtn").addEventListener("click", function() {
      callBackend("clear_activities", {}).then(function() {
        loadActivities();
      }).catch(function() {});
    });
    $("activityFilter").addEventListener("change", function() {
      currentActivityFilter = this.value;
      loadActivities();
    });
  }

  // Berechne Kategorie-Verteilung
  function computeCategoryStats(activities) {
    var stats = {};
    for (var cat in ACTIVITY_CATEGORIES) stats[cat] = 0;
    activities.forEach(function(a) {
      var cat = categorizeActivity(a.type);
      stats[cat] = (stats[cat] || 0) + 1;
    });
    return stats;
  }

  // Zeichne das Spektrum als horizontale Balken mit Canvas
  function renderActivitySpectrum(stats) {
    var canvas = $("activitySpectrumCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var cats = Object.keys(ACTIVITY_CATEGORIES);
    var maxVal = 0;
    cats.forEach(function(c) { if (stats[c] > maxVal) maxVal = stats[c]; });
    if (maxVal === 0) maxVal = 1;

    var barHeight = Math.max(12, (h - 8) / cats.length - 4);
    var labelWidth = 70;
    var barAreaX = labelWidth;
    var barAreaW = w - labelWidth - 50;

    cats.forEach(function(cat, i) {
      var y = i * (barHeight + 4) + 4;
      var val = stats[cat] || 0;
      var barW = (val / maxVal) * barAreaW;
      var cfg = ACTIVITY_CATEGORIES[cat];

      // Label
      ctx.fillStyle = cfg.color;
      ctx.font = "11px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(cfg.icon + " " + cfg.label, 2, y + barHeight / 2);

      // Bar background
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(barAreaX, y, barAreaW, barHeight);

      // Bar fill
      ctx.fillStyle = cfg.color;
      ctx.fillRect(barAreaX, y, Math.max(barW, val > 0 ? 3 : 0), barHeight);

      // Count
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "right";
      ctx.fillText(String(val), w - 4, y + barHeight / 2);
    });
  }

  // Zeichne ein Donut-Chart als Alternative (rechts neben den Balken)
  function renderActivityDonut(stats) {
    var canvas = $("activityDonutCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var cats = Object.keys(ACTIVITY_CATEGORIES);
    var total = 0;
    cats.forEach(function(c) { total += stats[c] || 0; });
    if (total === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Keine Daten", w / 2, h / 2);
      return;
    }

    var cx = w / 2;
    var cy = h / 2;
    var radius = Math.min(w, h) / 2 - 6;
    var innerRadius = radius * 0.55;

    var angle = -Math.PI / 2;
    cats.forEach(function(cat) {
      var val = stats[cat] || 0;
      if (val === 0) return;
      var slice = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, angle, angle + slice);
      ctx.arc(cx, cy, innerRadius, angle + slice, angle, true);
      ctx.closePath();
      ctx.fillStyle = ACTIVITY_CATEGORIES[cat].color;
      ctx.fill();
      angle += slice;
    });

    // Center text
    ctx.fillStyle = "#f5f5f7";
    ctx.font = "bold 18px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(total), cx, cy - 6);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.fillText("Total", cx, cy + 10);
  }

  // Nuterprofil-Panel rendern
  function renderUserProfilePanel() {
    var panel = $("userProfilePanel");
    if (!panel) return;
    var counts = userProfile.categoryCounts || {};
    var sortedCats = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
    var topActions = userProfile.topActions || {};
    var sortedActions = Object.keys(topActions).sort(function(a, b) { return topActions[b] - topActions[a]; });

    var html = '<div class="profile-header">Nutzerprofil</div>';
    html += '<div class="profile-stats">';
    html += '<div class="profile-stat"><span class="profile-stat-value">' + (userProfile.totalActivities || 0) + '</span><span class="profile-stat-label">Activities</span></div>';
    html += '<div class="profile-stat"><span class="profile-stat-value">' + (userProfile.sessions || 0) + '</span><span class="profile-stat-label">Sessions</span></div>';
    html += '<div class="profile-stat"><span class="profile-stat-value">' + sortedCats.length + '</span><span class="profile-stat-label">Kategorien</span></div>';
    html += '</div>';

    if (sortedCats.length > 0) {
      html += '<div class="profile-section">Top-Kategorien</div>';
      sortedCats.slice(0, 5).forEach(function(cat) {
        var cfg = ACTIVITY_CATEGORIES[cat] || { icon: "", label: cat, color: "#888" };
        var pct = Math.round((counts[cat] / userProfile.totalActivities) * 100);
        html += '<div class="profile-cat-row">' +
          '<span class="profile-cat-icon" style="color:' + cfg.color + '">' + cfg.icon + '</span>' +
          '<span class="profile-cat-label">' + escapeHtml(cfg.label) + '</span>' +
          '<div class="profile-cat-bar"><div class="profile-cat-fill" style="width:' + pct + '%;background:' + cfg.color + '"></div></div>' +
          '<span class="profile-cat-count">' + counts[cat] + '</span>' +
          '</div>';
      });
    }

    if (sortedActions.length > 0) {
      html += '<div class="profile-section">Haeufigste Aktionen</div>';
      sortedActions.slice(0, 5).forEach(function(action) {
        html += '<div class="profile-action-row">' +
          '<span class="profile-action-count">' + topActions[action] + 'x</span>' +
          '<span class="profile-action-text">' + escapeHtml(action) + '</span>' +
          '</div>';
      });
    }

    if (sortedCats.length > 0) {
      var topCat = sortedCats[0];
      var cfg = ACTIVITY_CATEGORIES[topCat] || { label: topCat };
      html += '<div class="profile-summary">Der Nutzer fragt meistens nach: ' + escapeHtml(cfg.label) + '</div>';
    }

    panel.innerHTML = html;
  }

  function loadActivities() {
    callBackend("get_activities", { limit: 200 }).then(function(result) {
      var activities = [];
      try {
        activities = typeof result === "string" ? JSON.parse(result) : result;
      } catch (e) { activities = []; }
      if (!Array.isArray(activities)) activities = [];

      // Nuterprofil aktualisieren (nur neue Activities zaehlen)
      if (activities.length > lastActivityCount) {
        var newOnes = activities.slice(lastActivityCount);
        updateUserProfile(newOnes);
      }

      // Badge aktualisieren
      if (activities.length > 0) {
        var newCount = activities.length;
        if (newCount > lastActivityCount && lastActivityCount > 0) {
          var badge = $("activityNavBadge");
          badge.textContent = newCount - lastActivityCount;
          badge.style.display = "inline-block";
        }
        lastActivityCount = newCount;
      }

      // Spektrum + Donut zeichnen
      var stats = computeCategoryStats(activities);
      renderActivitySpectrum(stats);
      renderActivityDonut(stats);

      // Nuterprofil-Panel aktualisieren
      renderUserProfilePanel();

      // Filter
      var filtered = activities;
      if (currentActivityFilter) {
        filtered = activities.filter(function(a) { return a.type === currentActivityFilter; });
      }
      renderActivities(filtered.slice(0, 200));
    }).catch(function() {
      var list = $("activityList");
      if (list) list.innerHTML = '<div class="empty-state"><p>Activities nicht verfuegbar.</p></div>';
    });
  }

  function renderActivities(activities) {
    var list = $("activityList");
    if (!list) return;
    if (activities.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>Keine Activities.</p></div>';
      return;
    }
    list.innerHTML = "";
    activities.forEach(function(a) {
      var row = document.createElement("div");
      row.className = "activity-row";
      var ic = ACTIVITY_ICONS[a.type] || { icon: "•", color: "" };
      var ts = a.timestamp ? formatTimestamp(a.timestamp * 1000) : formatTimestamp(Date.now());
      row.innerHTML = '<div class="activity-icon ' + ic.color + '">' + ic.icon + '</div>' +
        '<div class="activity-message">' + escapeHtml(a.message || a.type) + '</div>' +
        '<div class="activity-timestamp">' + ts + '</div>';
      list.appendChild(row);
    });
  }

  // --- AGENT STATUS POLLING ---
  var agentTimer = null;
  function startAgentPolling() {
    updateAgentStatus();
    if (agentTimer) clearInterval(agentTimer);
    agentTimer = setInterval(updateAgentStatus, 3000);
  }

  function updateAgentStatus() {
    callBackend("list_agents", {}).then(function(result) {
      var agents = [];
      try { agents = typeof result === "string" ? JSON.parse(result) : result; } catch (e) {}
      if (!Array.isArray(agents)) agents = [];
      renderAgents(agents);
    }).catch(function() {
      var container = $("sidebarAgents");
      if (container) container.style.display = "none";
    });
  }

  function renderAgents(agents) {
    var container = $("sidebarAgents");
    var list = $("agentsList");
    if (!container || !list) return;
    if (agents.length === 0) {
      container.style.display = "none";
      return;
    }
    container.style.display = "block";
    list.innerHTML = "";
    agents.forEach(function(a) {
      var item = document.createElement("div");
      item.className = "agent-item";
      var status = a.status || "running";
      var taskPreview = (a.task || "Agent").substring(0, 30);
      item.innerHTML = '<span class="agent-status-dot ' + status + '"></span>' +
        '<span class="agent-name">' + escapeHtml(taskPreview) + '</span>' +
        '<button class="mz-action-btn" data-agent-id="' + escapeHtml(a.id) + '" title="Stoppen">⏹</button>';
      list.appendChild(item);
    });
    list.querySelectorAll("[data-agent-id]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        callBackend("stop_agent", { agentId: btn.getAttribute("data-agent-id") }).then(function() {
          updateAgentStatus();
        }).catch(function() {});
      });
    });
  }

  // --- CHAT: SESSIONS ---
  function loadChatFromMemory() {
    if (!settings.currentSession) {
      callBackend("memory_create_session", { name: "" }).then(function(sid) {
        settings.currentSession = sid;
        setSetting(STORAGE_KEYS.currentSession, sid);
        loadSessionsList();
      }).catch(function() {
        settings.currentSession = generateId();
        setSetting(STORAGE_KEYS.currentSession, settings.currentSession);
      });
    } else {
      loadSessionsList();
      loadMessagesForSession(settings.currentSession);
    }
  }

  function loadSessionsList() {
    callBackend("memory_get_sessions", {}).then(function(result) {
      try {
        var sessions = JSON.parse(result);
        updateSessionSelectWithData(sessions);
      } catch (e) {}
    }).catch(function() {});
  }

  function updateSessionSelectWithData(sessions) {
    var select = $("sessionSelect");
    select.innerHTML = '<option value="">Neue Sitzung</option>';
    sessions.forEach(function(s) {
      var opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name + " (" + (s.message_count || 0) + ")";
      if (s.id === settings.currentSession) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function updateSessionSelect() { loadSessionsList(); }

  function loadMessagesForSession(sid) {
    callBackend("memory_get_messages", { sessionId: sid }).then(function(result) {
      try {
        var msgs = JSON.parse(result);
        chatHistory[sid] = msgs.map(function(m) {
          return { role: m.role, content: m.content, ts: m.timestamp * 1000 };
        });
        renderChatMessages();
      } catch (e) {
        chatHistory[sid] = [];
        renderChatMessages();
      }
    }).catch(function() {
      chatHistory[sid] = [];
      renderChatMessages();
    });
  }

  function getSessionMessages() {
    var sid = settings.currentSession;
    if (!sid) return [];
    return chatHistory[sid] || [];
  }

  function renderChatMessages() {
    var container = $("chatMessages");
    var welcome = $("chatWelcome");
    var messages = getSessionMessages();
    container.querySelectorAll(".message").forEach(function(m) { m.remove(); });
    if (messages.length === 0) {
      if (welcome) welcome.style.display = "flex";
      return;
    }
    if (welcome) welcome.style.display = "none";
    messages.forEach(function(msg) {
      appendMessage(msg.role, msg.content, msg.ts, false, msg.skill);
    });
    scrollToBottom();
  }

  function appendMessage(role, content, ts, animate, skillInfo) {
    var container = $("chatMessages");
    var welcome = $("chatWelcome");
    if (welcome) welcome.style.display = "none";
    var msg = document.createElement("div");
    msg.className = "message " + (role === "user" ? "user" : "titan");
    var avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "T" : "TT";
    var contentWrap = document.createElement("div");
    contentWrap.className = "message-content";
    var header = document.createElement("div");
    header.className = "message-header";
    var author = document.createElement("span");
    author.className = "message-author";
    author.textContent = role === "user" ? "Du" : "Titan Toti";
    var time = document.createElement("span");
    time.className = "message-time";
    time.textContent = formatTime(ts);
    header.appendChild(author);
    header.appendChild(time);
    var body = document.createElement("div");
    body.className = "message-body";
    body.innerHTML = renderMarkdown(content);
    contentWrap.appendChild(header);

    if (skillInfo && skillInfo.skill_name) {
      var badge = document.createElement("div");
      badge.className = "skill-badge " + (skillInfo.success ? "success" : "error");
      badge.innerHTML = '<span class="skill-badge-icon">🔧</span> Skill: ' + escapeHtml(skillInfo.skill_name) + (skillInfo.success ? " ausgefuehrt" : " fehlgeschlagen");
      contentWrap.appendChild(badge);
      var resultDiv = document.createElement("div");
      resultDiv.className = "skill-result";
      resultDiv.innerHTML = '<pre>' + escapeHtml(skillInfo.result || "") + '</pre>';
      contentWrap.appendChild(resultDiv);
    }

    contentWrap.appendChild(body);
    msg.appendChild(avatar);
    msg.appendChild(contentWrap);
    container.appendChild(msg);
    if (animate !== false) scrollToBottom();
    body.querySelectorAll(".copy-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var code = decodeURIComponent(btn.getAttribute("data-code"));
        navigator.clipboard.writeText(code).then(function() {
          btn.textContent = "Kopiert!";
          setTimeout(function() { btn.textContent = "Kopieren"; }, 2000);
        });
      });
    });
  }

  function scrollToBottom() {
    var container = $("chatMessages");
    container.scrollTop = container.scrollHeight;
  }

  // --- CHAT SAVE BADGES ---
  function appendSaveBadge(type, text) {
    var container = $("chatMessages");
    var badge = document.createElement("div");
    var badgeClass = "save-badge save-badge-" + (type === "memory" ? "memory" : type === "skill" ? "skill" : "action");
    badge.className = badgeClass;
    var icon = type === "memory" ? "💾" : type === "skill" ? "🔧" : "⚡";
    badge.innerHTML = '<span class="save-badge-icon">' + icon + '</span>' +
      '<span class="save-badge-text">' + escapeHtml(text) + '</span>';
    container.appendChild(badge);
    scrollToBottom();
  }

  // Hilfsfunktion: Memory speichern + Badge + Activity loggen
  function saveMemoryWithBadge(key, value, tags) {
    callBackend("memory_add_immediate", { key: key, value: value, tags: tags }).then(function() {
      appendSaveBadge("memory", "Memory gespeichert: " + key);
      callBackend("log_activity", { activityType: "memory_saved", message: "Memory: " + key + " = " + value.substring(0, 60), timestamp: String(Date.now()) }).catch(function() {});
    }).catch(function() {});
  }

  // Hilfsfunktion: Skill lernen + Badge + Activity loggen
  function learnSkillWithBadge(name, description, category, steps) {
    callBackend("memory_add_skill", { name: name, description: description, category: category, steps: steps }).then(function() {
      appendSaveBadge("skill", "Skill gelernt: " + name);
      callBackend("log_activity", { activityType: "memory_saved", message: "Skill gelernt: " + name, timestamp: String(Date.now()) }).catch(function() {});
    }).catch(function() {});
  }

  // --- ACTIVITY BADGE ---
  function showChatActivity(text) {
    var badge = $("chatActivityBadge");
    $("chatActivityText").textContent = text || "Titan arbeitet...";
    badge.style.display = "flex";
  }
  function hideChatActivity() {
    $("chatActivityBadge").style.display = "none";
  }

  // --- ATTACHED FILES ---
  var attachedFiles = [];
  var attachedImages = [];

  function setupFileDrop() {
    var hint = $("fileDropHint");
    document.addEventListener("dragover", function(e) { e.preventDefault(); hint.style.display = "block"; });
    document.addEventListener("dragleave", function(e) { if (e.target === document) hint.style.display = "none"; });
    document.addEventListener("drop", function(e) {
      e.preventDefault();
      hint.style.display = "none";
      var files = e.dataTransfer.files;
      for (var i = 0; i < files.length; i++) {
        attachedFiles.push({ name: files[i].name, path: files[i].path });
      }
      renderAttachedFiles();
    });

    // Bild anhaengen Button
    $("attachImageBtn").addEventListener("click", function() {
      $("imageFileInput").click();
    });
    $("imageFileInput").addEventListener("change", function() {
      var file = this.files[0];
      if (file) {
        attachedImages.push({ name: file.name, path: file.path });
        renderAttachedFiles();
      }
      this.value = "";
    });

    // Screenshot Button
    $("screenshotBtn").addEventListener("click", function() {
      showChatActivity("Mache Screenshot...");
      callBackend("screenshot", {}).then(function(result) {
        hideChatActivity();
        appendMessage("user", "📸 Screenshot gemacht — wird analysiert...", Date.now(), true);
        var imagePath = typeof result === "string" ? result : (result && result.path ? result.path : "");
        if (imagePath) {
          analyzeImageInternal(imagePath);
        } else {
          appendMessage("titan", "Screenshot konnte nicht erstellt werden.", Date.now(), true);
        }
      }).catch(function(err) {
        hideChatActivity();
        appendMessage("titan", "Screenshot-Fehler: " + err, Date.now(), true);
      });
    });

    // Agent starten Button
    $("agentSpawnBtn").addEventListener("click", function() {
      openModal("agentModalBackdrop", "agentModal");
    });
  }

  function renderAttachedFiles() {
    var container = $("attachedFiles");
    container.innerHTML = "";
    attachedFiles.forEach(function(f, idx) {
      var chip = document.createElement("div");
      chip.className = "file-chip";
      chip.innerHTML = '<span>📎 ' + escapeHtml(f.name) + '</span><button class="file-remove" data-idx="' + idx + '" data-type="file">x</button>';
      container.appendChild(chip);
    });
    attachedImages.forEach(function(f, idx) {
      var chip = document.createElement("div");
      chip.className = "file-chip";
      chip.innerHTML = '<span>🖼 ' + escapeHtml(f.name) + '</span><button class="file-remove" data-idx="' + idx + '" data-type="image">x</button>';
      container.appendChild(chip);
    });
    container.querySelectorAll(".file-remove").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var idx = parseInt(btn.getAttribute("data-idx"));
        var type = btn.getAttribute("data-type");
        if (type === "file") attachedFiles.splice(idx, 1);
        else attachedImages.splice(idx, 1);
        renderAttachedFiles();
      });
    });
  }

  function analyzeImageInternal(imagePath) {
    showChatActivity("Analysiere Bild...");
    callBackend("analyze_image", { imagePath: imagePath, model: settings.model }).then(function(result) {
      hideChatActivity();
      var analysis = typeof result === "string" ? result : (result && result.description ? result.description : JSON.stringify(result));
      appendMessage("titan", analysis, Date.now(), true);
      callBackend("log_activity", { activityType: "action", message: "Bild analysiert" , timestamp: String(Date.now()) }).catch(function() {});
    }).catch(function(err) {
      hideChatActivity();
      appendMessage("titan", "Vision-Fehler: " + err, Date.now(), true);
    });
  }

  // --- SEND MESSAGE ---
  function sendMessage() {
    var input = $("chatInput");
    var text = input.value.trim();
    if (!text) return;

    if (text.charAt(0) === "/") {
      handleSlashCommand(text);
      input.value = "";
      input.style.height = "auto";
      return;
    }

    if (!settings.currentSession) {
      settings.currentSession = generateId();
      setSetting(STORAGE_KEYS.currentSession, settings.currentSession);
    }

    var fileContext = "";
    if (attachedFiles.length > 0) {
      fileContext = "\n\n[Angehaengte Dateien:\n";
      attachedFiles.forEach(function(f) { fileContext += "- " + f.name + " (" + f.path + ")\n"; });
      fileContext += "]";
    }

    var ts = Date.now();
    var userMsg = text + fileContext;
    appendMessage("user", text + (fileContext ? "\n\n\u{1F4CE} " + attachedFiles.length + " Datei(en) angehaengt" : ""), ts, true);

    if (attachedImages.length > 0) {
      attachedImages.forEach(function(img) { analyzeImageInternal(img.path); });
    }

    callBackend("memory_add_message", { sessionId: settings.currentSession, role: "user", content: userMsg }).catch(function() {});
    callBackend("memory_add_immediate", { key: "chat_user_" + Date.now(), value: userMsg, tags: ["chat", "user"] }).catch(function() {});
    callBackend("log_activity", { activityType: "thinking", message: "Nachricht empfangen" , timestamp: String(Date.now()) }).catch(function() {});

    input.value = "";
    input.style.height = "auto";
    attachedFiles = [];
    attachedImages = [];
    renderAttachedFiles();

    $("typingIndicator").style.display = "flex";
    showChatActivity("Titan denkt nach...");
    scrollToBottom();

    // === AGENT LOOP ===
    var agentMessages = [];
    var sysContent = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT_FALLBACK;
    if (sysContent.indexOf("[TOOL:") < 0) sysContent = DEFAULT_SYSTEM_PROMPT_FALLBACK;
    // Nuterprofil in System-Prompt einbauen
    var profileContext = buildUserProfileContext();
    if (profileContext) sysContent = sysContent + "\n\n" + profileContext;
    agentMessages.push({ role: "system", content: sysContent });
    var sessionMsgs = getSessionMessages();
    var recent = sessionMsgs.slice(-10);
    recent.forEach(function(m) {
      agentMessages.push({ role: m.role === "user" ? "user" : "assistant", content: m.content });
    });
    agentMessages.push({ role: "user", content: userMsg });

    runAgentLoop(agentMessages, 0);
  }

  function runAgentLoop(messages, depth) {
    var MAX_ITERATIONS = 10;
    if (depth >= MAX_ITERATIONS) {
      $("typingIndicator").style.display = "none";
      hideChatActivity();
      appendMessage("assistant", "Ich habe zu viele Schritte gebraucht und breche hier ab. Was soll ich tun?", Date.now(), true);
      return;
    }

    showChatActivity(depth === 0 ? "Titan denkt nach..." : "Titan fuehrt aus (Schritt " + (depth + 1) + ")...");
    callBackend("ollama_chat", {
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      messages: messages,
      temperature: settings.temperature,
      maxTokens: Math.round(settings.maxTokens),
      fallbackModels: parseFallbackModels(settings.fallbackModels)
    }).then(function(response) {
      var toolCalls = parseToolCalls(response);

      if (toolCalls.length === 0) {
        // No tools = final answer
        $("typingIndicator").style.display = "none";
        hideChatActivity();
        appendMessage("assistant", response, Date.now(), true);
        callBackend("memory_add_message", { sessionId: settings.currentSession, role: "assistant", content: response }).catch(function() {});
        saveMemoryWithBadge("chat_assistant_" + Date.now(), response, ["chat", "assistant"]);
        callBackend("log_activity", { activityType: "action", message: "Antwort gesendet" , timestamp: String(Date.now()) }).catch(function() {});
        return;
      }

      // Execute all tool calls
      var toolResults = [];
      var pending = toolCalls.length;
      toolCalls.forEach(function(tc) {
        showChatActivity("Fuehre aus: " + tc.tool + " " + tc.args.join(" ").substring(0, 40));
        callBackend("log_activity", { activityType: "skill", message: "Tool: " + tc.tool + " " + tc.args.join(" ").substring(0, 60) , timestamp: String(Date.now()) }).catch(function() {});
        saveMemoryWithBadge("tool_" + tc.tool + "_" + Date.now(), tc.tool + " " + tc.args.join(" "), ["tool", "execution"]);
        executeTool(tc).then(function(result) {
          toolResults.push({ tool: tc.tool, args: tc.args, result: result, success: result.indexOf("FEHLER") !== 0 });
          pending--;
          if (pending === 0) {
            // Add assistant response to messages
            messages.push({ role: "assistant", content: response });
            // Add tool results
            var resultSummary = "Tool-Ergebnisse:\n";
            toolResults.forEach(function(r) {
              resultSummary += "[" + r.tool + " " + r.args.join(",") + "] -> " + (r.success ? "OK" : "FEHLER") + ": " + r.result.substring(0, 500) + "\n";
            });
            resultSummary += "\nNutze diese Ergebnisse um weiterzumachen oder dem Nutzer zu antworten.";
            messages.push({ role: "system", content: resultSummary });
            // Show tool execution to user
            toolResults.forEach(function(r) {
              var badge = { matched: true, skill_name: r.tool + " " + r.args.join(" ").substring(0, 30), result: r.result, success: r.success };
              appendMessage("assistant", "", Date.now(), true, badge);
            });
            // Continue loop
            runAgentLoop(messages, depth + 1);
          }
        });
      });
    }).catch(function(err) {
      $("typingIndicator").style.display = "none";
      hideChatActivity();
      appendMessage("assistant", "Fehler: " + err, Date.now(), true);
      callBackend("memory_add_immediate", { key: "chat_error_" + Date.now(), value: "Fehler: " + err, tags: ["chat", "error"] }).catch(function() {});
      callBackend("log_activity", { activityType: "error", message: "Chat-Fehler: " + err , timestamp: String(Date.now()) }).catch(function() {});
    });
  }

  function parseToolCalls(text) {
    var calls = [];
    var regex = /\[TOOL:(\w+):([^\]]+)\]/g;
    var match;
    while ((match = regex.exec(text)) !== null) {
      var tool = match[1];
      var argsStr = match[2];
      var args = argsStr.split(",").map(function(s) { return s.trim(); });
      calls.push({ tool: tool, args: args });
    }
    return calls;
  }

  function executeTool(tc) {
    return new Promise(function(resolve) {
      if (tc.tool === "system_command") {
        if (!settings.systemAccess) { resolve("FEHLER: System-Zugriff deaktiviert"); return; }
        var cmd = tc.args[0];
        var cmdArgs = tc.args.slice(1);
        callBackend("system_command", { command: cmd, args: cmdArgs }).then(function(result) {
          resolve(result || "OK (keine Ausgabe)");
        }).catch(function(e) { resolve("FEHLER: " + e); });
      } else if (tc.tool === "read_file") {
        callBackend("read_file", { path: tc.args[0] }).then(function(result) {
          resolve(result);
        }).catch(function(e) { resolve("FEHLER: " + e); });
      } else if (tc.tool === "write_file") {
        var wpath = tc.args[0];
        var wcontent = tc.args.slice(1).join(",");
        callBackend("write_file", { path: wpath, content: wcontent }).then(function(ok) {
          resolve(ok ? "Datei geschrieben: " + wpath : "FEHLER beim Schreiben");
        }).catch(function(e) { resolve("FEHLER: " + e); });
      } else if (tc.tool === "list_dir") {
        callBackend("list_dir", { path: tc.args[0] }).then(function(result) {
          resolve(Array.isArray(result) ? result.join("\n") : String(result));
        }).catch(function(e) { resolve("FEHLER: " + e); });
      } else if (tc.tool === "screenshot") {
        callBackend("screenshot", {}).then(function(result) {
          resolve(result || "Screenshot gespeichert");
        }).catch(function(e) { resolve("FEHLER: " + e); });
      } else {
        resolve("FEHLER: Unbekanntes Tool: " + tc.tool);
      }
    });
  }

  function buildLLMMessages(userText, skillResult, files) {
    var msgs = [];
    var sysContent = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT_FALLBACK;
    if (sysContent.indexOf("[TOOL:") < 0) sysContent = DEFAULT_SYSTEM_PROMPT_FALLBACK;
    msgs.push({ role: "system", content: sysContent });
    var sessionMsgs = getSessionMessages();
    var recent = sessionMsgs.slice(-10);
    recent.forEach(function(m) {
      msgs.push({ role: m.role === "user" ? "user" : "assistant", content: m.content });
    });
    if (files && files.length > 0) {
      var fileContext = "Der Nutzer hat folgende Dateien angehaengt:\n";
      files.forEach(function(f) { fileContext += "- " + f.name + " (Pfad: " + f.path + ")\n"; });
      msgs.push({ role: "system", content: fileContext });
    }
    msgs.push({ role: "user", content: userText });
    return msgs;
  }

  function parseFallbackModels(str) {
    if (!str) return [];
    return str.split(",").map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  }

  // --- SLASH COMMANDS ---
  function handleSlashCommand(text) {
    var parts = text.split(/\s+/);
    var command = parts[0].toLowerCase();

    // Jeden Befehl ins Immediate Memory speichern
    callBackend("memory_add_immediate", { key: "cmd_" + command + "_" + Date.now(), value: text, tags: ["command", "slash"] }).catch(function() {});

    if (command === "/help") {
      appendMessage("assistant", "**Verfuegbare Befehle:**\n\n- /help — Diese Hilfe\n- /skills — Skill Hub oeffnen\n- /memory — Memory Gehirn oeffnen\n- /agent <task> — Agent starten\n- /vision <image> — Bild analysieren\n- /cmd <command> — Befehl ausfuehren\n- /file <path> — Datei lesen\n- /password — Password Manager oeffnen\n- /new — Neue Sitzung\n- /clear — Sitzung leeren\n- /settings — Einstellungen", Date.now(), true);
    } else if (command === "/skills") {
      switchView("skills");
    } else if (command === "/memory") {
      switchView("memory");
    } else if (command === "/password") {
      switchView("passwords");
    } else if (command === "/settings") {
      switchView("settings");
    } else if (command === "/new") {
      newSession();
    } else if (command === "/clear") {
      clearCurrentSession();
    } else if (command === "/agent") {
      var task = text.substring(command.length).trim();
      if (task) {
        $("agentTaskInput").value = task;
        openModal("agentModalBackdrop", "agentModal");
      } else {
        openModal("agentModalBackdrop", "agentModal");
      }
    } else if (command === "/vision") {
      var imagePath = text.substring(command.length).trim();
      if (imagePath) {
        appendMessage("user", "/vision " + imagePath, Date.now(), true);
        analyzeImageInternal(imagePath);
      } else {
        appendMessage("assistant", "Bitte Bilddatei angeben: /vision /pfad/zum/bild.jpg", Date.now(), true);
      }
    } else if (command === "/cmd") {
      var cmd = text.substring(command.length).trim();
      if (cmd) {
        appendMessage("user", "/cmd " + cmd, Date.now(), true);
        showChatActivity("Fuehre Befehl aus...");
        callBackend("execute_command", { command: cmd }).then(function(result) {
          hideChatActivity();
          var res = typeof result === "string" ? result : JSON.stringify(result, null, 2);
          appendMessage("assistant", "Befehl ausgefuehrt:\n\n```\n" + res + "\n```", Date.now(), true);
          callBackend("memory_add_immediate", { key: "cmd_result_" + Date.now(), value: "Befehl: " + cmd + " -> " + res.substring(0, 200), tags: ["command", "result"] }).catch(function() {});
          callBackend("log_activity", { activityType: "command", message: cmd , timestamp: String(Date.now()) }).catch(function() {});
        }).catch(function(err) {
          hideChatActivity();
          appendMessage("assistant", "Befehl-Fehler: " + err, Date.now(), true);
        });
      }
    } else if (command === "/file") {
      var filePath = text.substring(command.length).trim();
      if (filePath) {
        appendMessage("user", "/file " + filePath, Date.now(), true);
        showChatActivity("Lese Datei...");
        callBackend("read_file", { path: filePath }).then(function(content) {
          hideChatActivity();
          var truncated = content.length > 5000 ? content.substring(0, 5000) + "\n... (gekuerzt)" : content;
          appendMessage("assistant", "Datei: " + filePath + "\n\n```\n" + truncated + "\n```", Date.now(), true);
          callBackend("memory_add_immediate", { key: "file_read_" + Date.now(), value: "Datei: " + filePath, tags: ["file", "read"] }).catch(function() {});
          callBackend("log_activity", { activityType: "file_read", message: filePath , timestamp: String(Date.now()) }).catch(function() {});
        }).catch(function(err) {
          hideChatActivity();
          appendMessage("assistant", "Datei-Fehler: " + err, Date.now(), true);
        });
      }
    } else {
      appendMessage("assistant", "Unbekannter Befehl: " + command + "\nTippe /help fuer alle Befehle.", Date.now(), true);
    }
  }

  function newSession() {
    callBackend("memory_create_session", { name: "" }).then(function(sid) {
      settings.currentSession = sid;
      setSetting(STORAGE_KEYS.currentSession, sid);
      chatHistory[sid] = [];
      renderChatMessages();
      updateSessionSelect();
    }).catch(function() {
      settings.currentSession = generateId();
      setSetting(STORAGE_KEYS.currentSession, settings.currentSession);
      chatHistory[settings.currentSession] = [];
      renderChatMessages();
    });
  }

  function clearCurrentSession() {
    var sid = settings.currentSession;
    if (!sid) return;
    chatHistory[sid] = [];
    renderChatMessages();
    callBackend("memory_delete_session", { sessionId: sid }).then(function() { newSession(); }).catch(function() {});
  }

  function selectSession(sid) {
    if (!sid) { newSession(); return; }
    settings.currentSession = sid;
    setSetting(STORAGE_KEYS.currentSession, sid);
    loadMessagesForSession(sid);
  }

  // --- CHAT SETUP ---
  function setupChat() {
    var input = $("chatInput");
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    input.addEventListener("input", function() { autoResize(input); });
    $("sendBtn").addEventListener("click", sendMessage);
    $("newSessionBtn").addEventListener("click", newSession);
    $("sessionSelect").addEventListener("change", function() { selectSession(this.value); });
    setupFileDrop();
  }

  function autoResize(input) {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  // ============ MEMORY FBM FLOWFIELD SHADER ============
  var brainViewerInitialized = false;
  var brainGL = null;
  var brainProgram = null;
  var brainUniformLocation = {};
  var brainBuffer = null;
  var brainMouseX = 0.5;
  var brainMouseY = 0.5;
  var brainTargetMouseX = 0.5;
  var brainTargetMouseY = 0.5;
  var brainStartTime = performance.now();
  var brainAnimationId = null;
  var currentMemoryZone = "core";

  // Zone-Konfiguration (5 Zonen: 3-Tier Flow)
  var ZONE_CONFIG = {
    immediate: { name: "Immediate Memory", tier: "temporaer", color: 0xff9500, colorHex: "#ff9500", searchCmd: "memory_search_zone", deleteCmd: "memory_delete_from_zone", editCmd: "memory_edit_in_zone", addCmd: "memory_add_to_zone", zoneParam: "immediate" },
    shortterm: { name: "Short-Term Memory", tier: "uebergang", color: 0x00d4ff, colorHex: "#00d4ff", searchCmd: "memory_search_zone", deleteCmd: "memory_delete_from_zone", editCmd: "memory_edit_in_zone", addCmd: "memory_add_to_zone", zoneParam: "shortterm" },
    core: { name: "Core Memory", tier: "langzeit", color: 0x0071e3, colorHex: "#0071e3", searchCmd: "memory_search_core", deleteCmd: "memory_delete_core", editCmd: "memory_edit_core", addCmd: "memory_add_core", zoneParam: "core" },
    skills: { name: "Skills", tier: "langzeit", color: 0x30d158, colorHex: "#30d158", searchCmd: "memory_search_skills", deleteCmd: "memory_delete_skill", editCmd: "memory_edit_skill", addCmd: "memory_add_skill", zoneParam: "skills" },
    sensitive: { name: "Sensitive Data", tier: "langzeit", color: 0xb537f2, colorHex: "#b537f2", searchCmd: "memory_search_sensitive", deleteCmd: "memory_delete_sensitive", editCmd: "memory_edit_sensitive", addCmd: "memory_add_sensitive", zoneParam: "sensitive" }
  };

  // Zone-Tier fuer CSS-Klassen
  function zoneTierClass(zone) {
    return "zone-tier-" + zone;
  }

  // Bestimmt die naechste hoehere Zone im Flow
  function nextZoneInFlow(zone) {
    if (zone === "immediate") return "shortterm";
    if (zone === "shortterm") return "core";
    return null;
  }

  function setupMemoryView() {
    $("refreshMemoryBtn").addEventListener("click", function() {
      loadMemoryZone(currentMemoryZone);
      updateFlowStats();
      if (!brainViewerInitialized) initBrainViewer();
    });
    if ($("memoryFlowBtn")) {
      $("memoryFlowBtn").addEventListener("click", function() {
        callBackend("memory_flow", {}).then(function() {
          loadMemoryZone(currentMemoryZone);
          updateFlowStats();
        }).catch(function() {});
      });
    }
    $("memoryAddBtn").addEventListener("click", function() {
      openMemoryEditModal(null, currentMemoryZone);
    });
    $("memoryZoneSearch").addEventListener("input", function() {
      searchMemoryZone(currentMemoryZone, this.value);
    });
    // Zone-Tabs
    $$(".zone-tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        var zone = tab.getAttribute("data-zone");
        $$(".zone-tab").forEach(function(t) { t.classList.remove("active"); });
        tab.classList.add("active");
        loadMemoryZone(zone);
      });
    });
    // Floating zone labels — click to load zone
    $$(".zone-float").forEach(function(label) {
      label.addEventListener("click", function() {
        var zone = label.getAttribute("data-zone");
        if (zone) {
          $$(".zone-tab").forEach(function(t) { t.classList.remove("active"); });
          var tab = document.querySelector('.zone-tab[data-zone="' + zone + '"]');
          if (tab) tab.classList.add("active");
          loadMemoryZone(zone);
        }
      });
    });
  }

  // Flow-Status-Bar aktualisieren
  function updateFlowStats() {
    callBackend("memory_status", {}).then(function(result) {
      var status = {};
      try { status = typeof result === "string" ? JSON.parse(result) : result; } catch (e) {}
      var stats = $("memoryFlowStats");
      if (!stats) return;
      var imm = status.immediate || {};
      var st = status.shortterm || {};
      var core = status.core || {};
      var skills = status.skills || {};
      var sens = status.sensitive || {};
      stats.innerHTML =
        '<span class="flow-stat"><span class="flow-dot immediate"></span> Immediate: ' + (imm.count || 0) + '/' + (imm.max || 100) + '</span>' +
        '<span class="flow-arrow">&rarr;</span>' +
        '<span class="flow-stat"><span class="flow-dot shortterm"></span> Short-Term: ' + (st.count || 0) + '/' + (st.max || 500) + '</span>' +
        '<span class="flow-arrow">&rarr;</span>' +
        '<span class="flow-stat"><span class="flow-dot core"></span> Core: ' + (core.count || 0) + '</span>' +
        '<span class="flow-stat"><span class="flow-dot skills"></span> Skills: ' + (skills.count || 0) + '</span>' +
        '<span class="flow-stat"><span class="flow-dot sensitive"></span> Sensitiv: ' + (sens.count || 0) + '</span>';
    }).catch(function() {});
  }

  // --- WebGL FBM Flowfield Shader (Simplex Noise + Domain Warping) ---
  var BRAIN_VERT_SRC = [
    "attribute vec2 aPos;",
    "void main(){ gl_Position=vec4(aPos,0.0,1.0); }"
  ].join("\n");

  var BRAIN_FRAG_SRC = [
    "precision highp float;",
    "uniform float uTime;",
    "uniform vec2 uRes;",
    "uniform vec2 uMouse;",
    "",
    "vec3 mod289v3(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}",
    "vec2 mod289v2(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}",
    "vec3 permute(vec3 x){return mod289v3(((x*34.0)+1.0)*x);}",
    "float snoise(vec2 v){",
    "  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);",
    "  vec2 i=floor(v+dot(v,C.yy));",
    "  vec2 x0=v-i+dot(i,C.xx);",
    "  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);",
    "  vec4 x12=x0.xyxy+C.xxzz;",
    "  x12.xy-=i1;",
    "  i=mod289v2(i);",
    "  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));",
    "  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);",
    "  m=m*m; m=m*m;",
    "  vec3 x=2.0*fract(p*C.www)-1.0;",
    "  vec3 h=abs(x)-0.5;",
    "  vec3 ox=floor(x+0.5);",
    "  vec3 a0=x-ox;",
    "  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);",
    "  vec3 g;",
    "  g.x=a0.x*x0.x+h.x*x0.y;",
    "  g.yz=a0.yz*x12.xz+h.yz*x12.yw;",
    "  return 130.0*dot(m,g);",
    "}",
    "float fbm(vec2 p){",
    "  float v=0.0; float a=0.5;",
    "  for(int i=0;i<5;i++){ v+=a*snoise(p); p*=2.0; a*=0.5; }",
    "  return v;",
    "}",
    "",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/uRes;",
    "  vec2 p=uv;",
    "  p.x*=uRes.x/uRes.y;",
    "  float t=uTime*0.08;",
    "  vec2 q=vec2(fbm(p+vec2(0.0,t)),fbm(p+vec2(5.2,1.3)+t));",
    "  vec2 r=vec2(fbm(p+4.0*q+vec2(1.7,9.2)+t*0.5),fbm(p+4.0*q+vec2(8.3,2.8)+t*0.3));",
    "  float n=fbm(p+4.0*r);",
    "  float md=distance(uv,uMouse);",
    "  float mInf=smoothstep(0.5,0.0,md)*0.3;",
    "  vec3 col=vec3(0.06,0.065,0.055);",
    "  vec3 accent=vec3(0.184,0.718,0.647);",
    "  vec3 deep=vec3(0.10,0.24,0.22);",
    "  float flow=smoothstep(0.0,1.0,n+r.x*0.5);",
    "  col=mix(col,deep,flow*0.8);",
    "  float ridge=smoothstep(0.48,0.68,n+r.y);",
    "  col+=accent*ridge*1.1;",
    "  col+=accent*mInf*0.55;",
    "  float vig=smoothstep(1.0,0.45,distance(uv,vec2(0.5)));",
    "  col*=vig;",
    "  gl_FragColor=vec4(col,1.0);",
    "}"
  ].join("\n");

  function compileShader(gl, type, src) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function initBrainViewer() {
    if (brainViewerInitialized) return;
    var canvas = $("brainCanvas");
    if (!canvas) return;
    var wrap = $("brainCanvasWrap");
    var width = wrap.clientWidth;
    var height = wrap.clientHeight;
    if (width < 10 || height < 10) {
      setTimeout(initBrainViewer, 200);
      return;
    }

    try {
      brainGL = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!brainGL) {
        $("brainLoading").textContent = "WebGL nicht verfuegbar.";
        return;
      }

      var vs = compileShader(brainGL, brainGL.VERTEX_SHADER, BRAIN_VERT_SRC);
      var fs = compileShader(brainGL, brainGL.FRAGMENT_SHADER, BRAIN_FRAG_SRC);
      if (!vs || !fs) {
        $("brainLoading").textContent = "Shader-Fehler.";
        return;
      }

      brainProgram = brainGL.createProgram();
      brainGL.attachShader(brainProgram, vs);
      brainGL.attachShader(brainProgram, fs);
      brainGL.linkProgram(brainProgram);
      if (!brainGL.getProgramParameter(brainProgram, brainGL.LINK_STATUS)) {
        console.error("Program link error:", brainGL.getProgramInfoLog(brainProgram));
        $("brainLoading").textContent = "Program-Link-Fehler.";
        return;
      }
      brainGL.useProgram(brainProgram);

      // Fullscreen quad (two triangles)
      brainBuffer = brainGL.createBuffer();
      brainGL.bindBuffer(brainGL.ARRAY_BUFFER, brainBuffer);
      brainGL.bufferData(brainGL.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1,  -1, 1,
        -1,  1,  1, -1,   1, 1
      ]), brainGL.STATIC_DRAW);

      var aPos = brainGL.getAttribLocation(brainProgram, "aPos");
      brainGL.enableVertexAttribArray(aPos);
      brainGL.vertexAttribPointer(aPos, 2, brainGL.FLOAT, false, 0, 0);

      // Uniform locations
      brainUniformLocation.uTime = brainGL.getUniformLocation(brainProgram, "uTime");
      brainUniformLocation.uRes = brainGL.getUniformLocation(brainProgram, "uRes");
      brainUniformLocation.uMouse = brainGL.getUniformLocation(brainProgram, "uMouse");

      // Set canvas size
      onBrainResize();

      // Mouse tracking for shader glow
      canvas.addEventListener("mousemove", function(e) {
        var rect = canvas.getBoundingClientRect();
        brainTargetMouseX = (e.clientX - rect.left) / rect.width;
        brainTargetMouseY = 1.0 - (e.clientY - rect.top) / rect.height;
      });
      canvas.addEventListener("touchmove", function(e) {
        if (!e.touches[0]) return;
        var rect = canvas.getBoundingClientRect();
        brainTargetMouseX = (e.touches[0].clientX - rect.left) / rect.width;
        brainTargetMouseY = 1.0 - (e.touches[0].clientY - rect.top) / rect.height;
      });

      brainViewerInitialized = true;
      $("brainLoading").style.display = "none";
      brainStartTime = performance.now();
      animateBrain();
    } catch (e) {
      $("brainLoading").textContent = "Fehler beim Initialisieren: " + e.message;
    }
  }

  function animateBrain() {
    brainAnimationId = requestAnimationFrame(animateBrain);
    if (!brainGL || !brainProgram) return;

    // Smooth mouse interpolation
    brainMouseX += (brainTargetMouseX - brainMouseX) * 0.05;
    brainMouseY += (brainTargetMouseY - brainMouseY) * 0.05;

    var time = (performance.now() - brainStartTime) / 1000.0;

    brainGL.useProgram(brainProgram);
    brainGL.uniform1f(brainUniformLocation.uTime, time);
    brainGL.uniform2f(brainUniformLocation.uRes, brainGL.canvas.width, brainGL.canvas.height);
    brainGL.uniform2f(brainUniformLocation.uMouse, brainMouseX, brainMouseY);

    brainGL.drawArrays(brainGL.TRIANGLES, 0, 6);
  }

  function onBrainResize() {
    var wrap = $("brainCanvasWrap");
    if (!wrap || !brainGL) return;
    var w = wrap.clientWidth;
    var h = wrap.clientHeight;
    if (w < 10 || h < 10) return;
    var canvas = $("brainCanvas");
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    brainGL.viewport(0, 0, canvas.width, canvas.height);
  }


  // --- REUSABLE WAVE BACKGROUND SHADER (FBM flowfield for UI panels) ---
  // Same GLSL as the brain shader but lightweight (0.5x resolution multiplier)
  // and with a global alpha / canvas opacity so it reads as a subtle texture.
  var waveBgState = []; // [{canvas, gl, program, uniforms, animId, startTime, ro}]

  function initWaveBackground(canvasId, opacity) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    // Avoid double-init on the same canvas
    for (var i = 0; i < waveBgState.length; i++) {
      if (waveBgState[i].canvas === canvas) return waveBgState[i].animId;
    }

    var gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false, depth: false })
         || canvas.getContext("experimental-webgl", { alpha: true, premultipliedAlpha: false, antialias: false, depth: false });
    if (!gl) { console.warn("initWaveBackground: WebGL not available for", canvasId); return null; }

    var vs = compileShader(gl, gl.VERTEX_SHADER, BRAIN_VERT_SRC);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, BRAIN_FRAG_SRC);
    if (!vs || !fs) { console.warn("initWaveBackground: shader compile failed for", canvasId); return null; }

    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("initWaveBackground: program link failed for", canvasId, gl.getProgramInfoLog(program));
      return null;
    }
    gl.useProgram(program);

    // Fullscreen quad
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1
    ]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var uniforms = {
      uTime: gl.getUniformLocation(program, "uTime"),
      uRes: gl.getUniformLocation(program, "uRes"),
      uMouse: gl.getUniformLocation(program, "uMouse")
    };

    var entry = {
      canvas: canvas,
      gl: gl,
      program: program,
      uniforms: uniforms,
      animId: null,
      startTime: performance.now(),
      ro: null
    };

    function resize() {
      var w = canvas.clientWidth || canvas.parentElement.clientWidth;
      var h = canvas.clientHeight || canvas.parentElement.clientHeight;
      if (w < 2 || h < 2) return;
      var dpr = window.devicePixelRatio || 1;
      // Lightweight: 0.5x resolution multiplier for performance
      var cw = Math.max(1, Math.floor(w * 0.5 * dpr));
      var ch = Math.max(1, Math.floor(h * 0.5 * dpr));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    resize();

    // ResizeObserver for responsive resize
    if (window.ResizeObserver) {
      entry.ro = new ResizeObserver(function() { resize(); });
      entry.ro.observe(canvas.parentElement || canvas);
    }
    window.addEventListener("resize", resize);

    // Apply opacity via canvas style (clearColor handles alpha too)
    canvas.style.opacity = String(opacity);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    function animate() {
      entry.animId = requestAnimationFrame(animate);
      if (!gl || !program) return;
      var time = (performance.now() - entry.startTime) / 1000.0;
      gl.useProgram(program);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
      gl.uniform2f(uniforms.uMouse, 0.5, 0.5); // centered, static for backgrounds
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    animate();

    waveBgState.push(entry);
    return entry.animId;
  }

  // --- MEMORY ZONE LIST ---
  function loadMemoryZone(zone) {
    currentMemoryZone = zone;
    var zc = ZONE_CONFIG[zone];
    if (!zc) return;
    $("zonePanelTitle").textContent = zc.name;
    $("memoryAddBtn").style.display = "inline-flex";
    // Active Tab sync
    $$(".zone-tab").forEach(function(t) {
      if (t.getAttribute("data-zone") === zone) t.classList.add("active");
      else t.classList.remove("active");
    });
    updateFlowStats();
    var list = $("memoryZoneList");
    list.innerHTML = '<div class="empty-state"><p>Lade ' + zc.name + '...</p></div>';
    var searchArgs = zc.zoneParam ? { zone: zc.zoneParam, query: "" } : { query: "" };
    callBackend(zc.searchCmd, searchArgs).then(function(result) {
      var entries = [];
      try { entries = typeof result === "string" ? JSON.parse(result) : result; } catch (e) {}
      if (!Array.isArray(entries)) entries = [];
      renderMemoryZoneEntries(entries, zone);
    }).catch(function() {
      // Fallback: memory_get_zone
      callBackend("memory_get_zone", { zone: zone }).then(function(result) {
        var entries = [];
        try { entries = typeof result === "string" ? JSON.parse(result) : result; } catch (e) {}
        if (!Array.isArray(entries)) entries = [];
        renderMemoryZoneEntries(entries, zone);
      }).catch(function() {
        list.innerHTML = '<div class="empty-state"><p>' + zc.name + ' nicht verfuegbar.</p></div>';
      });
    });
  }

  function searchMemoryZone(zone, query) {
    var zc = ZONE_CONFIG[zone];
    if (!zc) return;
    var searchArgs = zc.zoneParam ? { zone: zc.zoneParam, query: query } : { query: query };
    callBackend(zc.searchCmd, searchArgs).then(function(result) {
      var entries = [];
      try { entries = typeof result === "string" ? JSON.parse(result) : result; } catch (e) {}
      if (!Array.isArray(entries)) entries = [];
      renderMemoryZoneEntries(entries, zone);
    }).catch(function() {
      callBackend("memory_get_zone", { zone: zone }).then(function(result) {
        var entries = [];
        try { entries = typeof result === "string" ? JSON.parse(result) : result; } catch (e) {}
        if (!Array.isArray(entries)) entries = [];
        if (query) {
          var q = query.toLowerCase();
          entries = entries.filter(function(e) {
            return (e.key || e.title || "").toLowerCase().indexOf(q) >= 0 ||
                   (e.value || "").toLowerCase().indexOf(q) >= 0;
          });
        }
        renderMemoryZoneEntries(entries, zone);
      }).catch(function() {});
    });
  }

  function renderMemoryZoneEntries(entries, zone) {
    var list = $("memoryZoneList");
    if (entries.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>Keine Eintraege in dieser Zone.</p></div>';
      return;
    }
    list.innerHTML = "";
    entries.forEach(function(entry) {
      var item = document.createElement("div");
      item.className = "memory-zone-item " + zoneTierClass(zone);
      var key = entry.key || entry.title || entry.id || "Eintrag";
      var value = entry.value || entry.content || "";
      var truncated = value.length > 200 ? value.substring(0, 200) + "..." : value;
      var ts = entry.timestamp ? new Date(entry.timestamp * 1000).toLocaleString("de-DE") : "";
      var tags = entry.tags || [];
      var tagsHtml = "";
      if (Array.isArray(tags)) {
        tags.forEach(function(t) { tagsHtml += '<span class="mz-item-tag">' + escapeHtml(t) + '</span>'; });
      }
      var id = entry.id || entry.key || "";
      var refs = entry.references || 0;
      var promoteHtml = "";
      var nextZ = nextZoneInFlow(zone);
      if (nextZ) {
        var nextLabel = nextZ === "shortterm" ? "→ Short-Term" : "→ Long-Term";
        promoteHtml = '<button class="mz-promote-btn" data-id="' + escapeHtml(id) + '" data-from="' + zone + '" data-to="' + nextZ + '" title="Befoerdern">' + nextLabel + '</button>';
      } else if (zone === "core" || zone === "skills") {
        promoteHtml = '<button class="mz-promote-btn" data-id="' + escapeHtml(id) + '" data-from="' + zone + '" data-to="sensitive" title="Als sensitiv markieren">→ Sensitiv</button>';
      }
      item.innerHTML =
        '<div class="mz-item-header">' +
          '<span class="mz-item-key">' + escapeHtml(key) + '</span>' +
          '<div class="mz-item-actions">' +
            promoteHtml +
            '<button class="mz-action-btn edit" data-id="' + escapeHtml(id) + '" title="Bearbeiten">✏️</button>' +
            '<button class="mz-action-btn delete" data-id="' + escapeHtml(id) + '" title="Loeschen">🗑</button>' +
          '</div>' +
        '</div>' +
        '<div class="mz-item-value">' + escapeHtml(truncated) + '</div>' +
        '<div class="mz-item-meta">' +
          (ts ? '<span>' + ts + '</span>' : "") +
          (refs > 0 ? '<span class="mz-item-refs">Refs: ' + refs + '</span>' : "") +
          tagsHtml +
        '</div>';
      list.appendChild(item);
    });

    // Edit/Delete Buttons
    list.querySelectorAll(".mz-action-btn.edit").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var id = btn.getAttribute("data-id");
        var entry = entries.find(function(e) { return (e.id || e.key) === id; });
        if (entry) openMemoryEditModal(entry, zone);
      });
    });
    list.querySelectorAll(".mz-action-btn.delete").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var id = btn.getAttribute("data-id");
        var zc = ZONE_CONFIG[zone];
        if (!zc) return;
        showConfirm("Loeschen", "Eintrag wirklich loeschen?", function() {
          var delArgs = zc.zoneParam ? { zone: zc.zoneParam, key: id } : { entryId: id };
          callBackend(zc.deleteCmd, delArgs).then(function() {
            loadMemoryZone(zone);
            updateFlowStats();
          }).catch(function() {});
          closeModal("confirmBackdrop", "confirmModal");
        });
      });
    });

    // Promote Buttons
    list.querySelectorAll(".mz-promote-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var entryId = btn.getAttribute("data-id");
        var fromZone = btn.getAttribute("data-from");
        var toZone = btn.getAttribute("data-to");
        callBackend("memory_promote", { entryId: entryId, fromZone: fromZone, toZone: toZone }).then(function() {
          loadMemoryZone(currentMemoryZone);
          updateFlowStats();
        }).catch(function(err) {
          alert("Promote fehlgeschlagen: " + err);
        });
      });
    });
  }

  // --- MEMORY EDIT MODAL ---
  var memoryEditZone = "core";
  var memoryEditId = null;

  function setupMemoryEditModal() {
    $("memoryEditClose").addEventListener("click", function() { closeModal("memoryEditBackdrop", "memoryEditModal"); });
    $("memoryEditBackdrop").addEventListener("click", function() { closeModal("memoryEditBackdrop", "memoryEditModal"); });
    $("memoryEditCancel").addEventListener("click", function() { closeModal("memoryEditBackdrop", "memoryEditModal"); });
    $("memoryEditSave").addEventListener("click", function() {
      var key = $("memoryEditKey").value.trim();
      var value = $("memoryEditValue").value.trim();
      var tags = $("memoryEditTags").value.trim();
      if (!key || !value) return;
      var zc = ZONE_CONFIG[memoryEditZone];
      if (!zc) return;
      var tagArr = tags ? tags.split(",").map(function(t) { return t.trim(); }).filter(Boolean) : [];
      var cmd = memoryEditId ? zc.editCmd : zc.addCmd;
      var args;
      if (memoryEditZone === "sensitive" && memoryEditId) {
        args = { entryId: memoryEditId, fields: JSON.stringify({ title: key, value: value, tags: tagArr }) };
      } else if (memoryEditZone === "sensitive" && !memoryEditId) {
        args = { entryType: "general", title: key, username: "", value: value, url: "", email: "", group: "Sonstige", tags: tagArr };
      } else {
        args = { key: key, value: value, tags: tagArr };
        if (zc.zoneParam) args.zone = zc.zoneParam;
        if (memoryEditId) args.entryId = memoryEditId;
        if (memoryEditZone === "core" && !memoryEditId) args.entryType = "general";
      }
      callBackend(cmd, args).then(function() {
        closeModal("memoryEditBackdrop", "memoryEditModal");
        loadMemoryZone(memoryEditZone);
        updateFlowStats();
      }).catch(function(err) {
        alert("Fehler beim Speichern: " + err);
      });
    });
  }

  function openMemoryEditModal(entry, zone) {
    memoryEditZone = zone;
    memoryEditId = entry ? (entry.id || entry.key) : null;
    $("memoryEditTitle").textContent = entry ? "Eintrag bearbeiten" : "Neuer Eintrag";
    $("memoryEditKey").value = entry ? (entry.key || entry.title || "") : "";
    $("memoryEditValue").value = entry ? (entry.value || entry.content || "") : "";
    var tags = entry && entry.tags ? (Array.isArray(entry.tags) ? entry.tags.join(", ") : entry.tags) : "";
    $("memoryEditTags").value = tags;
    openModal("memoryEditBackdrop", "memoryEditModal");
  }

  // ============ SKILL HUB ============
  function setupSkillsView() {
    $("skillsSearch").addEventListener("input", function() {
      loadSkills(this.value);
    });
    $("skillsCategoryFilter").addEventListener("change", function() {
      loadSkills($("skillsSearch").value, this.value);
    });
    $("customSkillBtn").addEventListener("click", function() {
      // Custom Skill Dialog
      var name = prompt("Skill-Name:");
      if (!name) return;
      var desc = prompt("Beschreibung:") || "";
      var cmd = prompt("Command Template (z.B. echo {param1}):") || "";
      callBackend("add_custom_skill", { name: name, description: desc, command: cmd }).then(function() {
        loadSkills();
      }).catch(function(err) {
        alert("Fehler: " + err);
      });
    });
  }

  function loadSkills(filter, category) {
    var grid = $("skillsGrid");
    if (!grid) return;
    grid.innerHTML = '<div class="empty-state"><p>Lade Skills...</p></div>';
    callBackend("list_skills", {}).then(function(result) {
      var skills = [];
      try { skills = typeof result === "string" ? JSON.parse(result) : result; } catch (e) {}
      if (!Array.isArray(skills)) skills = [];
      renderSkills(skills, filter || "", category || "");
    }).catch(function() {
      // Fallback: alte API
      callBackend("skills_list", {}).then(function(result) {
        var skills = [];
        try { skills = typeof result === "string" ? JSON.parse(result) : result; } catch (e) {}
        if (!Array.isArray(skills)) skills = [];
        renderSkills(skills, filter || "", category || "");
      }).catch(function() {
        grid.innerHTML = '<div class="empty-state"><p>Skills nicht verfuegbar.</p></div>';
      });
    });
  }

  function renderSkills(skills, filter, category) {
    var grid = $("skillsGrid");
    var count = $("skillsCount");
    var filtered = skills;
    if (filter) {
      var f = filter.toLowerCase();
      filtered = filtered.filter(function(s) {
        return (s.name || "").toLowerCase().indexOf(f) >= 0 ||
               (s.description || "").toLowerCase().indexOf(f) >= 0 ||
               (s.category || "").toLowerCase().indexOf(f) >= 0;
      });
    }
    if (category) {
      filtered = filtered.filter(function(s) { return (s.category || "") === category; });
    }
    count.textContent = filtered.length;
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>Keine Skills gefunden.</p></div>';
      return;
    }
    grid.innerHTML = "";
    filtered.forEach(function(s) {
      var card = document.createElement("div");
      card.className = "skill-card";
      var sysBadge = s.requires_system ? '<span class="skill-badge-sys">System</span>' : "";
      var icon = s.icon || "🔧";
      card.innerHTML =
        '<div class="skill-name">' + icon + " " + escapeHtml(s.name || "") + " " + sysBadge + '</div>' +
        '<div class="skill-desc">' + escapeHtml(s.description || "") + '</div>' +
        '<span class="skill-category">' + escapeHtml(s.category || "Utilities") + '</span>';
      card.addEventListener("click", function() { openSkillModal(s); });
      grid.appendChild(card);
    });
  }

  // --- SKILL MODAL ---
  var currentSkill = null;

  function setupSkillModal() {
    $("skillModalClose").addEventListener("click", function() { closeModal("skillModalBackdrop", "skillModal"); });
    $("skillModalBackdrop").addEventListener("click", function() { closeModal("skillModalBackdrop", "skillModal"); });
    $("skillExecuteBtn").addEventListener("click", function() {
      if (!currentSkill) return;
      var params = {};
      var paramInputs = $("skillModalParams").querySelectorAll("input, textarea, select");
      paramInputs.forEach(function(inp) {
        params[inp.getAttribute("data-param")] = inp.value;
      });
      $("skillExecuteBtn").disabled = true;
      $("skillExecuteBtn").textContent = "Fuehre aus...";
      callBackend("execute_skill", { skillName: currentSkill.name, args: params }).then(function(result) {
        $("skillExecuteBtn").disabled = false;
        $("skillExecuteBtn").textContent = "Ausfuehren";
        $("skillResultArea").style.display = "block";
        var res = result;
        if (typeof result === "object") {
          res = "Exit-Code: " + (result.exit_code || 0) + "\n\nSTDOUT:\n" + (result.stdout || "") + "\n\nSTDERR:\n" + (result.stderr || "");
        }
        $("skillResultBox").textContent = res;
        $("skillToChatBtn").style.display = "inline-flex";
        $("skillToChatBtn").setAttribute("data-result", encodeURIComponent(res));
      }).catch(function(err) {
        $("skillExecuteBtn").disabled = false;
        $("skillExecuteBtn").textContent = "Ausfuehren";
        $("skillResultArea").style.display = "block";
        $("skillResultBox").textContent = "Fehler: " + err;
      });
    });
    $("skillToChatBtn").addEventListener("click", function() {
      var result = decodeURIComponent($("skillToChatBtn").getAttribute("data-result") || "");
      closeModal("skillModalBackdrop", "skillModal");
      switchView("chat");
      appendMessage("user", "Skill-Ergebnis:", Date.now(), true);
      appendMessage("titan", "```\n" + result + "\n```", Date.now(), true);
    });
  }

  function openSkillModal(skill) {
    currentSkill = skill;
    $("skillModalTitle").textContent = skill.name || "Skill";
    $("skillModalDesc").textContent = skill.description || "";
    $("skillResultArea").style.display = "none";
    $("skillToChatBtn").style.display = "none";

    // Parameter-Inputs generieren
    var paramsContainer = $("skillModalParams");
    paramsContainer.innerHTML = "";
    var params = skill.parameters || skill.params || [];
    if (Array.isArray(params) && params.length > 0) {
      params.forEach(function(p) {
        var grp = document.createElement("div");
        grp.className = "form-group";
        var label = document.createElement("label");
        label.textContent = p.name || p;
        grp.appendChild(label);
        var inp = document.createElement("input");
        inp.type = "text";
        inp.setAttribute("data-param", p.name || p);
        inp.placeholder = p.description || p.placeholder || "";
        grp.appendChild(inp);
        paramsContainer.appendChild(grp);
      });
    }
    openModal("skillModalBackdrop", "skillModal");
  }

  // ============ PASSWORD MANAGER ============
  var pwCurrentGroup = "";
  var pwAllEntries = [];

  function setupPasswordManager() {
    $("pwSearch").addEventListener("input", function() { renderPasswords(this.value); });
    $("pwExportBtn").addEventListener("click", exportPasswords);
    $("pwImportBtn").addEventListener("click", function() { $("pwImportInput").click(); });
    $("pwImportInput").addEventListener("change", function() {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        var content = e.target.result;
        callBackend("password_manager_import", { data: content, format: file.name.endsWith(".csv") ? "csv" : "json" }).then(function() {
          loadPasswords();
        }).catch(function(err) { alert("Import-Fehler: " + err); });
      };
      reader.readAsText(file);
      this.value = "";
    });
    $("pwAddBtn").addEventListener("click", function() { openPwEditModal(null); });

    // Tabs
    $$(".pw-tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        $$(".pw-tab").forEach(function(t) { t.classList.remove("active"); });
        tab.classList.add("active");
        pwCurrentGroup = tab.getAttribute("data-group");
        renderPasswords($("pwSearch").value);
      });
    });
  }

  function loadPasswords() {
    var list = $("pwList");
    list.innerHTML = '<div class="empty-state"><p>Lade Passwort-Manager...</p></div>';
    callBackend("password_manager_list", {}).then(function(result) {
      try {
        pwAllEntries = typeof result === "string" ? JSON.parse(result) : result;
      } catch (e) { pwAllEntries = []; }
      if (!Array.isArray(pwAllEntries)) pwAllEntries = [];
      renderPasswords($("pwSearch").value);
    }).catch(function() {
      // Fallback: memory_get_zone sensitive
      callBackend("memory_get_zone", { zone: "sensitive" }).then(function(result) {
        try { pwAllEntries = typeof result === "string" ? JSON.parse(result) : result; } catch (e) { pwAllEntries = []; }
        if (!Array.isArray(pwAllEntries)) pwAllEntries = [];
        renderPasswords($("pwSearch").value);
      }).catch(function() {
        list.innerHTML = '<div class="empty-state"><p>Passwort-Manager nicht verfuegbar.</p></div>';
      });
    });
  }

  function renderPasswords(searchQuery) {
    var list = $("pwList");
    var entries = pwAllEntries;
    // Gruppe filtern
    if (pwCurrentGroup) {
      entries = entries.filter(function(e) { return (e.group || e.category || "") === pwCurrentGroup; });
    }
    // Suche
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      entries = entries.filter(function(e) {
        return (e.title || e.key || "").toLowerCase().indexOf(q) >= 0 ||
               (e.username || "").toLowerCase().indexOf(q) >= 0 ||
               (e.url || "").toLowerCase().indexOf(q) >= 0 ||
               (e.email || "").toLowerCase().indexOf(q) >= 0;
      });
    }

    if (entries.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>Keine Eintraege gefunden.</p></div>';
      return;
    }

    list.innerHTML = "";
    entries.forEach(function(entry) {
      var item = document.createElement("div");
      item.className = "pw-item";
      var id = entry.id || entry.key || "";
      var title = entry.title || entry.key || "Eintrag";
      var username = entry.username || "";
      var url = entry.url || "";
      var email = entry.email || "";
      var group = entry.group || entry.category || "Sonstiges";
      var links = entry.links || [];
      var revealed = false;

      item.innerHTML =
        '<div class="pw-item-header">' +
          '<span class="pw-item-title">' + escapeHtml(title) + '</span>' +
          '<span class="pw-item-group">' + escapeHtml(group) + '</span>' +
        '</div>' +
        '<div class="pw-item-fields">' +
          (username ? '<div class="pw-field"><span class="pw-field-label">Username</span><span class="pw-field-value">' + escapeHtml(username) + '</span></div>' : "") +
          '<div class="pw-field"><span class="pw-field-label">Wert</span><span class="pw-field-value masked" data-id="' + escapeHtml(id) + '">••••••••</span></div>' +
          (url ? '<div class="pw-field"><span class="pw-field-label">URL</span><span class="pw-field-value">' + escapeHtml(url) + '</span></div>' : "") +
          (email ? '<div class="pw-field"><span class="pw-field-label">E-Mail</span><span class="pw-field-value">' + escapeHtml(email) + '</span></div>' : "") +
        '</div>' +
        (links && links.length > 0 ? '<div class="pw-item-links">' + links.map(function(l) { return '<span class="pw-link-badge">' + escapeHtml(l) + '</span>'; }).join("") + '</div>' : "") +
        '<div class="pw-item-actions">' +
          '<button class="pw-action-btn show" data-id="' + escapeHtml(id) + '">Anzeigen</button>' +
          '<button class="pw-action-btn copy" data-id="' + escapeHtml(id) + '">Kopieren</button>' +
          '<button class="pw-action-btn edit" data-id="' + escapeHtml(id) + '">Bearbeiten</button>' +
          '<button class="pw-action-btn delete" data-id="' + escapeHtml(id) + '">Loeschen</button>' +
        '</div>';

      list.appendChild(item);
    });

    // Event-Listener
    list.querySelectorAll(".pw-action-btn.show").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var id = btn.getAttribute("data-id");
        var entry = entries.find(function(e) { return (e.id || e.key) === id; });
        if (!entry) return;
        var valueField = btn.closest(".pw-item").querySelector(".pw-field-value.masked");
        if (btn.textContent === "Anzeigen") {
          // Wert entschluesseln/anzeigen
          callBackend("password_manager_search", { query: entry.title || entry.key || "" }).then(function(result) {
            var found = null;
            try {
              var resArr = typeof result === "string" ? JSON.parse(result) : result;
              if (Array.isArray(resArr)) {
                found = resArr.find(function(e) { return (e.id || e.key) === id; });
              }
            } catch (e) {}
            var value = (found && found.value) ? found.value : (entry.value || "Nicht verfuegbar");
            valueField.classList.remove("masked");
            valueField.textContent = value;
            btn.textContent = "Verbergen";
          }).catch(function() {
            var value = entry.value || "Nicht verfuegbar";
            valueField.classList.remove("masked");
            valueField.textContent = value;
            btn.textContent = "Verbergen";
          });
        } else {
          valueField.classList.add("masked");
          valueField.textContent = "••••••••";
          btn.textContent = "Anzeigen";
        }
      });
    });

    list.querySelectorAll(".pw-action-btn.copy").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var id = btn.getAttribute("data-id");
        var entry = entries.find(function(e) { return (e.id || e.key) === id; });
        if (!entry) return;
        callBackend("password_manager_search", { query: entry.title || entry.key || "" }).then(function(result) {
          var found = null;
          try {
            var resArr = typeof result === "string" ? JSON.parse(result) : result;
            if (Array.isArray(resArr)) found = resArr.find(function(e) { return (e.id || e.key) === id; });
          } catch (e) {}
          var value = (found && found.value) ? found.value : (entry.value || "");
          callBackend("clipboard_write", { text: value }).then(function() {
            btn.textContent = "Kopiert!";
            setTimeout(function() { btn.textContent = "Kopieren"; }, 2000);
          }).catch(function() {
            navigator.clipboard.writeText(value).then(function() {
              btn.textContent = "Kopiert!";
              setTimeout(function() { btn.textContent = "Kopieren"; }, 2000);
            });
          });
        }).catch(function() {
          var value = entry.value || "";
          navigator.clipboard.writeText(value).then(function() {
            btn.textContent = "Kopiert!";
            setTimeout(function() { btn.textContent = "Kopieren"; }, 2000);
          });
        });
      });
    });

    list.querySelectorAll(".pw-action-btn.edit").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var id = btn.getAttribute("data-id");
        var entry = entries.find(function(e) { return (e.id || e.key) === id; });
        if (entry) openPwEditModal(entry);
      });
    });

    list.querySelectorAll(".pw-action-btn.delete").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var id = btn.getAttribute("data-id");
        var entry = entries.find(function(e) { return (e.id || e.key) === id; });
        var title = entry ? (entry.title || entry.key) : id;
        showConfirm("Loeschen", "Eintrag \"" + title + "\" wirklich loeschen?", function() {
          callBackend("password_manager_delete", { id: id }).then(function() {
            loadPasswords();
          }).catch(function() {
            callBackend("memory_delete_sensitive", { entryId: id }).then(function() { loadPasswords(); }).catch(function() {});
          });
          closeModal("confirmBackdrop", "confirmModal");
        });
      });
    });
  }

  function exportPasswords() {
    callBackend("password_manager_export", {}).then(function(result) {
      var data = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      var blob = new Blob([data], {type: "application/json"});
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "titan-toti-passwords-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(url);
    }).catch(function(err) {
      // Fallback: manuell exportieren
      var blob = new Blob([JSON.stringify(pwAllEntries, null, 2)], {type: "application/json"});
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "titan-toti-passwords-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // --- PW EDIT MODAL ---
  var pwEditId = null;

  function setupPwEditModal() {
    $("pwEditClose").addEventListener("click", function() { closeModal("pwEditBackdrop", "pwEditModal"); });
    $("pwEditBackdrop").addEventListener("click", function() { closeModal("pwEditBackdrop", "pwEditModal"); });
    $("pwEditCancel").addEventListener("click", function() { closeModal("pwEditBackdrop", "pwEditModal"); });
    $("pwEditSave").addEventListener("click", function() {
      var data = {
        title: $("pwEditTitleField").value.trim(),
        username: $("pwEditUsername").value.trim(),
        value: $("pwEditValue").value.trim(),
        url: $("pwEditUrl").value.trim(),
        email: $("pwEditEmail").value.trim(),
        group: $("pwEditGroup").value,
        notes: $("pwEditNotes").value.trim()
      };
      if (!data.title || !data.value) {
        alert("Titel und Wert sind Pflichtfelder.");
        return;
      }
      if (pwEditId) {
        data.id = pwEditId;
        callBackend("password_manager_edit", data).then(function() {
          closeModal("pwEditBackdrop", "pwEditModal");
          loadPasswords();
        }).catch(function() {
          // Fallback: memory_edit_sensitive
          callBackend("memory_edit_sensitive", { entryId: pwEditId, fields: JSON.stringify(data) }).then(function() {
            closeModal("pwEditBackdrop", "pwEditModal");
            loadPasswords();
          }).catch(function(err) { alert("Fehler: " + err); });
        });
      } else {
        callBackend("password_manager_add", data).then(function() {
          closeModal("pwEditBackdrop", "pwEditModal");
          loadPasswords();
        }).catch(function() {
          // Fallback
          callBackend("memory_add_sensitive", { entryType: "password", title: data.title, username: data.username || "", value: data.value, url: data.url || "", email: data.email || "", group: data.group || "Passwoerter", tags: [] }).then(function() {
            closeModal("pwEditBackdrop", "pwEditModal");
            loadPasswords();
          }).catch(function(err) { alert("Fehler: " + err); });
        });
      }
    });
  }

  function openPwEditModal(entry) {
    pwEditId = entry ? (entry.id || entry.key) : null;
    $("pwEditTitle").textContent = entry ? "Eintrag bearbeiten" : "Neuer Eintrag";
    $("pwEditTitleField").value = entry ? (entry.title || entry.key || "") : "";
    $("pwEditUsername").value = entry ? (entry.username || "") : "";
    $("pwEditValue").value = entry ? (entry.value || "") : "";
    $("pwEditUrl").value = entry ? (entry.url || "") : "";
    $("pwEditEmail").value = entry ? (entry.email || "") : "";
    $("pwEditGroup").value = entry ? (entry.group || entry.category || "Passwoerter") : "Passwoerter";
    $("pwEditNotes").value = entry ? (entry.notes || "") : "";
    openModal("pwEditBackdrop", "pwEditModal");
  }

  // ============ AGENT MODAL ============
  function setupAgentModal() {
    $("agentModalClose").addEventListener("click", function() { closeModal("agentModalBackdrop", "agentModal"); });
    $("agentModalBackdrop").addEventListener("click", function() { closeModal("agentModalBackdrop", "agentModal"); });
    $("agentCancelBtn").addEventListener("click", function() { closeModal("agentModalBackdrop", "agentModal"); });
    $("agentStartBtn").addEventListener("click", function() {
      var task = $("agentTaskInput").value.trim();
      if (!task) return;
      var model = $("agentModelInput").value.trim() || null;
      callBackend("spawn_agent", { task: task, context: "" }).then(function(result) {
        var agentId = typeof result === "string" ? result : (result && result.id ? result.id : "unknown");
        appendMessage("titan", "Agent gestartet (ID: " + agentId + ")\nAufgabe: " + task, Date.now(), true);
        callBackend("log_activity", { activityType: "agent_started", message: task.substring(0, 80) , timestamp: String(Date.now()) }).catch(function() {});
        closeModal("agentModalBackdrop", "agentModal");
        $("agentTaskInput").value = "";
        $("agentModelInput").value = "";
        updateAgentStatus();
      }).catch(function(err) {
        alert("Agent-Fehler: " + err);
      });
    });
  }

  // --- CONFIRM DIALOG ---
  function setupConfirmDialog() {
    $("confirmNoBtn").addEventListener("click", function() { closeModal("confirmBackdrop", "confirmModal"); });
    $("confirmBackdrop").addEventListener("click", function() { closeModal("confirmBackdrop", "confirmModal"); });
    $("confirmYesBtn").addEventListener("click", function() {
      if (confirmCallback) confirmCallback();
    });
  }

  // ============ SETTINGS ============
  function initSettings() {
    $("apiUrlInput").value = settings.apiUrl;
    $("apiKeyInput").value = settings.apiKey;
    $("modelDisplay").value = settings.model;
    $("fallbackModelsInput").value = settings.fallbackModels;
    $("tempSlider").value = settings.temperature;
    $("tempValue").textContent = settings.temperature;
    $("tokensSlider").value = settings.maxTokens;
    $("tokensValue").textContent = settings.maxTokens;
    $("systemPromptInput").value = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT_FALLBACK;
    $("systemAccessToggle").checked = settings.systemAccess;
    $("skillsToggle").checked = settings.skillsEnabled;
    $("bypassPermissionsToggle").checked = settings.bypassPermissions;
    $("autoScreenshotToggle").checked = settings.autoScreenshot;
    $("continuousModeToggle").checked = settings.continuousMode;
    $("themeToggle").checked = settings.theme === "light";
    $("serverUrlDisplay").textContent = settings.apiUrl.replace("http://", "").replace("https://", "");
    // Bypass Warning anzeigen falls aktiv
    $("bypassWarning").style.display = settings.bypassPermissions ? "block" : "none";
  }

  function saveSettings() {
    setSetting(STORAGE_KEYS.apiUrl, $("apiUrlInput").value || defaults.apiUrl);
    setSetting(STORAGE_KEYS.apiKey, $("apiKeyInput").value);
    var modelVal = $("modelDisplay").value.trim() || settings.model;
    setSetting(STORAGE_KEYS.model, modelVal);
    setSetting(STORAGE_KEYS.fallbackModels, $("fallbackModelsInput").value);
    setSetting(STORAGE_KEYS.temperature, $("tempSlider").value);
    setSetting(STORAGE_KEYS.maxTokens, $("tokensSlider").value);
    setSetting(STORAGE_KEYS.systemPrompt, $("systemPromptInput").value);
    setSetting(STORAGE_KEYS.systemAccess, $("systemAccessToggle").checked ? "true" : "false");
    setSetting(STORAGE_KEYS.skillsEnabled, $("skillsToggle").checked ? "true" : "false");
    setSetting(STORAGE_KEYS.bypassPermissions, $("bypassPermissionsToggle").checked ? "true" : "false");
    setSetting(STORAGE_KEYS.autoScreenshot, $("autoScreenshotToggle").checked ? "true" : "false");
    setSetting(STORAGE_KEYS.continuousMode, $("continuousModeToggle").checked ? "true" : "false");
    var theme = $("themeToggle").checked ? "light" : "dark";
    setSetting(STORAGE_KEYS.theme, theme);

    settings.apiUrl = getSetting(STORAGE_KEYS.apiUrl, defaults.apiUrl);
    settings.apiKey = getSetting(STORAGE_KEYS.apiKey, defaults.apiKey);
    settings.model = getSetting(STORAGE_KEYS.model, defaults.model);
    settings.fallbackModels = getSetting(STORAGE_KEYS.fallbackModels, defaults.fallbackModels);
    settings.temperature = getSettingNum(STORAGE_KEYS.temperature, defaults.temperature);
    settings.maxTokens = getSettingNum(STORAGE_KEYS.maxTokens, defaults.maxTokens);
    settings.systemPrompt = getSetting(STORAGE_KEYS.systemPrompt, "");
    settings.systemAccess = getSettingBool(STORAGE_KEYS.systemAccess, defaults.systemAccess);
    settings.skillsEnabled = getSettingBool(STORAGE_KEYS.skillsEnabled, defaults.skillsEnabled);
    settings.bypassPermissions = getSettingBool(STORAGE_KEYS.bypassPermissions, defaults.bypassPermissions);
    settings.autoScreenshot = getSettingBool(STORAGE_KEYS.autoScreenshot, defaults.autoScreenshot);
    settings.continuousMode = getSettingBool(STORAGE_KEYS.continuousMode, defaults.continuousMode);
    settings.theme = getSetting(STORAGE_KEYS.theme, defaults.theme);

    $("serverUrlDisplay").textContent = settings.apiUrl.replace("http://", "").replace("https://", "");
    applyTheme();
    startStatusTimer();

    // Bypass Warning
    $("bypassWarning").style.display = settings.bypassPermissions ? "block" : "none";

    // Settings ans Backend senden
    callBackend("set_setting", { key: "bypass_permissions", value: settings.bypassPermissions ? "true" : "false" }).catch(function() {});
    callBackend("set_setting", { key: "auto_screenshot", value: settings.autoScreenshot ? "true" : "false" }).catch(function() {});
    callBackend("set_setting", { key: "continuous_mode", value: settings.continuousMode ? "true" : "false" }).catch(function() {});
  }

  function applyTheme() {
    if (settings.theme === "light") {
      document.body.setAttribute("data-theme", "light");
    } else {
      document.body.removeAttribute("data-theme");
    }
  }

  function setupSettingsEvents() {
    $("apiUrlInput").addEventListener("change", saveSettings);
    $("apiKeyInput").addEventListener("change", saveSettings);
    $("fallbackModelsInput").addEventListener("change", saveSettings);
    $("tempSlider").addEventListener("input", function() { $("tempValue").textContent = this.value; saveSettings(); });
    $("tokensSlider").addEventListener("input", function() { $("tokensValue").textContent = this.value; saveSettings(); });
    $("systemPromptInput").addEventListener("change", saveSettings);
    $("systemAccessToggle").addEventListener("change", saveSettings);
    $("skillsToggle").addEventListener("change", saveSettings);
    $("bypassPermissionsToggle").addEventListener("change", saveSettings);
    $("autoScreenshotToggle").addEventListener("change", saveSettings);
    $("continuousModeToggle").addEventListener("change", saveSettings);
    $("themeToggle").addEventListener("change", saveSettings);

    $("settingsModelChooseBtn").addEventListener("click", function() {
      callBackend("ollama_list_models", { apiUrl: $("apiUrlInput").value.trim(), apiKey: $("apiKeyInput").value.trim() }).then(function(models) {
        if (models && models.length > 0) openModelModal("settings", models);
        else { $("settingsModelStatus").textContent = "Keine Modelle gefunden."; $("settingsModelStatus").className = "hint"; }
      }).catch(function() {
        $("settingsModelStatus").textContent = "Modelle konnten nicht geladen werden.";
        $("settingsModelStatus").className = "hint";
      });
    });
    $("modelDisplay").addEventListener("click", function() { $("settingsModelChooseBtn").click(); });

    $("openOllamaLoginBtn").addEventListener("click", function() { openOllamaConnectModal("settings"); });

    $("testConnBtn").addEventListener("click", function() {
      $("testConnStatus").textContent = "Teste...";
      $("testConnStatus").className = "hint";
      callBackend("ollama_health", { apiUrl: $("apiUrlInput").value }).then(function(ok) {
        $("testConnStatus").textContent = ok ? "Verbindung erfolgreich!" : "Nicht erreichbar.";
        $("testConnStatus").className = "hint " + (ok ? "success" : "error");
      }).catch(function(err) {
        $("testConnStatus").textContent = "Fehler: " + err;
        $("testConnStatus").className = "hint error";
      });
    });

    $("resetPromptBtn").addEventListener("click", function() {
      callBackend("default_system_prompt", {}).then(function(p) {
        $("systemPromptInput").value = p;
        saveSettings();
      }).catch(function() {
        $("systemPromptInput").value = DEFAULT_SYSTEM_PROMPT_FALLBACK;
        saveSettings();
      });
    });

    $("exportDataBtn").addEventListener("click", exportData);
    $("deleteDataBtn").addEventListener("click", deleteData);

    // Update-Check Button
    $("checkUpdatesBtn").addEventListener("click", function() {
      $("checkUpdatesBtn").disabled = true;
      $("checkUpdatesBtn").textContent = "Pruefe...";
      callBackend("check_for_updates", {}).then(function(result) {
        $("checkUpdatesBtn").disabled = false;
        $("checkUpdatesBtn").textContent = "Nach Updates suchen";
        var info = typeof result === "string" ? JSON.parse(result) : result;
        if (info && info.current_version) {
          $("currentVersionDisplay").textContent = "Titan Toti v" + info.current_version;
        }
        if (info && info.update_available) {
          $("updateCheckStatus").textContent = "Neue Version " + info.latest_version + " verfuegbar!";
          $("updateCheckStatus").style.color = "var(--green)";
        } else {
          $("updateCheckStatus").textContent = "Du nutzt die neueste Version.";
          $("updateCheckStatus").style.color = "var(--text-secondary)";
        }
      }).catch(function() {
        $("checkUpdatesBtn").disabled = false;
        $("checkUpdatesBtn").textContent = "Nach Updates suchen";
        $("updateCheckStatus").textContent = "Update-Check fehlgeschlagen.";
      });
    });
  }

  function exportData() {
    callBackend("memory_get_sessions", {}).then(function(sessionsResult) {
      var exportObj = {
        app: "Titan Toti",
        version: "2.3.0",
        export_date: new Date().toISOString(),
        settings: {
          apiUrl: settings.apiUrl,
          model: settings.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens
        },
        sessions: JSON.parse(sessionsResult)
      };
      var sessions = exportObj.sessions;
      var promises = sessions.map(function(s) {
        return callBackend("memory_get_messages", { sessionId: s.id }).then(function(msgs) {
          s.messages = JSON.parse(msgs);
        }).catch(function() { s.messages = []; });
      });
      Promise.all(promises).then(function() {
        var blob = new Blob([JSON.stringify(exportObj, null, 2)], {type: "application/json"});
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "titan-toti-export-" + Date.now() + ".json";
        a.click();
        URL.revokeObjectURL(url);
        $("dsvoStatus").textContent = "Daten exportiert!";
        $("dsvoStatus").className = "hint success";
      });
    }).catch(function(err) {
      $("dsvoStatus").textContent = "Fehler: " + err;
      $("dsvoStatus").className = "hint error";
    });
  }

  function deleteData() {
    showConfirm("Alle Daten loeschen", "Moechtest du wirklich alle Daten loeschen? Dies kann nicht rueckgaengig gemacht werden.", function() {
      callBackend("memory_clear_all", {}).then(function() {
        localStorage.removeItem(STORAGE_KEYS.currentSession);
        localStorage.removeItem(STORAGE_KEYS.setupDone);
        chatHistory = {};
        renderChatMessages();
        $("dsvoStatus").textContent = "Alle Daten geloescht!";
        $("dsvoStatus").className = "hint success";
        updateSessionSelect();
        closeModal("confirmBackdrop", "confirmModal");
      }).catch(function(err) {
        $("dsvoStatus").textContent = "Fehler: " + err;
        $("dsvoStatus").className = "hint error";
        closeModal("confirmBackdrop", "confirmModal");
      });
    });
  }

  // --- INIT ---
  function init() {
    setupSettingsEvents();
    initSetup();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();