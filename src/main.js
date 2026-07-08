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

  var DEFAULT_SYSTEM_PROMPT_FALLBACK = "Du bist Titan Toti — ein lokaler KI-Assistent auf macOS. Du kannst auf das System zugreifen, Dateien lesen/schreiben, Commands ausfuehren und dem Nutzer helfen. Du sprichst Deutsch.";

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
    if (view === "memory") { initBrainViewer(); loadMemoryZone("core"); }
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

  function loadActivities() {
    callBackend("get_activities", {}).then(function(result) {
      var activities = [];
      try {
        activities = typeof result === "string" ? JSON.parse(result) : result;
      } catch (e) { activities = []; }
      if (!Array.isArray(activities)) activities = [];

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
      callBackend("log_activity", { type: "action", message: "Bild analysiert" }).catch(function() {});
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

    // Attached files
    var fileContext = "";
    if (attachedFiles.length > 0) {
      fileContext = "\n\n[Angehaengte Dateien:\n";
      attachedFiles.forEach(function(f) { fileContext += "- " + f.name + " (" + f.path + ")\n"; });
      fileContext += "]";
    }

    var ts = Date.now();
    var userMsg = text + fileContext;
    appendMessage("user", text + (fileContext ? "\n\n📎 " + attachedFiles.length + " Datei(en) angehaengt" : ""), ts, true);

    // Bilder analysieren
    if (attachedImages.length > 0) {
      attachedImages.forEach(function(img) {
        analyzeImageInternal(img.path);
      });
    }

    callBackend("memory_add_message", { sessionId: settings.currentSession, role: "user", content: userMsg }).catch(function() {});
    callBackend("log_activity", { type: "thinking", message: "Nachricht empfangen" }).catch(function() {});

    input.value = "";
    input.style.height = "auto";
    attachedFiles = [];
    attachedImages = [];
    renderAttachedFiles();

    $("typingIndicator").style.display = "flex";
    showChatActivity("Titan denkt nach...");
    scrollToBottom();

    // Skill-Matching (falls verfuegbar)
    var skillPromise = Promise.resolve(null);
    if (settings.skillsEnabled) {
      skillPromise = callBackend("skills_match", { message: text, systemAccess: settings.systemAccess }).then(function(resultStr) {
        try {
          var skillResult = JSON.parse(resultStr);
          if (skillResult.matched) return skillResult;
        } catch (e) {}
        return null;
      }).catch(function() { return null; });
    }

    skillPromise.then(function(skillResult) {
      if (skillResult) {
        appendMessage("assistant", "", Date.now(), true, skillResult);
        callBackend("log_activity", { type: "skill", message: "Skill ausgefuehrt: " + skillResult.skill_name }).catch(function() {});
      }

      var messages = buildLLMMessages(text, skillResult, attachedFiles);
      showChatActivity("Titan antwortet...");
      callBackend("ollama_chat", {
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        messages: messages,
        temperature: settings.temperature,
        maxTokens: Math.round(settings.maxTokens),
        fallbackModels: parseFallbackModels(settings.fallbackModels)
      }).then(function(response) {
        $("typingIndicator").style.display = "none";
        hideChatActivity();
        appendMessage("assistant", response, Date.now(), true);
        callBackend("memory_add_message", { sessionId: settings.currentSession, role: "assistant", content: response }).catch(function() {});
        callBackend("log_activity", { type: "action", message: "Antwort gesendet" }).catch(function() {});
      }).catch(function(err) {
        $("typingIndicator").style.display = "none";
        hideChatActivity();
        var errText = "Fehler: " + err;
        if (skillResult) errText = "LLM nicht erreichbar. Skill wurde jedoch ausgefuehrt.\n\nFehler: " + err;
        appendMessage("assistant", errText, Date.now(), true);
        callBackend("log_activity", { type: "error", message: "Chat-Fehler: " + err }).catch(function() {});
      });
    });
  }

  function buildLLMMessages(userText, skillResult, files) {
    var msgs = [];
    var sysContent = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT_FALLBACK;
    msgs.push({ role: "system", content: sysContent });
    var sessionMsgs = getSessionMessages();
    var recent = sessionMsgs.slice(-20);
    recent.forEach(function(m) {
      msgs.push({ role: m.role === "user" ? "user" : "assistant", content: m.content });
    });
    if (skillResult && skillResult.matched) {
      msgs.push({ role: "system", content: "Skill '" + skillResult.skill_name + "' wurde ausgefuehrt. Ergebnis:\n" + skillResult.result });
    }
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
          callBackend("log_activity", { type: "command", message: cmd }).catch(function() {});
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
          callBackend("log_activity", { type: "file_read", message: filePath }).catch(function() {});
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

  // ============ MEMORY 3D GEHIRN ============
  var brainViewerInitialized = false;
  var brainScene = null;
  var brainCamera = null;
  var brainRenderer = null;
  var brainControls = null;
  var brainRaycaster = null;
  var brainMouse = null;
  var brainModel = null;
  var brainZones = [];
  var brainAutoRotate = true;
  var brainAnimationId = null;
  var currentMemoryZone = "core";
  var hoveredZone = null;

  // Zone-Konfiguration
  var ZONE_CONFIG = {
    core: { name: "Core Memory", color: 0x4a9eff, colorHex: "#4a9eff", searchCmd: "memory_search_core", deleteCmd: "memory_delete_core", editCmd: "memory_edit_core", addCmd: "memory_add_core" },
    skills: { name: "Skills", color: 0x34c759, colorHex: "#34c759", searchCmd: "memory_search_skills", deleteCmd: "memory_delete_skill", addCmd: "memory_add_skill" },
    sensitive: { name: "Sensitive Data", color: 0xbf5af2, colorHex: "#bf5af2", searchCmd: "memory_search_sensitive", deleteCmd: "memory_delete_sensitive", editCmd: "memory_edit_sensitive", addCmd: "memory_add_sensitive" }
  };

  function setupMemoryView() {
    $("refreshMemoryBtn").addEventListener("click", function() {
      loadMemoryZone(currentMemoryZone);
      if (!brainViewerInitialized) initBrainViewer();
    });
    $("memoryAddBtn").addEventListener("click", function() {
      openMemoryEditModal(null, currentMemoryZone);
    });
    $("memoryZoneSearch").addEventListener("input", function() {
      searchMemoryZone(currentMemoryZone, this.value);
    });
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

    // Three.js als ES-Module lokal laden (kein CDN noetig)
    // WICHTIG: Der Funktionsparameter ist der ES module namespace
    // (readonly, exotic object). Wir kopieren alle Eigenschaften in ein
    // plain object T und weisen dieses window.THREE zu, damit spaetere
    // Zuweisungen (OrbitControls, GLTFLoader) und new THREE.X() funktionieren.
    import("./lib/three.module.js").then(function(THREE_MOD) {
      var keys = Object.keys(THREE_MOD);
      var T = {};
      for (var i = 0; i < keys.length; i++) {
        T[keys[i]] = THREE_MOD[keys[i]];
      }
      window.THREE = T;
      return import("./lib/OrbitControls.js").then(function(orbitMod) {
        window.THREE.OrbitControls = orbitMod.OrbitControls;
        return import("./lib/GLTFLoader.js").then(function(gltfMod) {
          window.THREE.GLTFLoader = gltfMod.GLTFLoader;
          initBrainThree(canvas, width, height);
        });
      });
    }).catch(function(e) {
      $("brainLoading").textContent = "Three.js Fehler: " + e.message;
    });
  }

  function initBrainThree(canvas, width, height) {
    var THREE = window.THREE;
    try {
      brainScene = new THREE.Scene();
      brainCamera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
      brainCamera.position.set(0, 0, 5);

      brainRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      brainRenderer.setPixelRatio(window.devicePixelRatio);
      brainRenderer.setSize(width, height);

      // Licht
      var ambient = new THREE.AmbientLight(0x404060, 1.5);
      brainScene.add(ambient);
      var dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
      dirLight.position.set(5, 5, 5);
      brainScene.add(dirLight);
      var dirLight2 = new THREE.DirectionalLight(0x4a9eff, 0.5);
      dirLight2.position.set(-5, -5, 5);
      brainScene.add(dirLight2);

      // Raycaster
      brainRaycaster = new THREE.Raycaster();
      brainMouse = new THREE.Vector2();

      // Versuche GLTFLoader + brain.glb zu laden
      loadBrainModel(canvas, width, height);

      brainViewerInitialized = true;
      $("brainLoading").style.display = "none";

      // OrbitControls laden
      loadOrbitControls(canvas);

      // Event-Listener
      canvas.addEventListener("click", onBrainClick);
      canvas.addEventListener("mousemove", onBrainMouseMove);
      canvas.addEventListener("touchend", onBrainClick);

      // Animation-Loop starten
      animateBrain();
    } catch (e) {
      $("brainLoading").textContent = "Fehler beim Initialisieren: " + e.message;
    }
  }

  function loadOrbitControls(canvas) {
    var THREE = window.THREE;
    // OrbitControls wurde bereits als ES-Modul geladen
    if (THREE.OrbitControls && brainCamera && brainRenderer) {
      brainControls = new THREE.OrbitControls(brainCamera, brainRenderer.domElement);
      brainControls.enableDamping = true;
      brainControls.dampingFactor = 0.05;
      brainControls.minDistance = 3;
      brainControls.maxDistance = 15;
      brainControls.autoRotate = false;
      // Bei User-Interaktion Auto-Rotation stoppen
      brainControls.addEventListener("start", function() { brainAutoRotate = false; });
    } else {
      // Fallback: manuelle Mouse-Controls
      setupManualControls(canvas);
    }
  }

  function setupManualControls(canvas) {
    var isDragging = false;
    var prevX = 0, prevY = 0;
    canvas.addEventListener("mousedown", function(e) {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    });
    canvas.addEventListener("mouseup", function() { isDragging = false; });
    canvas.addEventListener("mousemove", function(e) {
      if (!isDragging || !brainModel) return;
      var dx = e.clientX - prevX;
      var dy = e.clientY - prevY;
      brainModel.rotation.y += dx * 0.01;
      brainModel.rotation.x += dy * 0.01;
      prevX = e.clientX;
      prevY = e.clientY;
    });
    canvas.addEventListener("wheel", function(e) {
      e.preventDefault();
      if (brainCamera) {
        brainCamera.position.z += e.deltaY * 0.01;
        brainCamera.position.z = Math.max(3, Math.min(15, brainCamera.position.z));
      }
    });
  }

  function loadBrainModel(canvas, width, height) {
    var THREE = window.THREE;
    // GLTFLoader wurde bereits als ES-Modul geladen
    if (THREE.GLTFLoader) {
      var loader = new THREE.GLTFLoader();
      // brain.glb aus assets laden
      loader.load("assets/brain.glb",
        function(gltf) {
          brainModel = gltf.scene;
          // Zonen-Markierungen erstellen (falls das Modell sie nicht hat)
          createBrainZones(brainModel);
          brainScene.add(brainModel);
          $("brainLoading").style.display = "none";
        },
        function(progress) {
          if (progress.total > 0) {
            $("brainLoading").textContent = "Lade Gehirn... " + Math.round((progress.loaded / progress.total) * 100) + "%";
          }
        },
        function(err) {
          // Fallback: Placeholder-Gehirn erstellen
          console.log("brain.glb nicht verfuegbar, erstelle Placeholder");
          createPlaceholderBrain();
          $("brainLoading").style.display = "none";
        }
      );
    } else {
      createPlaceholderBrain();
      $("brainLoading").style.display = "none";
    }
  }

  // Placeholder-Gehirn: 3 Spheren fuer die 3 Zonen
  function createPlaceholderBrain() {
    var THREE = window.THREE;
    brainModel = new THREE.Group();

    // Blaue Hemisphaere (Core) — linke Haelfte
    var coreGeo = new THREE.SphereGeometry(1.5, 32, 32, 0, Math.PI * 0.5, 0, Math.PI * 2);
    var coreMat = new THREE.MeshPhongMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.85, shininess: 80 });
    var coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(-0.3, 0, 0);
    coreMesh.userData = { zone: "core", name: "Core Memory" };
    brainModel.add(coreMesh);
    brainZones.push(coreMesh);

    // Gruene Hemisphaere (Skills) — rechte Haelfte
    var skillsGeo = new THREE.SphereGeometry(1.5, 32, 32, Math.PI * 0.5, Math.PI * 0.5, 0, Math.PI * 2);
    var skillsMat = new THREE.MeshPhongMaterial({ color: 0x34c759, transparent: true, opacity: 0.85, shininess: 80 });
    var skillsMesh = new THREE.Mesh(skillsGeo, skillsMat);
    skillsMesh.position.set(0.3, 0, 0);
    skillsMesh.userData = { zone: "skills", name: "Skills" };
    brainModel.add(skillsMesh);
    brainZones.push(skillsMesh);

    // Purple zentrale Sektion (Sensitive) — kleine Sphaere in der Mitte
    var sensGeo = new THREE.SphereGeometry(0.7, 32, 32);
    var sensMat = new THREE.MeshPhongMaterial({ color: 0xbf5af2, transparent: true, opacity: 0.9, shininess: 100, emissive: 0xbf5af2, emissiveIntensity: 0.2 });
    var sensMesh = new THREE.Mesh(sensGeo, sensMat);
    sensMesh.position.set(0, 0, 0);
    sensMesh.userData = { zone: "sensitive", name: "Sensitive Data" };
    brainModel.add(sensMesh);
    brainZones.push(sensMesh);

    // Verbindungs-Linien (synapsen-aehnlich)
    var lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    for (var i = 0; i < 15; i++) {
      var start = new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
      var end = new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
      var lineGeo = new THREE.BufferGeometry().setFromPoints([start, end]);
      var line = new THREE.Line(lineGeo, lineMat);
      brainModel.add(line);
    }

    brainScene.add(brainModel);
  }

  function createBrainZones(model) {
    var THREE = window.THREE;
    // Wenn brain.glb geladen wurde, erstelle Zonen-Meshes darueber
    // Suche nach Meshes mit bestimmten Namen oder erstelle Spheren als Overlays
    // Falls das Modell bereits benannte Zonen hat, nutze diese
    var hasNamedZones = false;
    model.traverse(function(child) {
      if (child.isMesh) {
        var name = (child.name || "").toLowerCase();
        if (name.indexOf("core") >= 0) {
          child.userData = { zone: "core", name: "Core Memory" };
          if (child.material) child.material.color.setHex(0x4a9eff);
          brainZones.push(child);
          hasNamedZones = true;
        } else if (name.indexOf("skill") >= 0) {
          child.userData = { zone: "skills", name: "Skills" };
          if (child.material) child.material.color.setHex(0x34c759);
          brainZones.push(child);
          hasNamedZones = true;
        } else if (name.indexOf("sensitive") >= 0 || name.indexOf("sens") >= 0) {
          child.userData = { zone: "sensitive", name: "Sensitive Data" };
          if (child.material) child.material.color.setHex(0xbf5af2);
          brainZones.push(child);
          hasNamedZones = true;
        }
      }
    });

    // Falls keine benannten Zonen gefunden wurden, erstelle Overlay-Spheren
    if (!hasNamedZones) {
      // Core — linke Haelfte
      var coreGeo = new THREE.SphereGeometry(0.8, 24, 24, 0, Math.PI);
      var coreMat = new THREE.MeshPhongMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.4, shininess: 60 });
      var coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.set(-0.8, 0, 0);
      coreMesh.userData = { zone: "core", name: "Core Memory" };
      model.add(coreMesh);
      brainZones.push(coreMesh);

      // Skills — rechte Haelfte
      var skillsGeo = new THREE.SphereGeometry(0.8, 24, 24, Math.PI, Math.PI);
      var skillsMat = new THREE.MeshPhongMaterial({ color: 0x34c759, transparent: true, opacity: 0.4, shininess: 60 });
      var skillsMesh = new THREE.Mesh(skillsGeo, skillsMat);
      skillsMesh.position.set(0.8, 0, 0);
      skillsMesh.userData = { zone: "skills", name: "Skills" };
      model.add(skillsMesh);
      brainZones.push(skillsMesh);

      // Sensitive — zentrale Sphaere
      var sensGeo = new THREE.SphereGeometry(0.5, 24, 24);
      var sensMat = new THREE.MeshPhongMaterial({ color: 0xbf5af2, transparent: true, opacity: 0.5, shininess: 80, emissive: 0xbf5af2, emissiveIntensity: 0.15 });
      var sensMesh = new THREE.Mesh(sensGeo, sensMat);
      sensMesh.position.set(0, 0, 0);
      sensMesh.userData = { zone: "sensitive", name: "Sensitive Data" };
      model.add(sensMesh);
      brainZones.push(sensMesh);
    }
  }

  function onBrainClick(event) {
    if (!brainRaycaster || !brainCamera) return;
    var rect = event.target.getBoundingClientRect();
    var x = (event.clientX !== undefined ? event.clientX : (event.changedTouches && event.changedTouches[0].clientX)) - rect.left;
    var y = (event.clientY !== undefined ? event.clientY : (event.changedTouches && event.changedTouches[0].clientY)) - rect.top;
    brainMouse.x = (x / rect.width) * 2 - 1;
    brainMouse.y = -(y / rect.height) * 2 + 1;
    brainRaycaster.setFromCamera(brainMouse, brainCamera);
    var intersects = brainRaycaster.intersectObjects(brainZones);
    if (intersects.length > 0) {
      var zone = intersects[0].object.userData.zone;
      brainAutoRotate = false;
      loadMemoryZone(zone);
    }
  }

  function onBrainMouseMove(event) {
    var THREE = window.THREE;
    if (!brainRaycaster || !brainCamera) return;
    var rect = event.target.getBoundingClientRect();
    brainMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    brainMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    brainRaycaster.setFromCamera(brainMouse, brainCamera);
    var intersects = brainRaycaster.intersectObjects(brainZones);
    var tooltip = $("brainTooltip");
    if (intersects.length > 0) {
      var zoneData = intersects[0].object.userData;
      if (zoneData && zoneData.zone) {
        var zc = ZONE_CONFIG[zoneData.zone];
        if (zc) {
          tooltip.textContent = zc.name;
          tooltip.style.display = "block";
          tooltip.style.left = (event.clientX - rect.left + 10) + "px";
          tooltip.style.top = (event.clientY - rect.top + 10) + "px";
          // Glow-Effekt
          if (hoveredZone !== intersects[0].object) {
            if (hoveredZone && hoveredZone.material) {
              hoveredZone.material.emissiveIntensity = hoveredZone.userData.originalEmissive || 0;
            }
            hoveredZone = intersects[0].object;
            if (hoveredZone.material) {
              hoveredZone.userData.originalEmissive = hoveredZone.material.emissiveIntensity || 0;
              hoveredZone.material.emissive = new THREE.Color(zc.color);
              hoveredZone.material.emissiveIntensity = 0.4;
            }
          }
          event.target.style.cursor = "pointer";
          return;
        }
      }
    }
    tooltip.style.display = "none";
    if (hoveredZone && hoveredZone.material) {
      hoveredZone.material.emissiveIntensity = hoveredZone.userData.originalEmissive || 0;
    }
    hoveredZone = null;
    event.target.style.cursor = "default";
  }

  function animateBrain() {
    brainAnimationId = requestAnimationFrame(animateBrain);
    if (brainModel && brainAutoRotate) {
      brainModel.rotation.y += 0.005;
    }
    if (brainControls) brainControls.update();
    if (brainRenderer && brainScene && brainCamera) {
      brainRenderer.render(brainScene, brainCamera);
    }
  }

  function onBrainResize() {
    var wrap = $("brainCanvasWrap");
    if (!wrap || !brainRenderer || !brainCamera) return;
    var w = wrap.clientWidth;
    var h = wrap.clientHeight;
    if (w < 10 || h < 10) return;
    brainCamera.aspect = w / h;
    brainCamera.updateProjectionMatrix();
    brainRenderer.setSize(w, h);
  }

  // --- MEMORY ZONE LIST ---
  function loadMemoryZone(zone) {
    currentMemoryZone = zone;
    var zc = ZONE_CONFIG[zone];
    if (!zc) return;
    $("zonePanelTitle").textContent = zc.name;
    $("memoryAddBtn").style.display = "inline-flex";
    var list = $("memoryZoneList");
    list.innerHTML = '<div class="empty-state"><p>Lade ' + zc.name + '...</p></div>';
    callBackend(zc.searchCmd, { query: "" }).then(function(result) {
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
    callBackend(zc.searchCmd, { query: query }).then(function(result) {
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
      item.className = "memory-zone-item";
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
      item.innerHTML =
        '<div class="mz-item-header">' +
          '<span class="mz-item-key">' + escapeHtml(key) + '</span>' +
          '<div class="mz-item-actions">' +
            '<button class="mz-action-btn edit" data-id="' + escapeHtml(id) + '" title="Bearbeiten">✏️</button>' +
            '<button class="mz-action-btn delete" data-id="' + escapeHtml(id) + '" title="Loeschen">🗑</button>' +
          '</div>' +
        '</div>' +
        '<div class="mz-item-value">' + escapeHtml(truncated) + '</div>' +
        '<div class="mz-item-meta">' +
          (ts ? '<span>' + ts + '</span>' : "") +
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
          callBackend(zc.deleteCmd, { key: id }).then(function() {
            loadMemoryZone(zone);
          }).catch(function() {});
          closeModal("confirmBackdrop", "confirmModal");
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
      var args = { key: key, value: value, tags: tags };
      var cmd = memoryEditId ? zc.editCmd : zc.addCmd;
      if (memoryEditId) args.id = memoryEditId;
      callBackend(cmd, args).then(function() {
        closeModal("memoryEditBackdrop", "memoryEditModal");
        loadMemoryZone(memoryEditZone);
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
      callBackend("execute_skill", { skillName: currentSkill.name, params: params }).then(function(result) {
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
            callBackend("memory_delete_sensitive", { key: id }).then(function() { loadPasswords(); }).catch(function() {});
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
          callBackend("memory_edit_sensitive", { key: pwEditId, value: JSON.stringify(data) }).then(function() {
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
          callBackend("memory_add_sensitive", { key: data.title, value: JSON.stringify(data) }).then(function() {
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
      callBackend("spawn_agent", { task: task, model: model }).then(function(result) {
        var agentId = typeof result === "string" ? result : (result && result.id ? result.id : "unknown");
        appendMessage("titan", "Agent gestartet (ID: " + agentId + ")\nAufgabe: " + task, Date.now(), true);
        callBackend("log_activity", { type: "agent_started", message: task.substring(0, 80) }).catch(function() {});
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