(function () {
  if (window.__homexperiaLoaded) return;
  window.__homexperiaLoaded = true;

  const DEFAULT_CONFIG = {
    targetUrl: "https://dev.homexperia.com",
    buttonText: "View in Your Room",
    modalTitle: "Homexperia AI",
    placementSelector: 'form[action*="/cart/add"]',
    placementMode: "after"
  };

  let CONFIG = DEFAULT_CONFIG;

  function readExtensionConfig() {
    const node = document.getElementById("homexperia-extension-config");

    if (!node) return {};

    try {
      return JSON.parse(node.textContent) || {};
    } catch (error) {
      console.warn("[Homexperia] Ignoring invalid extension config.", error);
      return {};
    }
  }

  function resolveConfig() {
    window.HOMEXPERIA_CONFIG = {
      ...DEFAULT_CONFIG,
      ...(window.HOMEXPERIA_CONFIG || {}),
      ...readExtensionConfig()
    };

    return window.HOMEXPERIA_CONFIG;
  }

  function isProductPage() {
    return window.location.pathname.includes("/products/");
  }

  function createButton() {
    const btn = document.createElement("button");
    btn.innerText = CONFIG.buttonText;

    btn.style.cssText = `
      width: 100%;
      padding: 14px 20px;
      background: #284323;
      color: #f1f4f0;
      border: 1px solid #284323;
      border-radius: 8px;
      cursor: pointer;
      margin: 10px 0px;
      font-size: 16px;
    `;

    return btn;
  }

  function createModal() {
    const modal = document.createElement("div");
    modal.id = "homexperia-modal";

    modal.innerHTML = `
      <div class="homexperia-content">
        <div class="homexperia-header">
          <span>${CONFIG.modalTitle}</span>
          <button id="homexperia-close" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <iframe id="homexperia-iframe"></iframe>
      </div>
    `;

    const style = document.createElement("style");
    style.innerHTML = `
      #homexperia-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 999999;
        align-items: center;
        justify-content: center;
        isolation: isolate;
      }

      #homexperia-modal.active {
        display: flex;
      }

      .homexperia-content {
        position: relative;
        width: 90%;
        height: 90%;
        background-color: #ffffff;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
      }

      .homexperia-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        background-color: #f1f4f0;
        border-bottom: 1px solid #e6e6e6;
      }

      .homexperia-header span {
        font-size: 18px;
        color: #0a1109;
        font-weight: 500;
      }

      #homexperia-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: 5px;
        color: #0a1109;
        opacity: 0.7;
        transition: opacity 0.3s ease;
      }

      #homexperia-close:hover {
        opacity: 1;
      }

      #homexperia-iframe {
        width: 100%;
        height: calc(100% - 70px);
        border: none;
      }

      @media screen and (max-width: 768px) {
        .homexperia-content {
          width: 95%;
          height: 90%;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);

    return modal;
  }

  function openModal() {
    const modal = document.getElementById("homexperia-modal");
    const iframe = document.getElementById("homexperia-iframe");

    let url = CONFIG.targetUrl;

    iframe.src = url;
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const modal = document.getElementById("homexperia-modal");
    const iframe = document.getElementById("homexperia-iframe");

    modal.classList.remove("active");
    iframe.src = "";
    document.body.style.overflow = "";
  }

  function insertButton(btn) {
    const target = document.querySelector(CONFIG.placementSelector);

    if (target) {
      switch (CONFIG.placementMode) {
        case "before":
          target.parentNode.insertBefore(btn, target);
          break;
        case "inside":
          target.appendChild(btn);
          break;
        case "after":
        default:
          target.insertAdjacentElement("afterend", btn);
          break;
      }
      return;
    }

    document.body.appendChild(btn);
  }

  function init() {
    if (!isProductPage()) return;

    CONFIG = resolveConfig();

    const btn = createButton();
    createModal();

    btn.addEventListener("click", openModal);

    document.body.addEventListener("click", function (e) {
      if (
        e.target.id === "homexperia-close" ||
        e.target.closest("#homexperia-close") ||
        e.target === document.getElementById("homexperia-modal")
      ) {
        closeModal();
      }
    });

    insertButton(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
