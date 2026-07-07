// Titan Toti — Frontend Logik
// Vanilla JS — KEINE Backticks, KEINE Frameworks

(function() {
  "use strict";

  // --- STORAGE ---
  var STORAGE_KEYS = {
    serverUrl: "titantoti_server_url",
    inviteToken: "titantoti_invite_token",
    inviteCode: "titantoti_invite_code",
    inviteLabel: "titantoti_invite_label",
    model: "titantoti_model",
    temperature: "titantoti_temperature",
    maxTokens: "titantoti_max_tokens",
    theme: "titantoti_theme",
    chatHistory: "titantoti_chat_history",
    sessions: "titantoti_sessions",
    currentSession: "titantoti_current_session"
  };

  // Default-Einstellungen
  var defaults = {
    serverUrl: "http://localhost:8460",
    model: "glm-5.2:cloud",
    temperature: 0.7,
    maxTokens: 8192,
    theme: "dark"
  };

  // Settings laden
  function getSetting(key, fallback) {
    var val = localStorage.getItem(key);
    if (val === null || val === undefined || val === "") return fallback;
    return val;
  }

  function getSettingNum(key, fallback) {
    var val = localStorage.getItem(key);
    if (val === null || val === undefined || val === "") return fallback;
    var num = parseFloat(val);
    return isNaN(num) ? fallback : num;
  }

  function setSetting(key, val) {
    localStorage.setItem(key, val);
  }

  // Aktuelle Settings
  var settings = {
    serverUrl: getSetting(STORAGE_KEYS.serverUrl, defaults.serverUrl),
    inviteToken: getSetting(STORAGE_KEYS.inviteToken, ""),
    inviteCode: getSetting(STORAGE_KEYS.inviteCode, ""),
    inviteLabel: getSetting(STORAGE_KEYS.inviteLabel, ""),
    model: getSetting(STORAGE_KEYS.model, defaults.model),
    temperature: getSettingNum(STORAGE_KEYS.temperature, defaults.temperature),
    maxTokens: getSettingNum(STORAGE_KEYS.maxTokens, defaults.maxTokens),
    theme: getSetting(STORAGE_KEYS.theme, defaults.theme),
    currentSession: getSetting(STORAGE_KEYS.currentSession, "")
  };

  // Chat-Historie laden (alle Sessions)
  var chatHistory = {};
  try {
    var raw = localStorage.getItem(STORAGE_KEYS.chatHistory);
    if (raw) chatHistory = JSON.parse(raw);
  } catch (e) {
    chatHistory = {};
  }

  var sessions = [];
  try {
    var rawSessions = localStorage.getItem(STORAGE_KEYS.sessions);
    if (rawSessions) sessions = JSON.parse(rawSessions);
  } catch (e) {
    sessions = [];
  }

  // --- TAUURI BRIDGE ---
  var invoke = null;
  if (typeof window.__TAURI__ !== "undefined" && window.__TAURI__.core) {
    invoke = window.__TAURI__.core.invoke;
  } else if (typeof window.__TAURI_INVOKE__ === "function") {
    invoke = window.__TAURI_INVOKE__;
  }

  // Fallback fuer Dev (ohne Tauri): direkter fetch
  function callBackend(cmd, args) {
    if (invoke) {
      return invoke(cmd, args);
    }
    // Dev-Modus ohne Tauri: direkter HTTP-Call
    return devFallback(cmd, args);
  }

  function devFallback(cmd, args) {
    return new Promise(function(resolve, reject) {
      var serverUrl = settings.serverUrl;
      var url = serverUrl.replace(/\/$/, "");
      if (cmd === "health_check") {
        fetch(url + "/health").then(function(r){resolve(r.ok);}).catch(function(){resolve(false);});
      } else if (cmd === "health_status") {
        fetch(url + "/health").then(function(r){return r.text();}).then(function(t){resolve(t);}).catch(function(e){reject(e.toString());});
      } else if (cmd === "invite") {
        fetch(url + "/api/invite", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:args.code})})
          .then(function(r){return r.text();}).then(function(t){resolve(t);}).catch(function(e){reject(e.toString());});
      } else if (cmd === "chat_send") {
        fetch(url + "/api/chat", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:args.message, session_id:args.session_id, invite_token:args.invite_token, user_name:args.user_name})})
          .then(function(r){return r.text();}).then(function(t){resolve(t);}).catch(function(e){reject(e.toString());});
      } else if (cmd === "logout") {
        fetch(url + "/api/logout", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({invite_token:args.invite_token})})
          .then(function(r){resolve(r.ok);}).catch(function(){resolve(false);});
      } else if (cmd === "export_data") {
        fetch(url + "/api/export-data", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({invite_token:args.invite_token})})
          .then(function(r){return r.text();}).then(function(t){resolve(t);}).catch(function(e){reject(e.toString());});
      } else if (cmd === "delete_data") {
        fetch(url + "/api/delete-data", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({invite_token:args.invite_token})})
          .then(function(r){resolve(r.ok);}).catch(function(){resolve(false);});
      } else if (cmd === "get_memory" || cmd === "get_skills" || cmd === "privacy_settings") {
        var endpoint = cmd === "get_memory" ? "/api/memory" : (cmd === "get_skills" ? "/api/skills" : "/api/privacy-settings");
        fetch(url + endpoint).then(function(r){return r.text();}).then(function(t){resolve(t);}).catch(function(e){reject(e.toString());});
      } else if (cmd === "app_version") {
        resolve("1.0.0");
      } else {
        reject("Unknown command: " + cmd);
      }
    });
  }

  // --- DOM ELEMENTS ---
  var el = {};
  function $(id) { return document.getElementById(id); }
  function $$(sel) { return document.querySelectorAll(sel); }

  // --- HELPER ---
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
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
    // Code-Blocks (triple backtick)
    var codeBlocks = [];
    var codeRegex = /```(\w*)\n([\s\S]*?)```/g;
    html = html.replace(codeRegex, function(match, lang, code) {
      var idx = codeBlocks.length;
      var langLabel = lang || "code";
      codeBlocks.push({lang: langLabel, code: code});
      return "@@CODEBLOCK_" + idx + "@@";
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, function(m, c) {
      return "<code>" + escapeHtml(c) + "</code>";
    });
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Autolinks
    html = html.replace(/(^|[^"=])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    // Listen (unordered)
    html = html.replace(/^[\*\-]\s+(.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
    // Absaetze
    var parts = html.split(/\n\n+/);
    html = parts.map(function(p) {
      if (p.indexOf("<ul>") === 0 || p.indexOf("<ol>") === 0) return p;
      if (p.indexOf("@@CODEBLOCK_") >= 0) return p;
      return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
    }).join("\n");
    // Code-Blocks wieder einfuegen
    html = html.replace(/@@CODEBLOCK_(\d+)@@/g, function(match, idx) {
      var block = codeBlocks[parseInt(idx, 10)];
      if (!block) return match;
      return '<div class="code-block"><div class="code-block-header"><span>' + block.lang + '</span><button class="copy-btn" data-code="' + encodeURIComponent(block.code) + '">Kopieren</button></div><pre>' + escapeHtml(block.code) + '</pre></div>';
    });
    return html;
  }

  // --- NAVIGATION ---
  function switchView(view) {
    $$(".view").forEach(function(v) { v.classList.remove("active"); });
    $$(".nav-item").forEach(function(n) { n.classList.remove("active"); });
    $("view-" + view).classList.add("active");
    var navBtn = document.querySelector('.nav-item[data-view="' + view + '"]');
    if (navBtn) navBtn.classList.add("active");
    if (view === "memory") loadMemory();
    if (view === "skills") loadSkills();
  }

  // --- STATUS CHECK ---
  var statusTimer = null;
  function checkStatus() {
    var dot = $("statusDot");
    var text = $("statusText");
    if (dot) {
      dot.className = "status-dot checking";
      text.textContent = "Pruefe Status...";
    }
    callBackend("health_check", { serverUrl: settings.serverUrl }).then(function(ok) {
      if (dot) {
        dot.className = "status-dot " + (ok ? "online" : "offline");
        text.textContent = ok ? "Online" : "Offline";
      }
    }).catch(function() {
      if (dot) {
        dot.className = "status-dot offline";
        text.textContent = "Offline";
      }
    });
  }

  function startStatusTimer() {
    checkStatus();
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(checkStatus, 30000);
  }

  // --- CHAT ---
  function getSessionMessages() {
    var sid = settings.currentSession;
    if (!sid) return [];
    return chatHistory[sid] || [];
  }

  function saveChatHistory() {
    localStorage.setItem(STORAGE_KEYS.chatHistory, JSON.stringify(chatHistory));
  }

  function renderChatMessages() {
    var container = $("chatMessages");
    var welcome = $("chatWelcome");
    var messages = getSessionMessages();
    if (messages.length === 0) {
      if (welcome) welcome.style.display = "flex";
      container.querySelectorAll(".message").forEach(function(m) { m.remove(); });
      return;
    }
    if (welcome) welcome.style.display = "none";
    container.querySelectorAll(".message").forEach(function(m) { m.remove(); });
    messages.forEach(function(msg) {
      appendMessage(msg.role, msg.content, msg.ts, false);
    });
    scrollToBottom();
  }

  function appendMessage(role, content, ts, animate) {
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
    contentWrap.appendChild(body);
    msg.appendChild(avatar);
    msg.appendChild(contentWrap);
    container.appendChild(msg);
    if (animate !== false) scrollToBottom();
    // Copy-Buttons fuer Code-Blocks
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

  function sendMessage() {
    var input = $("chatInput");
    var text = input.value.trim();
    if (!text) return;
    if (!settings.inviteToken) {
      alert("Bitte gib zuerst in den Einstellungen deinen Invite-Code ein und verbinde dich.");
      switchView("settings");
      return;
    }
    // Session erstellen falls keine
    if (!settings.currentSession) {
      settings.currentSession = generateId();
      setSetting(STORAGE_KEYS.currentSession, settings.currentSession);
      sessions.push({id: settings.currentSession, name: "Sitzung " + (sessions.length + 1), created: Date.now()});
      saveSessions();
      updateSessionSelect();
    }
    // Nachricht zum Verlauf hinzufuegen
    var ts = Date.now();
    if (!chatHistory[settings.currentSession]) chatHistory[settings.currentSession] = [];
    chatHistory[settings.currentSession].push({role: "user", content: text, ts: ts});
    saveChatHistory();
    appendMessage("user", text, ts, true);
    input.value = "";
    input.style.height = "auto";
    // Typing-Indicator
    $("typingIndicator").style.display = "flex";
    scrollToBottom();
    // An Backend senden
    callBackend("chat_send", {
      message: text,
      session_id: settings.currentSession,
      invite_token: settings.inviteToken,
      user_name: "Tito",
      server_url: settings.serverUrl
    }).then(function(result) {
      $("typingIndicator").style.display = "none";
      try {
        var data = JSON.parse(result);
        var responseText = data.response || "Keine Antwort erhalten.";
        chatHistory[settings.currentSession].push({role: "assistant", content: responseText, ts: Date.now()});
        saveChatHistory();
        appendMessage("assistant", responseText, Date.now(), true);
      } catch (e) {
        appendMessage("assistant", "Fehler beim Verarbeiten der Antwort.", Date.now(), true);
      }
    }).catch(function(err) {
      $("typingIndicator").style.display = "none";
      appendMessage("assistant", "Verbindungsfehler: " + err, Date.now(), true);
    });
  }

  // --- SESSIONS ---
  function saveSessions() {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
  }

  function updateSessionSelect() {
    var select = $("sessionSelect");
    select.innerHTML = '<option value="">Neue Sitzung</option>';
    sessions.forEach(function(s) {
      var opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id === settings.currentSession) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function newSession() {
    settings.currentSession = generateId();
    setSetting(STORAGE_KEYS.currentSession, settings.currentSession);
    sessions.push({id: settings.currentSession, name: "Sitzung " + (sessions.length + 1), created: Date.now()});
    saveSessions();
    updateSessionSelect();
    renderChatMessages();
  }

  function selectSession(sid) {
    settings.currentSession = sid;
    setSetting(STORAGE_KEYS.currentSession, sid);
    renderChatMessages();
    updateSessionSelect();
  }

  // --- MEMORY ---
  var memoryData = [];
  function loadMemory() {
    var list = $("memoryList");
    list.innerHTML = '<div class="empty-state"><p>Lade Memory-Eintraege...</p></div>';
    callBackend("get_memory", { serverUrl: settings.serverUrl }).then(function(result) {
      try {
        var data = JSON.parse(result);
        if (Array.isArray(data)) {
          memoryData = data;
        } else if (data && data.commits) {
          memoryData = data.commits;
        } else {
          memoryData = [];
        }
        renderMemory("");
      } catch (e) {
        list.innerHTML = '<div class="empty-state"><p>Memory nicht verfuegbar.</p><p style="margin-top:8px;font-size:12px;">Der Memory-Endpunkt ist derzeit nicht aktiv.</p></div>';
      }
    }).catch(function() {
      list.innerHTML = '<div class="empty-state"><p>Memory nicht verfuegbar.</p><p style="margin-top:8px;font-size:12px;">Titan-Toti ist offline oder der Endpunkt existiert nicht.</p></div>';
    });
  }

  function renderMemory(filter) {
    var list = $("memoryList");
    var filtered = memoryData;
    if (filter) {
      filter = filter.toLowerCase();
      filtered = memoryData.filter(function(m) {
        return (m.message || m.hash || "").toLowerCase().indexOf(filter) >= 0;
      });
    }
    if (filtered.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>Keine Memory-Eintraege gefunden.</p></div>';
      return;
    }
    list.innerHTML = "";
    filtered.forEach(function(m) {
      var item = document.createElement("div");
      item.className = "memory-item";
      var hash = m.hash || m.id || "—";
      var msg = m.message || m.title || m.summary || "Kein Inhalt";
      var date = m.date || m.timestamp || m.created || "";
      if (typeof date === "number") date = new Date(date * 1000).toLocaleString("de-DE");
      item.innerHTML = '<div class="memory-item-header"><span class="memory-hash">' + escapeHtml(hash.substring(0, 12)) + '</span><span class="memory-date">' + escapeHtml(date) + '</span></div><div class="memory-message">' + escapeHtml(msg) + '</div>';
      list.appendChild(item);
    });
  }

  // --- SKILLS ---
  var skillsData = [];
  function loadSkills() {
    var grid = $("skillsGrid");
    grid.innerHTML = '<div class="empty-state"><p>Lade Skills...</p></div>';
    callBackend("get_skills", { serverUrl: settings.serverUrl }).then(function(result) {
      try {
        var data = JSON.parse(result);
        if (Array.isArray(data)) {
          skillsData = data;
        } else if (data && data.skills) {
          skillsData = data.skills;
        } else {
          skillsData = [];
        }
        renderSkills("");
      } catch (e) {
        grid.innerHTML = '<div class="empty-state"><p>Skills nicht verfuegbar.</p></div>';
      }
    }).catch(function() {
      grid.innerHTML = '<div class="empty-state"><p>Skills nicht verfuegbar.</p><p style="margin-top:8px;font-size:12px;">Titan-Toti ist offline.</p></div>';
    });
  }

  function renderSkills(filter) {
    var grid = $("skillsGrid");
    var count = $("skillsCount");
    var filtered = skillsData;
    if (filter) {
      filter = filter.toLowerCase();
      filtered = skillsData.filter(function(s) {
        var name = s.name || s.title || "";
        var desc = s.description || s.desc || "";
        var cat = s.category || "";
        return name.toLowerCase().indexOf(filter) >= 0 || desc.toLowerCase().indexOf(filter) >= 0 || cat.toLowerCase().indexOf(filter) >= 0;
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
      var name = s.name || s.title || "Skill";
      var desc = s.description || s.desc || "Keine Beschreibung";
      var cat = s.category || "Allgemein";
      card.innerHTML = '<div class="skill-name">' + escapeHtml(name) + '</div><div class="skill-desc">' + escapeHtml(desc) + '</div><span class="skill-category">' + escapeHtml(cat) + '</span>';
      grid.appendChild(card);
    });
  }

  // --- SETTINGS ---
  function initSettings() {
    $("serverUrlInput").value = settings.serverUrl;
    $("inviteCodeInput").value = settings.inviteCode;
    $("modelSelect").value = settings.model;
    $("tempSlider").value = settings.temperature;
    $("tempValue").textContent = settings.temperature;
    $("tokensSlider").value = settings.maxTokens;
    $("tokensValue").textContent = settings.maxTokens;
    $("themeToggle").checked = settings.theme === "light";
    $("serverUrlDisplay").textContent = settings.serverUrl.replace("http://", "").replace("https://", "");
    if (settings.inviteLabel) {
      $("connectStatus").textContent = "Verbunden als: " + settings.inviteLabel;
      $("connectStatus").className = "hint success";
    }
  }

  function saveSettings() {
    setSetting(STORAGE_KEYS.serverUrl, $("serverUrlInput").value || defaults.serverUrl);
    setSetting(STORAGE_KEYS.model, $("modelSelect").value);
    setSetting(STORAGE_KEYS.temperature, $("tempSlider").value);
    setSetting(STORAGE_KEYS.maxTokens, $("tokensSlider").value);
    var theme = $("themeToggle").checked ? "light" : "dark";
    setSetting(STORAGE_KEYS.theme, theme);
    settings.serverUrl = getSetting(STORAGE_KEYS.serverUrl, defaults.serverUrl);
    settings.model = getSetting(STORAGE_KEYS.model, defaults.model);
    settings.temperature = getSettingNum(STORAGE_KEYS.temperature, defaults.temperature);
    settings.maxTokens = getSettingNum(STORAGE_KEYS.maxTokens, defaults.maxTokens);
    settings.theme = getSetting(STORAGE_KEYS.theme, defaults.theme);
    $("serverUrlDisplay").textContent = settings.serverUrl.replace("http://", "").replace("https://", "");
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

  function connectInvite() {
    var code = $("inviteCodeInput").value.trim();
    if (!code) {
      $("connectStatus").textContent = "Bitte Invite-Code eingeben.";
      $("connectStatus").className = "hint error";
      return;
    }
    $("connectBtn").disabled = true;
    $("connectStatus").textContent = "Verbinde...";
    $("connectStatus").className = "hint";
    callBackend("invite", { code: code, serverUrl: settings.serverUrl }).then(function(result) {
      $("connectBtn").disabled = false;
      try {
        var data = JSON.parse(result);
        if (data.valid) {
          settings.inviteToken = data.token;
          settings.inviteCode = code;
          settings.inviteLabel = data.label || code;
          setSetting(STORAGE_KEYS.inviteToken, data.token);
          setSetting(STORAGE_KEYS.inviteCode, code);
          setSetting(STORAGE_KEYS.inviteLabel, settings.inviteLabel);
          $("connectStatus").textContent = "Verbunden als: " + settings.inviteLabel + " (Limit: " + data.daily_limit + "/h)";
          $("connectStatus").className = "hint success";
        } else {
          $("connectStatus").textContent = "Code abgelehnt.";
          $("connectStatus").className = "hint error";
        }
      } catch (e) {
        $("connectStatus").textContent = "Verbindungsfehler: " + result;
        $("connectStatus").className = "hint error";
      }
    }).catch(function(err) {
      $("connectBtn").disabled = false;
      $("connectStatus").textContent = "Fehler: " + err;
      $("connectStatus").className = "hint error";
    });
  }

  function testConnection() {
    $("testConnStatus").textContent = "Teste...";
    $("testConnStatus").className = "hint";
    callBackend("health_check", { serverUrl: $("serverUrlInput").value || settings.serverUrl }).then(function(ok) {
      $("testConnStatus").textContent = ok ? "Verbindung erfolgreich!" : "Titan-Toti nicht erreichbar.";
      $("testConnStatus").className = "hint " + (ok ? "success" : "error");
    }).catch(function(err) {
      $("testConnStatus").textContent = "Fehler: " + err;
      $("testConnStatus").className = "hint error";
    });
  }

  function doLogout() {
    if (!settings.inviteToken) {
      $("logoutStatus").textContent = "Nicht angemeldet.";
      $("logoutStatus").className = "hint";
      return;
    }
    callBackend("logout", { invite_token: settings.inviteToken, serverUrl: settings.serverUrl }).then(function() {
      settings.inviteToken = "";
      settings.inviteLabel = "";
      localStorage.removeItem(STORAGE_KEYS.inviteToken);
      localStorage.removeItem(STORAGE_KEYS.inviteLabel);
      $("logoutStatus").textContent = "Abgemeldet.";
      $("logoutStatus").className = "hint success";
      $("connectStatus").textContent = "";
    }).catch(function(err) {
      $("logoutStatus").textContent = "Fehler: " + err;
      $("logoutStatus").className = "hint error";
    });
  }

  function exportData() {
    if (!settings.inviteToken) {
      $("dsvoStatus").textContent = "Bitte zuerst verbinden.";
      $("dsvoStatus").className = "hint error";
      return;
    }
    callBackend("export_data", { invite_token: settings.inviteToken, serverUrl: settings.serverUrl }).then(function(result) {
      var blob = new Blob([result], {type: "application/json"});
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "titan-toti-export.json";
      a.click();
      URL.revokeObjectURL(url);
      $("dsvoStatus").textContent = "Daten exportiert!";
      $("dsvoStatus").className = "hint success";
    }).catch(function(err) {
      $("dsvoStatus").textContent = "Fehler: " + err;
      $("dsvoStatus").className = "hint error";
    });
  }

  function deleteData() {
    if (!settings.inviteToken) {
      $("dsvoStatus").textContent = "Bitte zuerst verbinden.";
      $("dsvoStatus").className = "hint error";
      return;
    }
    if (!confirm("Moechtest du wirklich alle deine Daten loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.")) return;
    callBackend("delete_data", { invite_token: settings.inviteToken, serverUrl: settings.serverUrl }).then(function(ok) {
      if (ok) {
        $("dsvoStatus").textContent = "Daten geloescht!";
        $("dsvoStatus").className = "hint success";
      } else {
        $("dsvoStatus").textContent = "Loeschung fehlgeschlagen.";
        $("dsvoStatus").className = "hint error";
      }
    }).catch(function(err) {
      $("dsvoStatus").textContent = "Fehler: " + err;
      $("dsvoStatus").className = "hint error";
    });
  }

  // --- AUTO-RESIZE TEXTAREA ---
  function autoResize(input) {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  // --- INIT ---
  function init() {
    // Theme
    applyTheme();
    // Settings
    initSettings();
    // Version
    callBackend("app_version", {}).then(function(v) {
      $("appVersion").textContent = "v" + v;
    }).catch(function() {});
    // Session-Auswahl
    updateSessionSelect();
    // Chat rendern
    renderChatMessages();
    // Status-Check starten
    startStatusTimer();

    // Navigation
    $$(".nav-item").forEach(function(btn) {
      btn.addEventListener("click", function() {
        switchView(btn.getAttribute("data-view"));
      });
    });

    // Chat
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

    // Memory
    $("refreshMemoryBtn").addEventListener("click", loadMemory);
    $("memorySearch").addEventListener("input", function() {
      renderMemory(this.value);
    });

    // Skills
    $("skillsSearch").addEventListener("input", function() {
      renderSkills(this.value);
    });

    // Settings
    $("serverUrlInput").addEventListener("change", saveSettings);
    $("modelSelect").addEventListener("change", saveSettings);
    $("tempSlider").addEventListener("input", function() {
      $("tempValue").textContent = this.value;
      saveSettings();
    });
    $("tokensSlider").addEventListener("input", function() {
      $("tokensValue").textContent = this.value;
      saveSettings();
    });
    $("themeToggle").addEventListener("change", saveSettings);
    $("connectBtn").addEventListener("click", connectInvite);
    $("testConnBtn").addEventListener("click", testConnection);
    $("logoutBtn").addEventListener("click", doLogout);
    $("exportDataBtn").addEventListener("click", exportData);
    $("deleteDataBtn").addEventListener("click", deleteData);
  }

  // DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();