(function () {
  if (window.__homexperiaLoaded) return;
  window.__homexperiaLoaded = true;

  const DEFAULT_CONFIG = {
    // Base URL only. The shop domain, product GID and variant are appended at
    // modal-open time to form the Homexperia contract:
    //   {targetUrl}/{shop}?productId={gid}&shop={shop}&variant={id}
    // Overridden at build time by HOMEXPERIA_TARGET_URL.
    targetUrl: "https://ai.homexperia.com/shopify-room-upload",
    buttonText: "View in Your Room",
    modalTitle: "Homexperia AI",
    placementSelector: 'form[action*="/cart/add"]',
    placementMode: "after"
  };

  let CONFIG = DEFAULT_CONFIG;

  // Selectors that mark a variant swatch as the chosen one. Horizon-style
  // pickers expose the variant on the element itself via data-variant-id.
  const SELECTED_VARIANT_SELECTORS = [
    'input[data-variant-id]:checked',
    '[data-variant-id][aria-checked="true"]',
    '[data-variant-id][aria-selected="true"]',
    '[data-variant-id][data-selected="true"]',
    'option[data-variant-id]:checked'
  ].join(",");

  // Resolved fresh each time the modal opens rather than tracked continuously,
  // so no observer is needed: whatever the shopper has selected at click time is
  // what gets sent.
  function currentVariantId() {
    const selected = document.querySelector(SELECTED_VARIANT_SELECTORS);
    if (selected) {
      const id = selected.getAttribute("data-variant-id");
      if (id) return id;
    }

    // Classic themes keep the selected variant in the add-to-cart form, which
    // they update on every variant change.
    const formInput = document.querySelector(
      'form[action*="/cart/add"] [name="id"]'
    );
    if (formInput && formInput.value) return formInput.value;

    // Most themes also mirror the selection into the URL.
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("variant");
      if (fromUrl) return fromUrl;
    } catch (error) {
      // Ignore and fall through to the value Liquid rendered.
    }

    // Rendered by the app embed at page load.
    return CONFIG.variantId || "";
  }

  // Builds the Homexperia URL:
  //   {targetUrl}/{shop}?productId={gid}&shop={shop}&variant={id}
  // Falls back to the bare target URL if the storefront context is missing, so
  // a theme that does not expose it still opens the experience.
  function buildTargetUrl() {
    const base = String(CONFIG.targetUrl || "").replace(/\/+$/, "");
    const shopDomain = CONFIG.shopDomain || window.location.hostname;

    if (!base || !shopDomain) return CONFIG.targetUrl;

    try {
      const url = new URL(base + "/" + encodeURIComponent(shopDomain));
      const productGid = CONFIG.productGid;
      const variantId = currentVariantId();

      if (productGid) url.searchParams.set("productId", productGid);
      url.searchParams.set("shop", shopDomain);
      if (variantId) url.searchParams.set("variant", variantId);

      return url.toString();
    } catch (error) {
      console.warn("[Homexperia] Could not build the target URL.", error);
      return CONFIG.targetUrl;
    }
  }

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

    let url = buildTargetUrl();

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
