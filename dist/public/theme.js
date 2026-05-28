(() => {
  const storageKey = "asset-tracker-theme";
  const darkTheme = "dark";
  const lightTheme = "light";

  const getStoredTheme = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  };

  const setStoredTheme = (theme) => {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (error) {}
  };

  const applyTheme = (theme) => {
    const normalizedTheme = theme === darkTheme ? darkTheme : lightTheme;
    document.documentElement.setAttribute("data-theme", normalizedTheme);

    const icon = document.querySelector("[data-theme-icon]");
    const toggle = document.querySelector("[data-theme-toggle]");

    if (icon) {
      icon.textContent = normalizedTheme === darkTheme ? "☀" : "☾";
    }

    if (toggle) {
      toggle.setAttribute(
        "aria-label",
        normalizedTheme === darkTheme ? "Switch to light mode" : "Switch to dark mode"
      );
      toggle.title = normalizedTheme === darkTheme ? "Switch to light mode" : "Switch to dark mode";
    }
  };

  const currentTheme = getStoredTheme() || lightTheme;
  applyTheme(currentTheme);

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-theme-toggle]");
    if (!toggle) {
      return;
    }

    const nextTheme = document.documentElement.getAttribute("data-theme") === darkTheme ? lightTheme : darkTheme;
    setStoredTheme(nextTheme);
    applyTheme(nextTheme);
  });
})();