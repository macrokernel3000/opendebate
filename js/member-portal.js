(function () {
  "use strict";

  const config = window.DEBATE_MEMBER_CONFIG || {};
  const status = document.querySelector("#memberPortalStatus");
  const link = document.querySelector("#memberPortalLink");
  const navLinks = document.querySelectorAll("[data-member-portal-link]");

  function isSafePortalUrl(value) {
    try {
      return new URL(value).protocol === "https:";
    } catch (_error) {
      return false;
    }
  }

  if (config.enabled === true && isSafePortalUrl(config.portalUrl)) {
    navLinks.forEach((navLink) => {
      navLink.href = config.portalUrl;
      navLink.hidden = false;
    });
    if (status && link) {
      status.textContent = "會員入口已開放。登入後可保存自己的紀錄，並把資料送入私人待審區。";
      link.href = config.portalUrl;
      link.textContent = `使用 ${config.label || "會員帳號"} 登入`;
      link.removeAttribute("aria-disabled");
      link.classList.remove("is-disabled");
    }
    return;
  }

  navLinks.forEach((navLink) => {
    navLink.hidden = false;
  });

  if (status && link) {
    status.textContent = "會員後台正在私人環境驗證。正式 LINE 登入完成安全驗收前不會開放。";
    link.removeAttribute("href");
    link.setAttribute("aria-disabled", "true");
    link.classList.add("is-disabled");
  }
}
)();
