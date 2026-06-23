(function () {
  const storageKey = "worldCupPoolTheme";
  const root = document.documentElement;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function getStoredTheme() {
    try {
      return window.localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch (error) {
      // Theme persistence is optional; keep the toggle working without storage.
    }
  }

  function preferredTheme() {
    return getStoredTheme() || (mediaQuery.matches ? "dark" : "light");
  }

  function applyTheme(theme) {
    const normalizedTheme = theme === "dark" ? "dark" : "light";
    root.dataset.theme = normalizedTheme;
    root.style.colorScheme = normalizedTheme;

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const isDark = normalizedTheme === "dark";
      button.setAttribute("aria-pressed", String(isDark));
      const label = button.querySelector("[data-theme-toggle-label]");
      if (label) {
        label.textContent = isDark ? "Light mode" : "Dark mode";
      }
    });
  }

  applyTheme(preferredTheme());

  window.addEventListener("DOMContentLoaded", () => {
    applyTheme(preferredTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
        storeTheme(nextTheme);
        applyTheme(nextTheme);
      });
    });
  });

  mediaQuery.addEventListener("change", () => {
    if (!getStoredTheme()) {
      applyTheme(preferredTheme());
    }
  });
})();
