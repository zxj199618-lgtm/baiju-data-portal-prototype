/**
 * 网关登录态（浏览器端）
 *
 * - 账号密码登录 POST /v1/auth/login：页面与网关同源时令牌只存在 httpOnly cookie（脚本读不到，12 小时过期），
 *   localStorage 里只留账号名和「已登录」标记；跨域访问网关（本地开发等）才把令牌存 localStorage 并带 Authorization 头
 * - 所有发往网关 /v1/ 的请求自动带 Authorization 头；返回 401 时回到登录页
 * - 必须在 portal-bridge.js 之前加载：启动时没有令牌就不进入系统
 */
(() => {
  const TOKEN_KEY = "portalAuthToken";
  const USER_KEY = "portalLoginUser";
  const FLAG_KEY = "portalDemoUser";
  const LAST_NAME_KEY = "portalLastLoginName";

  function gatewayBase() {
    // 与 portal/core.js 的 analysisGatewayBase 保持一致
    try {
      if (window.PORTAL_GATEWAY_BASE !== undefined) return String(window.PORTAL_GATEWAY_BASE).replace(/\/$/, "");
    } catch (error) { /* 忽略 */ }
    try {
      const override = localStorage.getItem("portalGatewayBase");
      if (override !== null) return override.replace(/\/$/, "");
    } catch (error) { /* 隐私模式 */ }
    return "http://localhost:8787";
  }

  const nativeFetch = window.fetch.bind(window);

  const VISITOR_KEY = "portalVisitorId";

  /** 每个浏览器一个随机访客 id（只在网关开启演示登录时才被采用，用来让共用演示账号的访客互相隔离） */
  function visitorId() {
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch (error) { return ""; }
  }

  /** 页面与网关同源（网关托管页面时 PORTAL_GATEWAY_BASE 为空串）：用 httpOnly cookie，不在页面里保存令牌 */
  function sameOriginGateway() {
    const base = gatewayBase();
    return base === "" || base === location.origin;
  }

  function readStorage(key) {
    try { return localStorage.getItem(key) || ""; } catch (error) { return ""; }
  }

  function writeSession(token, name) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
      localStorage.setItem(USER_KEY, name);
      localStorage.setItem(FLAG_KEY, "1");
    } catch (error) { /* 隐私模式下无法保存，登录只在本页有效 */ }
  }

  function clearSession() {
    // 同时让网关清掉 cookie（cookie 是 httpOnly，只能由服务端清除）
    try { if (sameOriginGateway()) nativeFetch(`${gatewayBase()}/v1/auth/logout`, { method: "POST" }).catch(() => {}); } catch (error) { /* 忽略 */ }
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(FLAG_KEY);
    } catch (error) { /* 忽略 */ }
  }

  function showLogin(message) {
    document.getElementById("portalApp")?.classList.add("hidden");
    document.getElementById("sidebar")?.classList.add("hidden");
    document.getElementById("loginView")?.classList.remove("hidden");
    const error = document.getElementById("gatewayLoginError");
    // 只有带内容的提示才写入：令牌被清掉后，页面里后发出的请求（没有令牌）也会收到 401 并再次调用这里，
    // 它们不能把第一次写入的「登录已过期」提示冲掉
    if (error && message) {
      error.textContent = message;
      error.hidden = false;
    }
  }

  // 对外暴露给页面脚本（退出登录时清除令牌）
  window.portalAuth = {
    // 页面脚本只用它判断「是否已登录」：同源模式下令牌在 httpOnly cookie 里，这里返回占位值
    token: () => readStorage(TOKEN_KEY) || (sameOriginGateway() && readStorage(FLAG_KEY) ? "cookie" : ""),
    user: () => readStorage(USER_KEY),
    clear: clearSession
  };

  // 启动：没有令牌就不保留「已登录」标记，让页面停在登录页
  if (!window.portalAuth.token()) clearSession();

  // 给网关请求自动加令牌；过期或无效（401）时清除登录态并回到登录页
  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const base = gatewayBase();
    const isGateway = base ? url.startsWith(base + "/v1/") : url.startsWith("/v1/");
    if (!isGateway) return nativeFetch(input, init);
    const headers = new Headers(init.headers || {});
    const token = window.portalAuth.token();
    if (token && token !== "cookie") headers.set("Authorization", `Bearer ${token}`);
    const visitor = visitorId();
    if (visitor) headers.set("X-Visitor-Id", visitor);
    return nativeFetch(input, { ...init, headers }).then(response => {
      if (response.status === 401 && !url.endsWith("/v1/auth/login")) {
        // 只有「曾经登录过、令牌失效」才提示过期；首次访问的 401 直接停在登录页
        clearSession();
        showLogin(token ? "登录已过期，请重新登录" : "");
      }
      return response;
    });
  };

  // 登录表单 + 页头显示当前登录账号
  document.addEventListener("DOMContentLoaded", () => {
    const loginName = readStorage(USER_KEY);
    if (loginName) {
      const nameEl = document.getElementById("headerUserName");
      const avatarEl = document.getElementById("headerUserAvatar");
      if (nameEl) nameEl.textContent = loginName;
      if (avatarEl) avatarEl.textContent = loginName.slice(0, 1);
    }
    const form = document.getElementById("gatewayLoginForm");
    if (!form) return;
    const error = document.getElementById("gatewayLoginError");
    const submit = document.getElementById("gatewayLoginBtn");
    const showNotice = (message, info = false) => {
      if (!error) return;
      error.textContent = message;
      error.hidden = !message;
      error.classList.toggle("info", info);
    };

    // 默认停在「密码登录」；扫码登录尚未接入，点击只给出提示，不切走表单
    document.querySelectorAll("[data-login-tab]").forEach(tab => {
      tab.addEventListener("click", () => {
        if (tab.dataset.loginTab === "qr") showNotice("扫码登录尚未接入，请使用账号密码登录", true);
        else showNotice("");
      });
    });

    // 记住上次登录的账号（只记账号，不记密码）：下次直接聚焦到密码框
    try {
      const last = localStorage.getItem(LAST_NAME_KEY);
      if (last && !form.elements.name.value) form.elements.name.value = last;
      (last ? form.elements.password : form.elements.name).focus();
    } catch (storageError) { /* 隐私模式 */ }

    // 本地演示：网关用 PORTAL_DEMO_LOGIN_PASSWORD 启动时，给出账号快捷按钮，点一下自动填好并登录
    nativeFetch(`${gatewayBase()}/v1/auth/demo`).then(response => (response.ok ? response.json() : null)).then(demo => {
      const box = document.getElementById("gatewayLoginDemo");
      if (!demo || !box || !Array.isArray(demo.accounts)) return;
      box.hidden = false;
      box.innerHTML = '<span>本地演示账号（点击直接登录）</span><div class="chips"></div>';
      const chips = box.querySelector(".chips");
      demo.accounts.forEach(account => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.textContent = account.name + (account.role === "admin" ? "（管理员）" : "");
        chip.addEventListener("click", () => {
          form.elements.name.value = account.name;
          form.elements.password.value = demo.password;
          form.requestSubmit();
        });
        chips.appendChild(chip);
      });
    }).catch(() => { /* 未开启演示登录或网关不可达：保持普通登录页 */ });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const name = form.elements.name.value.trim();
      const password = form.elements.password.value;
      if (!name || !password) return;
      submit.disabled = true;
      try {
        const response = await nativeFetch(`${gatewayBase()}/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, password })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (error) { error.textContent = data.error || "登录失败"; error.hidden = false; }
          return;
        }
        writeSession(sameOriginGateway() ? "" : data.token, data.user.name);
        try { localStorage.setItem(LAST_NAME_KEY, data.user.name); } catch (storageError) { /* 忽略 */ }
        // 重新加载，让启动流程以已登录身份进入系统（保留 #page= 等地址）
        location.reload();
      } catch (networkError) {
        if (error) { error.textContent = "无法连接分析网关，请检查网关是否启动"; error.hidden = false; }
      } finally {
        submit.disabled = false;
      }
    });
  });
})();
