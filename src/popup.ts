(() => {
  const enabledStorageKey = "nailoongEnabled";
  const defaultEnabled = false;
  const enabledInput = document.querySelector("#enabled");
  const status = document.querySelector("#status");

  if (!(enabledInput instanceof HTMLInputElement) || status === null) {
    return;
  }

  const setStatus = (enabled: boolean): void => {
    status.textContent = enabled ? "On" : "Off";
  };

  chrome.storage.local.get({ [enabledStorageKey]: defaultEnabled }, (items) => {
    const enabled = items[enabledStorageKey] === true;
    enabledInput.checked = enabled;
    setStatus(enabled);
  });

  enabledInput.addEventListener("change", () => {
    const enabled = enabledInput.checked;
    setStatus(enabled);
    chrome.storage.local.set({ [enabledStorageKey]: enabled });
  });
})();
