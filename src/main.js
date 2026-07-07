// Titan Toti v2.2 — Standalone Frontend
// Vanilla JS — KEINE Backticks, KEINE Frameworks

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
    theme: getSetting(STORAGE_KEYS.theme, defaults.theme),
    currentSession: getSetting(STORAGE_KEYS.currentSession, "")
  };

  // In-memory Chat-Historie (pro Session)
  var chatHistory = {};

  // --- TAUURI BRIDGE ---
  var invoke = null;
  if (typeof window.__TAURI__ !== "undefined" && window.__TAURI__.core) {
    invoke = window.__TAURI__.core.invoke;
  }

  function callBackend(cmd, args) {
    if (invoke) {
      return invoke(cmd, args);
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

  function generateId() {
    return "s_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  }

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
    html = html.replace(/^[\*\-]\s+(.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
    var parts = html.split(/\n\n+/);
    html = parts.map(function(p) {
      if (p.indexOf("<ul>") === 0 || p.indexOf("<ol>") === 0) return p;
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

  // --- MODELL-AUSWAHL MODAL ---
  var modelModalContext = "setup"; // "setup" oder "settings"
  var availableModels = [];

  function openModelModal(context, models) {
    modelModalContext = context || "setup";
    availableModels = models || [];
    var backdrop = $("modelModalBackdrop");
    var modal = $("modelModal");
    backdrop.style.display = "block";
    modal.style.display = "flex";
    // Animation: slide-down + fade-in
    modal.classList.remove("modal-closing");
    modal.classList.add("modal-opening");
    // Search zuruecksetzen
    $("modelSearchInput").value = "";
    // Modelle rendern
    renderModelList(availableModels, "");
    // Focus auf Search
    setTimeout(function() { $("modelSearchInput").focus(); }, 100);
  }

  function closeModelModal() {
    var backdrop = $("modelModalBackdrop");
    var modal = $("modelModal");
    // Animation: slide-up + fade-out
    modal.classList.remove("modal-opening");
    modal.classList.add("modal-closing");
    setTimeout(function() {
      modal.style.display = "none";
      backdrop.style.display = "none";
      modal.classList.remove("modal-closing");
    }, 300);
  }

  function renderModelList(models, filter) {
    var container = $("modelListContainer");
    var filtered = models;
    if (filter) {
      var f = filter.toLowerCase();
      filtered = models.filter(function(m) {
        return m.toLowerCase().indexOf(f) >= 0;
      });
    }
    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Keine Modelle gefunden.</p></div>';
      return;
    }
    container.innerHTML = "";
    filtered.forEach(function(m) {
      var card = document.createElement("div");
      card.className = "model-card";
      card.setAttribute("data-model", m);
      card.innerHTML = '<div class="model-card-name">' + escapeHtml(m) + '</div>';
      card.addEventListener("click", function() {
        selectModelFromModal(m);
      });
      container.appendChild(card);
    });
  }

  function selectModelFromModal(modelName) {
    if (modelModalContext === "setup") {
      $("setupModelInput").value = modelName;
      $("setupModelDisplay").value = modelName;
      $("setupModelStatus").textContent = "Modell: " + modelName + " ausgewählt";
      $("setupModelStatus").className = "hint success";
    } else {
      // Settings
      $("modelDisplay").value = modelName;
      // Internen select fuer saveSettings aktualisieren (falls vorhanden)
      settings.model = modelName;
      setSetting(STORAGE_KEYS.model, modelName);
      $("settingsModelStatus").textContent = "Modell: " + modelName + " ausgewählt";
      $("settingsModelStatus").className = "hint success";
    }
    closeModelModal();
  }

  function setupModelModalEvents() {
    // Schliessen-Button
    $("modelModalClose").addEventListener("click", closeModelModal);
    // Backdrop Klick schliesst
    $("modelModalBackdrop").addEventListener("click", closeModelModal);
    // Search
    $("modelSearchInput").addEventListener("input", function() {
      renderModelList(availableModels, this.value);
    });
    // ESC schliesst Modal (globale Listener weiter unten)
  }

  // --- OLLAMA CONNECT MODAL ---
  var ollamaConnectContext = "setup"; // "setup" oder "settings"

  function openOllamaConnectModal(context) {
    ollamaConnectContext = context || "setup";
    var backdrop = $("ollamaConnectBackdrop");
    var modal = $("ollamaConnectModal");
    backdrop.style.display = "block";
    modal.style.display = "flex";
    modal.classList.remove("modal-closing");
    modal.classList.add("modal-opening");
    // Browser oeffnen
    callBackend("open_ollama_login", {}).then(function() {
      $("ollamaConnectStatus").textContent = "Browser geöffnet. Bitte logge dich ein und kopiere deinen API Key.";
      $("ollamaConnectStatus").className = "hint";
    }).catch(function(err) {
      $("ollamaConnectStatus").textContent = "Browser konnte nicht geöffnet werden: " + err;
      $("ollamaConnectStatus").className = "hint error";
    });
    // Key zuruecksetzen
    $("ollamaConnectKey").value = "";
    setTimeout(function() { $("ollamaConnectKey").focus(); }, 100);
  }

  function closeOllamaConnectModal() {
    var backdrop = $("ollamaConnectBackdrop");
    var modal = $("ollamaConnectModal");
    modal.classList.remove("modal-opening");
    modal.classList.add("modal-closing");
    setTimeout(function() {
      modal.style.display = "none";
      backdrop.style.display = "none";
      modal.classList.remove("modal-closing");
    }, 300);
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
      $("ollamaConnectStatus").textContent = "Teste Verbindung...";
      $("ollamaConnectStatus").className = "hint";
      var apiUrl = "https://api.ollama.ai";
      if (ollamaConnectContext === "setup") {
        apiUrl = $("setupApiUrl").value.trim() || "https://api.ollama.ai";
      } else {
        apiUrl = $("apiUrlInput").value.trim() || "https://api.ollama.ai";
      }
      callBackend("ollama_health", { apiUrl: apiUrl }).then(function(ok) {
        if (ok) {
          // Key speichern
          if (ollamaConnectContext === "setup") {
            $("setupApiUrl").value = apiUrl;
            $("setupApiKey").value = key;
            $("setupApiKeyGroup").style.display = "block";
            $("ollamaConnectStatus").textContent = "Verbunden! API Key gespeichert.";
            $("ollamaConnectStatus").className = "hint success";
          } else {
            $("apiUrlInput").value = apiUrl;
            $("apiKeyInput").value = key;
            $("ollamaLoginStatus").textContent = "Verbunden mit Ollama Cloud!";
            $("ollamaLoginStatus").className = "hint success";
            saveSettings();
          }
          setTimeout(closeOllamaConnectModal, 1000);
        } else {
          // Key trotzdem speichern (Server vielleicht erst nach Key verfuegbar)
          if (ollamaConnectContext === "setup") {
            $("setupApiUrl").value = apiUrl;
            $("setupApiKey").value = key;
            $("setupApiKeyGroup").style.display = "block";
          } else {
            $("apiUrlInput").value = apiUrl;
            $("apiKeyInput").value = key;
            saveSettings();
          }
          $("ollamaConnectStatus").textContent = "API Key gespeichert. Server nicht direkt erreichbar — wird beim Chat getestet.";
          $("ollamaConnectStatus").className = "hint";
          setTimeout(closeOllamaConnectModal, 1500);
        }
      }).catch(function(err) {
        $("ollamaConnectStatus").textContent = "Fehler: " + err;
        $("ollamaConnectStatus").className = "hint error";
      });
    });
  }

  // Globale ESC-Listener fuer alle Modals
  function setupGlobalEscListener() {
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        var modelModal = $("modelModal");
        var ollamaModal = $("ollamaConnectModal");
        if (modelModal.style.display !== "none") {
          closeModelModal();
        }
        if (ollamaModal.style.display !== "none") {
          closeOllamaConnectModal();
        }
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

    var setupScreen = $("setupScreen");
    var mainApp = $("mainApp");
    setupScreen.style.display = "flex";
    mainApp.style.display = "none";

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
          // Ollama Connect Modal oeffnen
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
      var url = $("setupApiUrl").value.trim();
      var key = $("setupApiKey").value.trim();
      loadSetupModels(url, key);
    });

    $("setupModelDisplay").addEventListener("click", function() {
      $("setupModelChooseBtn").click();
    });

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
          settings.apiUrl = url;
          settings.apiKey = key;
          settings.model = model || "llama3.2";
          setSetting(STORAGE_KEYS.apiUrl, url);
          setSetting(STORAGE_KEYS.apiKey, key);
          setSetting(STORAGE_KEYS.model, settings.model);
          setSetting(STORAGE_KEYS.setupDone, "true");
          $("setupStatus").textContent = "Verbunden! Starte App...";
          $("setupStatus").className = "hint success";
          setTimeout(showMainApp, 800);
        } else {
          $("setupStatus").textContent = "Keine Verbindung zu Ollama unter " + url + ". Pruefe ob Ollama laeuft.";
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
    // Lade Modelle und oeffne Modal
    callBackend("ollama_list_models", { apiUrl: url, apiKey: key }).then(function(models) {
      if (models && models.length > 0) {
        openModelModal("setup", models);
      } else {
        $("setupModelStatus").textContent = "Keine Modelle gefunden. Bitte manuell eingeben.";
        $("setupModelStatus").className = "hint";
      }
    }).catch(function() {
      $("setupModelStatus").textContent = "Modelle konnten nicht geladen werden. Bitte manuell eingeben.";
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

    // Memory-Pfad anzeigen
    callBackend("memory_path", {}).then(function(p) {
      $("memoryPathDisplay").textContent = p;
    }).catch(function() {});

    // Default-System-Prompt laden falls noch keiner gesetzt
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

    setupNavigation();
    setupChat();
    setupMemory();
    setupSettings();
    setupResponsive();
    setupModelModalEvents();
    setupOllamaConnectEvents();
    setupGlobalEscListener();
  }

  // --- RESPONSIVE / HAMBURGER MENU ---
  function setupResponsive() {
    var hamburger = $("hamburgerBtn");
    var sidebar = $("sidebar");
    var backdrop = $("sidebarBackdrop");
    var closeBtn = $("sidebarClose");

    function isMobile() {
      return window.innerWidth < 700;
    }

    function openSidebar() {
      if (!sidebar) return;
      sidebar.classList.add("open");
      if (backdrop) backdrop.classList.add("visible");
    }

    function closeSidebar() {
      if (!sidebar) return;
      sidebar.classList.remove("open");
      if (backdrop) backdrop.classList.remove("visible");
    }

    if (hamburger) {
      hamburger.addEventListener("click", function() {
        if (sidebar && sidebar.classList.contains("open")) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", closeSidebar);
    }

    if (backdrop) {
      backdrop.addEventListener("click", closeSidebar);
    }

    // Window resize listener
    window.addEventListener("resize", function() {
      var w = window.innerWidth;
      if (w >= 700) {
        // Sidebar permanent sichtbar, Hamburger verstecken
        closeSidebar();
        if (sidebar) sidebar.style.display = "";
      } else {
        if (sidebar) sidebar.style.display = "";
      }
    });

    // Initial pruefen
    if (!isMobile()) {
      closeSidebar();
    }
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
    if (view === "memory") loadMemory();
    if (view === "skills") loadSkills();
    // Sidebar bei mobiler Ansicht schliessen nach View-Wechsel
    var sidebar = $("sidebar");
    var backdrop = $("sidebarBackdrop");
    if (sidebar && window.innerWidth < 700) {
      sidebar.classList.remove("open");
      if (backdrop) backdrop.classList.remove("visible");
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
        text.textContent = ok ? "Online" : "Offline";
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

  // --- SESSIONS & CHAT ---
  function loadChatFromMemory() {
    // Wenn keine current session, erstelle eine
    if (!settings.currentSession) {
      callBackend("memory_create_session", { name: "" }).then(function(sid) {
        settings.currentSession = sid;
        setSetting(STORAGE_KEYS.currentSession, sid);
        loadSessionsList();
      }).catch(function() {
        // Fallback: lokale ID
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

  function updateSessionSelect() {
    loadSessionsList();
  }

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

    // Skill-Badge
    if (skillInfo && skillInfo.skill_name) {
      var badge = document.createElement("div");
      badge.className = "skill-badge " + (skillInfo.success ? "success" : "error");
      badge.innerHTML = '<span class="skill-badge-icon">⚡</span> Skill: ' + escapeHtml(skillInfo.skill_name) + (skillInfo.success ? " ausgefuehrt" : " fehlgeschlagen");
      contentWrap.appendChild(badge);
      var resultDiv = document.createElement("div");
      resultDiv.className = "skill-result";
      resultDiv.innerHTML = '<pre>' + escapeHtml(skillInfo.result) + '</pre>';
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

  // Attached files
  var attachedFiles = [];
  function setupFileDrop() {
    var input = $("chatInput");
    var hint = $("fileDropHint");

    document.addEventListener("dragover", function(e) {
      e.preventDefault();
      hint.style.display = "block";
    });
    document.addEventListener("dragleave", function(e) {
      if (e.target === document) hint.style.display = "none";
    });
    document.addEventListener("drop", function(e) {
      e.preventDefault();
      hint.style.display = "none";
      var files = e.dataTransfer.files;
      for (var i = 0; i < files.length; i++) {
        attachedFiles.push({ name: files[i].name, path: files[i].path });
      }
      renderAttachedFiles();
    });
  }

  function renderAttachedFiles() {
    var container = $("attachedFiles");
    container.innerHTML = "";
    attachedFiles.forEach(function(f, idx) {
      var chip = document.createElement("div");
      chip.className = "file-chip";
      chip.innerHTML = '<span>📎 ' + escapeHtml(f.name) + '</span><button class="file-remove" data-idx="' + idx + '">×</button>';
      container.appendChild(chip);
    });
    container.querySelectorAll(".file-remove").forEach(function(btn) {
      btn.addEventListener("click", function() {
        attachedFiles.splice(parseInt(btn.getAttribute("data-idx")), 1);
        renderAttachedFiles();
      });
    });
  }

  function sendMessage() {
    var input = $("chatInput");
    var text = input.value.trim();
    if (!text) return;

    // Slash-Befehle
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

    // Attached files als Context
    var fileContext = "";
    var filesToProcess = attachedFiles.slice();
    if (filesToProcess.length > 0) {
      fileContext = "\n\n[Angehängte Dateien:\n";
      filesToProcess.forEach(function(f) {
        fileContext += "- " + f.name + " (" + f.path + ")\n";
      });
      fileContext += "]";
    }

    var ts = Date.now();
    var userMsg = text + fileContext;
    appendMessage("user", text + (fileContext ? "\n\n📎 " + filesToProcess.length + " Datei(en) angehängt" : ""), ts, true);

    // Memory: User-Nachricht speichern
    callBackend("memory_add_message", {
      sessionId: settings.currentSession,
      role: "user",
      content: userMsg
    }).catch(function() {});

    input.value = "";
    input.style.height = "auto";
    attachedFiles = [];
    renderAttachedFiles();

    $("typingIndicator").style.display = "flex";
    scrollToBottom();

    // Skill-Matching
    var skillPromise = Promise.resolve(null);
    if (settings.skillsEnabled) {
      skillPromise = callBackend("skills_match", {
        message: text,
        systemAccess: settings.systemAccess
      }).then(function(resultStr) {
        try {
          var skillResult = JSON.parse(resultStr);
          if (skillResult.matched) {
            return skillResult;
          }
        } catch (e) {}
        return null;
      }).catch(function() { return null; });
    }

    skillPromise.then(function(skillResult) {
      // Skill-Badge anzeigen
      if (skillResult) {
        appendMessage("assistant", "", Date.now(), true, skillResult);
      }

      // LLM-Call
      var messages = buildLLMMessages(text, skillResult, filesToProcess);
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
        appendMessage("assistant", response, Date.now(), true);
        // Memory: Antwort speichern
        callBackend("memory_add_message", {
          sessionId: settings.currentSession,
          role: "assistant",
          content: response
        }).catch(function() {});
      }).catch(function(err) {
        $("typingIndicator").style.display = "none";
        var errText = "Fehler: " + err;
        if (skillResult) {
          errText = "LLM nicht erreichbar. Skill wurde jedoch ausgefuehrt.\n\nFehler: " + err;
        }
        appendMessage("assistant", errText, Date.now(), true);
        callBackend("memory_add_message", {
          sessionId: settings.currentSession,
          role: "assistant",
          content: errText
        }).catch(function() {});
      });
    });
  }

  function buildLLMMessages(userText, skillResult, files) {
    var msgs = [];
    // System-Prompt
    var sysContent = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT_FALLBACK;
    msgs.push({ role: "system", content: sysContent });

    // Vergangene Nachrichten der Session (max 20)
    var sessionMsgs = getSessionMessages();
    var recent = sessionMsgs.slice(-20);
    recent.forEach(function(m) {
      msgs.push({ role: m.role === "user" ? "user" : "assistant", content: m.content });
    });

    // Skill-Result als Context
    if (skillResult && skillResult.matched) {
      var contextText = "Skill '" + skillResult.skill_name + "' wurde ausgefuehrt. Ergebnis:\n" + skillResult.result;
      msgs.push({ role: "system", content: contextText });
    }

    // Attached files
    if (files && files.length > 0) {
      var fileContext = "Der Nutzer hat folgende Dateien angehaengt:\n";
      files.forEach(function(f) {
        fileContext += "- " + f.name + " (Pfad: " + f.path + ")\n";
      });
      fileContext += "Du kannst auf diese Dateien zugreifen.";
      msgs.push({ role: "system", content: fileContext });
    }

    // User-Nachricht
    msgs.push({ role: "user", content: userText });

    return msgs;
  }

  function parseFallbackModels(str) {
    if (!str) return [];
    return str.split(",").map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  }

  // --- SLASH COMMANDS ---
  function handleSlashCommand(text) {
    var cmd = text.toLowerCase().trim();
    var parts = cmd.split(/\s+/);
    var command = parts[0];

    if (command === "/help") {
      appendMessage("assistant", "**Verfuegbare Befehle:**\n\n- /help — Diese Hilfe\n- /skills — Alle Skills anzeigen\n- /memory — Chat-Historie durchsuchen\n- /new — Neue Sitzung\n- /clear — Aktuelle Sitzung leeren\n- /settings — Einstellungen oeffnen\n\n**Skills (natuerlich eingeben):**\n- oeffne Safari / Terminal / Finder\n- screenshot\n- system info\n- lese datei /pfad\n- liste /verzeichnis\n- web suche begriff\n- datum / uhrzeit", Date.now(), true);
    } else if (command === "/skills") {
      switchView("skills");
    } else if (command === "/memory") {
      switchView("memory");
    } else if (command === "/new") {
      newSession();
    } else if (command === "/clear") {
      clearCurrentSession();
    } else if (command === "/settings") {
      switchView("settings");
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
    // Memory-Session loeschen und neue erstellen
    callBackend("memory_delete_session", { sessionId: sid }).then(function() {
      newSession();
    }).catch(function() {});
  }

  function selectSession(sid) {
    if (!sid) {
      newSession();
      return;
    }
    settings.currentSession = sid;
    setSetting(STORAGE_KEYS.currentSession, sid);
    loadMessagesForSession(sid);
  }

  // --- CHAT SETUP ---
  function setupChat() {
    var input = $("chatInput");
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener("input", function() { autoResize(input); });
    $("sendBtn").addEventListener("click", sendMessage);
    $("newSessionBtn").addEventListener("click", newSession);
    $("sessionSelect").addEventListener("change", function() {
      selectSession(this.value);
    });
    setupFileDrop();
  }

  function autoResize(input) {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  // --- MEMORY VIEW ---
  function setupMemory() {
    $("refreshMemoryBtn").addEventListener("click", loadMemory);
    $("memorySearch").addEventListener("input", function() {
      searchMemory(this.value);
    });
  }

  var allSessions = [];
  function loadMemory() {
    var list = $("memoryList");
    list.innerHTML = '<div class="empty-state"><p>Lade Memory...</p></div>';
    callBackend("memory_get_sessions", {}).then(function(result) {
      try {
        allSessions = JSON.parse(result);
        renderMemorySessions("");
      } catch (e) {
        list.innerHTML = '<div class="empty-state"><p>Keine Memory-Daten.</p></div>';
      }
    }).catch(function() {
      list.innerHTML = '<div class="empty-state"><p>Memory nicht verfuegbar.</p></div>';
    });
  }

  function renderMemorySessions(filter) {
    var list = $("memoryList");
    if (allSessions.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>Keine Sitzungen gefunden.</p></div>';
      return;
    }
    list.innerHTML = "";
    allSessions.forEach(function(s) {
      if (filter && s.name.toLowerCase().indexOf(filter) < 0) return;
      var item = document.createElement("div");
      item.className = "memory-item";
      var date = new Date(s.created_at * 1000).toLocaleString("de-DE");
      item.innerHTML = '<div class="memory-item-header"><span class="memory-hash">' + escapeHtml(s.name) + '</span><span class="memory-date">' + escapeHtml(date) + '</span></div><div class="memory-message">' + s.message_count + ' Nachrichten — <button class="btn-link memory-load" data-id="' + escapeHtml(s.id) + '">Laden</button> <button class="btn-link memory-delete" data-id="' + escapeHtml(s.id) + '">Loeschen</button></div>';
      list.appendChild(item);
    });
    list.querySelectorAll(".memory-load").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var sid = btn.getAttribute("data-id");
        settings.currentSession = sid;
        setSetting(STORAGE_KEYS.currentSession, sid);
        loadMessagesForSession(sid);
        switchView("chat");
      });
    });
    list.querySelectorAll(".memory-delete").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var sid = btn.getAttribute("data-id");
        if (!confirm("Sitzung wirklich loeschen?")) return;
        callBackend("memory_delete_session", { sessionId: sid }).then(function() {
          loadMemory();
        }).catch(function() {});
      });
    });
  }

  function searchMemory(query) {
    if (!query) {
      renderMemorySessions("");
      return;
    }
    var list = $("memoryList");
    list.innerHTML = '<div class="empty-state"><p>Suche...</p></div>';
    callBackend("memory_search", { query: query }).then(function(result) {
      try {
        var results = JSON.parse(result);
        if (results.length === 0) {
          list.innerHTML = '<div class="empty-state"><p>Keine Treffer fuer "' + escapeHtml(query) + '".</p></div>';
          return;
        }
        list.innerHTML = "";
        results.forEach(function(r) {
          var item = document.createElement("div");
          item.className = "memory-item";
          var date = new Date(r.timestamp * 1000).toLocaleString("de-DE");
          item.innerHTML = '<div class="memory-item-header"><span class="memory-hash">' + escapeHtml(r.session_name) + ' — ' + escapeHtml(r.role) + '</span><span class="memory-date">' + escapeHtml(date) + '</span></div><div class="memory-message">' + escapeHtml(r.content) + '</div>';
          list.appendChild(item);
        });
      } catch (e) {
        list.innerHTML = '<div class="empty-state"><p>Suchfehler.</p></div>';
      }
    }).catch(function() {
      list.innerHTML = '<div class="empty-state"><p>Suche fehlgeschlagen.</p></div>';
    });
  }

  // --- SKILLS VIEW ---
  function setupSettings() {
    // Settings wird in initSettings + setupSettings zusammen behandelt
  }

  function loadSkills() {
    var grid = $("skillsGrid");
    grid.innerHTML = '<div class="empty-state"><p>Lade Skills...</p></div>';
    callBackend("skills_list", {}).then(function(result) {
      try {
        var skills = JSON.parse(result);
        renderSkills(skills, "");
      } catch (e) {
        grid.innerHTML = '<div class="empty-state"><p>Skills nicht verfuegbar.</p></div>';
      }
    }).catch(function() {
      grid.innerHTML = '<div class="empty-state"><p>Skills nicht verfuegbar.</p></div>';
    });
  }

  function renderSkills(skills, filter) {
    var grid = $("skillsGrid");
    var count = $("skillsCount");
    var filtered = skills;
    if (filter) {
      var f = filter.toLowerCase();
      filtered = skills.filter(function(s) {
        return (s.name || "").toLowerCase().indexOf(f) >= 0 ||
               (s.description || "").toLowerCase().indexOf(f) >= 0 ||
               (s.category || "").toLowerCase().indexOf(f) >= 0;
      });
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
      card.innerHTML = '<div class="skill-name">' + escapeHtml(s.name) + sysBadge + '</div><div class="skill-desc">' + escapeHtml(s.description) + '</div><span class="skill-category">' + escapeHtml(s.category) + '</span>';
      grid.appendChild(card);
    });
  }

  // --- SETTINGS ---
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
    $("themeToggle").checked = settings.theme === "light";
    $("serverUrlDisplay").textContent = settings.apiUrl.replace("http://", "").replace("https://", "");
  }

  function saveSettings() {
    setSetting(STORAGE_KEYS.apiUrl, $("apiUrlInput").value || defaults.apiUrl);
    setSetting(STORAGE_KEYS.apiKey, $("apiKeyInput").value);
    // modelDisplay statt modelSelect
    var modelVal = $("modelDisplay").value.trim() || settings.model;
    setSetting(STORAGE_KEYS.model, modelVal);
    setSetting(STORAGE_KEYS.fallbackModels, $("fallbackModelsInput").value);
    setSetting(STORAGE_KEYS.temperature, $("tempSlider").value);
    setSetting(STORAGE_KEYS.maxTokens, $("tokensSlider").value);
    setSetting(STORAGE_KEYS.systemPrompt, $("systemPromptInput").value);
    setSetting(STORAGE_KEYS.systemAccess, $("systemAccessToggle").checked ? "true" : "false");
    setSetting(STORAGE_KEYS.skillsEnabled, $("skillsToggle").checked ? "true" : "false");
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
    settings.theme = getSetting(STORAGE_KEYS.theme, defaults.theme);

    $("serverUrlDisplay").textContent = settings.apiUrl.replace("http://", "").replace("https://", "");
    applyTheme();
    startStatusTimer();
  }

  function applyTheme() {
    if (settings.theme === "light") {
      document.body.setAttribute("data-theme", "light");
    } else {
      document.body.removeAttribute("data-theme");
    }
  }

  function setupSettingsEvents() {
    $("skillsSearch").addEventListener("input", function() {
      loadSkillsForSearch(this.value);
    });
    $("apiUrlInput").addEventListener("change", saveSettings);
    $("apiKeyInput").addEventListener("change", saveSettings);
    $("fallbackModelsInput").addEventListener("change", saveSettings);
    $("tempSlider").addEventListener("input", function() { $("tempValue").textContent = this.value; saveSettings(); });
    $("tokensSlider").addEventListener("input", function() { $("tokensValue").textContent = this.value; saveSettings(); });
    $("systemPromptInput").addEventListener("change", saveSettings);
    $("systemAccessToggle").addEventListener("change", saveSettings);
    $("skillsToggle").addEventListener("change", saveSettings);
    $("themeToggle").addEventListener("change", saveSettings);

    // Modell-Auswahl Modal in Settings
    $("settingsModelChooseBtn").addEventListener("click", function() {
      var url = $("apiUrlInput").value.trim();
      var key = $("apiKeyInput").value.trim();
      callBackend("ollama_list_models", { apiUrl: url, apiKey: key }).then(function(models) {
        if (models && models.length > 0) {
          openModelModal("settings", models);
        } else {
          $("settingsModelStatus").textContent = "Keine Modelle gefunden.";
          $("settingsModelStatus").className = "hint";
        }
      }).catch(function() {
        $("settingsModelStatus").textContent = "Modelle konnten nicht geladen werden.";
        $("settingsModelStatus").className = "hint";
      });
    });
    $("modelDisplay").addEventListener("click", function() {
      $("settingsModelChooseBtn").click();
    });

    // Ollama Connect in Settings
    $("openOllamaLoginBtn").addEventListener("click", function() {
      openOllamaConnectModal("settings");
    });

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
  }

  function loadSkillsForSearch(filter) {
    callBackend("skills_list", {}).then(function(result) {
      try {
        var skills = JSON.parse(result);
        renderSkills(skills, filter);
      } catch (e) {}
    }).catch(function() {});
  }

  function exportData() {
    callBackend("memory_get_sessions", {}).then(function(sessionsResult) {
      var exportObj = {
        app: "Titan Toti",
        version: "2.2.0",
        export_date: new Date().toISOString(),
        settings: {
          apiUrl: settings.apiUrl,
          model: settings.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens
        },
        sessions: JSON.parse(sessionsResult)
      };
      // Alle Nachrichten laden
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
    if (!confirm("Moechtest du wirklich alle Daten loeschen? Dies kann nicht rueckgaengig gemacht werden.")) return;
    callBackend("memory_clear_all", {}).then(function() {
      // localStorage auch leeren
      localStorage.removeItem(STORAGE_KEYS.currentSession);
      localStorage.removeItem(STORAGE_KEYS.setupDone);
      chatHistory = {};
      renderChatMessages();
      $("dsvoStatus").textContent = "Alle Daten geloescht!";
      $("dsvoStatus").className = "hint success";
      updateSessionSelect();
    }).catch(function(err) {
      $("dsvoStatus").textContent = "Fehler: " + err;
      $("dsvoStatus").className = "hint error";
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