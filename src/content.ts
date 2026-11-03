import { createGetImageRequest, isGetImageResponse, isRasterDataUrl } from "./messages";

declare const __NAILOONG_DEV__: boolean;

(() => {
  const enabledStorageKey = "nailoongEnabled";
  const defaultEnabled = false;

  let scanQueued = false;
  let enabled = defaultEnabled;
  let nextImageSlot = 0;

  const replacedAttribute = "data-nailoong-image";
  const assignedSlotAttribute = "data-nailoong-slot";
  const sourceReplacedAttribute = "data-nailoong-source";
  const originalSrcAttribute = "data-nailoong-original-src";
  const originalSrcSetAttribute = "data-nailoong-original-srcset";
  const originalSizesAttribute = "data-nailoong-original-sizes";
  const originalSourceTypeAttribute = "data-nailoong-original-source-type";
  const originalObjectFitAttribute = "data-nailoong-original-object-fit";
  const originalBackgroundAttribute = "data-nailoong-original-background";
  const originalBackgroundPositionAttribute = "data-nailoong-original-background-position";
  const originalBackgroundSizeAttribute = "data-nailoong-original-background-size";
  const scanDelayMs = 80;

  // The page shares this DOM, so every attribute and CSS value read back out of
  // it is attacker-controlled. Only ever write back something image-shaped.
  const maxSlot = 10_000;
  const replacementUrlCache = new Map<string, boolean>();

  type ReplacementKind = "image" | "background";
  type StylePropertyName = "objectFit" | "backgroundImage" | "backgroundPosition" | "backgroundSize";

  const resolvedImageUrls = new Map<number, string>();
  const pendingImageUrls = new Map<number, Promise<string | null>>();

  const parseAssignedSlot = (value: string | null): number | null => {
    if (value === null) {
      return null;
    }

    const slot = Number.parseInt(value, 10);

    if (!Number.isInteger(slot) || slot < 0 || slot > maxSlot) {
      return null;
    }

    return slot;
  };

  const pickImageSlot = (element: Element): number => {
    const assignedSlot = parseAssignedSlot(element.getAttribute(assignedSlotAttribute));

    if (assignedSlot !== null) {
      return assignedSlot;
    }

    const slot = nextImageSlot;
    nextImageSlot += 1;

    element.setAttribute(assignedSlotAttribute, String(slot));
    return slot;
  };

  // Any image the extension itself wrote is a data: URL, so a source that is not
  // one is still the page's own and is fair game to replace.
  const isReplacementUrl = (value: string): boolean => {
    const cached = replacementUrlCache.get(value);

    if (cached !== undefined) {
      return cached;
    }

    const isReplacement = value.startsWith("data:image/");
    replacementUrlCache.set(value, isReplacement);
    return isReplacement;
  };

  const getRoutedImageUrl = (slot: number): Promise<string | null> => {
    const resolvedImageUrl = resolvedImageUrls.get(slot);

    if (resolvedImageUrl !== undefined) {
      return Promise.resolve(resolvedImageUrl);
    }

    const pendingImageUrl = pendingImageUrls.get(slot);

    if (pendingImageUrl !== undefined) {
      return pendingImageUrl;
    }

    const imageUrl = new Promise<string | null>((resolve) => {
      chrome.runtime.sendMessage(createGetImageRequest(slot), (response) => {
        if (chrome.runtime.lastError !== undefined) {
          resolve(null);
          return;
        }

        if (!isGetImageResponse(response) || !response.ok) {
          resolve(null);
          return;
        }

        if (!isRasterDataUrl(response.dataUrl)) {
          resolve(null);
          return;
        }

        resolvedImageUrls.set(slot, response.dataUrl);
        resolve(response.dataUrl);
      });
    }).finally(() => {
      pendingImageUrls.delete(slot);
    });

    pendingImageUrls.set(slot, imageUrl);
    return imageUrl;
  };

  const rememberAttribute = (element: Element, attributeName: string, storageAttributeName: string): void => {
    const value = element.getAttribute(attributeName);
    const presentAttributeName = `${storageAttributeName}-present`;

    if (value === null) {
      element.setAttribute(presentAttributeName, "false");
      element.removeAttribute(storageAttributeName);
      return;
    }

    element.setAttribute(presentAttributeName, "true");
    element.setAttribute(storageAttributeName, value);
  };

  const restoreAttribute = (element: Element, attributeName: string, storageAttributeName: string): void => {
    const presentAttributeName = `${storageAttributeName}-present`;
    const wasPresent = element.getAttribute(presentAttributeName) === "true";

    if (wasPresent) {
      element.setAttribute(attributeName, element.getAttribute(storageAttributeName) ?? "");
    } else {
      element.removeAttribute(attributeName);
    }

    element.removeAttribute(presentAttributeName);
    element.removeAttribute(storageAttributeName);
  };

  const rememberStyle = (element: HTMLElement, propertyName: StylePropertyName, storageAttributeName: string): void => {
    element.setAttribute(storageAttributeName, element.style[propertyName] ?? "");
  };

  const restoreStyle = (element: HTMLElement, propertyName: StylePropertyName, storageAttributeName: string): void => {
    element.style[propertyName] = element.getAttribute(storageAttributeName) ?? "";
    element.removeAttribute(storageAttributeName);
  };

  const imageHasSource = (image: HTMLImageElement): boolean => {
    if (image.currentSrc !== "" || image.getAttribute("src") !== null || image.getAttribute("srcset") !== null) {
      return true;
    }

    const picture = image.parentElement;

    if (!(picture instanceof HTMLPictureElement)) {
      return false;
    }

    return picture.querySelector("source[srcset]") !== null;
  };

  const imageLooksReplaceable = (image: HTMLImageElement): boolean => {
    const source = image.currentSrc || image.src || image.getAttribute("src") || image.getAttribute("srcset") || "";
    return imageHasSource(image) && !isReplacementUrl(source);
  };

  const replacePictureSources = (image: HTMLImageElement, imageUrl: string): void => {
    const picture = image.parentElement;

    if (!(picture instanceof HTMLPictureElement)) {
      return;
    }

    picture.querySelectorAll("source").forEach((source) => {
      if (!source.hasAttribute(sourceReplacedAttribute)) {
        source.setAttribute(sourceReplacedAttribute, "true");
        rememberAttribute(source, "srcset", originalSrcSetAttribute);
        rememberAttribute(source, "sizes", originalSizesAttribute);
        rememberAttribute(source, "type", originalSourceTypeAttribute);
      }

      source.srcset = imageUrl;
      source.removeAttribute("sizes");
      source.removeAttribute("type");
    });
  };

  const restorePictureSources = (image: HTMLImageElement): void => {
    const picture = image.parentElement;

    if (!(picture instanceof HTMLPictureElement)) {
      return;
    }

    picture.querySelectorAll(`source[${sourceReplacedAttribute}]`).forEach((source) => {
      restoreAttribute(source, "srcset", originalSrcSetAttribute);
      restoreAttribute(source, "sizes", originalSizesAttribute);
      restoreAttribute(source, "type", originalSourceTypeAttribute);
      source.removeAttribute(sourceReplacedAttribute);
    });
  };

  const applyImageReplacement = (image: HTMLImageElement, imageUrl: string): void => {
    if (image.hasAttribute("srcset")) {
      image.removeAttribute("srcset");
    }

    if (image.hasAttribute("sizes")) {
      image.removeAttribute("sizes");
    }

    replacePictureSources(image, imageUrl);

    if (image.src !== imageUrl) {
      image.src = imageUrl;
    }

    if (image.style.objectFit !== "cover") {
      image.style.objectFit = "cover";
    }
  };

  const syncImageReplacement = (image: HTMLImageElement): void => {
    const slot = pickImageSlot(image);

    getRoutedImageUrl(slot).then((imageUrl) => {
      if (!enabled || image.getAttribute(replacedAttribute) !== "image") {
        return;
      }

      if (image.getAttribute(assignedSlotAttribute) !== String(slot)) {
        return;
      }

      if (imageUrl === null) {
        return;
      }

      applyImageReplacement(image, imageUrl);
    });
  };

  const replaceImage = (image: HTMLImageElement): void => {
    if (!enabled) {
      return;
    }

    if (image.getAttribute(replacedAttribute) === "image") {
      syncImageReplacement(image);
      return;
    }

    if (image.hasAttribute(replacedAttribute) || !imageLooksReplaceable(image)) {
      return;
    }

    image.setAttribute(replacedAttribute, "image");
    rememberAttribute(image, "src", originalSrcAttribute);
    rememberAttribute(image, "srcset", originalSrcSetAttribute);
    rememberAttribute(image, "sizes", originalSizesAttribute);
    rememberStyle(image, "objectFit", originalObjectFitAttribute);
    syncImageReplacement(image);
  };

  const restoreImage = (image: HTMLImageElement): void => {
    if (image.getAttribute(replacedAttribute) !== "image") {
      return;
    }

    restorePictureSources(image);
    restoreAttribute(image, "src", originalSrcAttribute);
    restoreAttribute(image, "srcset", originalSrcSetAttribute);
    restoreAttribute(image, "sizes", originalSizesAttribute);
    restoreStyle(image, "objectFit", originalObjectFitAttribute);
    image.removeAttribute(assignedSlotAttribute);
    image.removeAttribute(replacedAttribute);
  };

  const getBackgroundImage = (element: HTMLElement): string => {
    return getComputedStyle(element).backgroundImage;
  };

  const backgroundLooksReplaceable = (element: HTMLElement): boolean => {
    const backgroundImage = getBackgroundImage(element);
    return backgroundImage !== "none" && backgroundImage.includes("url(") && !isReplacementUrl(backgroundImage);
  };

  const applyBackgroundReplacement = (element: HTMLElement, imageUrl: string): void => {
    // imageUrl is interpolated into a CSS url() token, so a stray quote or
    // parenthesis here would let a value escape the declaration.
    if (!isRasterDataUrl(imageUrl)) {
      return;
    }

    const expectedBackgroundImage = `url("${imageUrl}")`;

    if (element.style.backgroundImage !== expectedBackgroundImage) {
      element.style.backgroundImage = expectedBackgroundImage;
    }

    if (element.style.backgroundPosition !== "center") {
      element.style.backgroundPosition = "center";
    }

    if (element.style.backgroundSize !== "cover") {
      element.style.backgroundSize = "cover";
    }
  };

  const syncBackgroundReplacement = (element: HTMLElement): void => {
    const slot = pickImageSlot(element);

    getRoutedImageUrl(slot).then((imageUrl) => {
      if (!enabled || element.getAttribute(replacedAttribute) !== "background") {
        return;
      }

      if (element.getAttribute(assignedSlotAttribute) !== String(slot)) {
        return;
      }

      if (imageUrl === null) {
        return;
      }

      applyBackgroundReplacement(element, imageUrl);
    });
  };

  const replaceBackground = (element: HTMLElement): void => {
    if (!enabled) {
      return;
    }

    if (element.getAttribute(replacedAttribute) === "background") {
      syncBackgroundReplacement(element);
      return;
    }

    if (element.hasAttribute(replacedAttribute) || !backgroundLooksReplaceable(element)) {
      return;
    }

    element.setAttribute(replacedAttribute, "background");
    rememberStyle(element, "backgroundImage", originalBackgroundAttribute);
    rememberStyle(element, "backgroundPosition", originalBackgroundPositionAttribute);
    rememberStyle(element, "backgroundSize", originalBackgroundSizeAttribute);
    syncBackgroundReplacement(element);
  };

  const restoreBackground = (element: HTMLElement): void => {
    if (element.getAttribute(replacedAttribute) !== "background") {
      return;
    }

    restoreStyle(element, "backgroundImage", originalBackgroundAttribute);
    restoreStyle(element, "backgroundPosition", originalBackgroundPositionAttribute);
    restoreStyle(element, "backgroundSize", originalBackgroundSizeAttribute);
    element.removeAttribute(assignedSlotAttribute);
    element.removeAttribute(replacedAttribute);
  };

  const restoreMarkedElement = (element: Element): void => {
    const marker = element.getAttribute(replacedAttribute) as ReplacementKind | null;

    if (marker === "image" && element instanceof HTMLImageElement) {
      restoreImage(element);
      return;
    }

    if (marker === "background" && element instanceof HTMLElement) {
      restoreBackground(element);
    }
  };

  const replaceInside = (root: Node): void => {
    if (!enabled) {
      return;
    }

    if (root instanceof HTMLImageElement) {
      replaceImage(root);
    }

    if (root instanceof HTMLElement) {
      replaceBackground(root);
    }

    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
      return;
    }

    root.querySelectorAll("img").forEach((image) => {
      replaceImage(image);
    });

    root.querySelectorAll("*").forEach((element) => {
      if (element instanceof HTMLElement) {
        replaceBackground(element);
      }
    });
  };

  const restoreInside = (root: Node): void => {
    if (root instanceof Element) {
      restoreMarkedElement(root);
    }

    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
      return;
    }

    root.querySelectorAll(`[${replacedAttribute}]`).forEach((element) => {
      restoreMarkedElement(element);
    });
  };

  const scanDocument = (): void => {
    scanQueued = false;

    if (enabled) {
      replaceInside(document);
      return;
    }

    restoreInside(document);
  };

  const queueScan = (): void => {
    if (scanQueued) {
      return;
    }

    scanQueued = true;
    window.setTimeout(scanDocument, scanDelayMs);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (enabled) {
            replaceInside(node);
          }
        });
      }

      if (mutation.type === "attributes" && enabled) {
        replaceInside(mutation.target);
      }
    }

    queueScan();
  });

  const applyEnabledState = (nextEnabled: boolean): void => {
    enabled = nextEnabled;

    if (enabled) {
      queueScan();
      return;
    }

    restoreInside(document);
  };

  const setEnabled = (nextEnabled: boolean): void => {
    chrome.storage.local.set({ [enabledStorageKey]: nextEnabled }, () => {
      applyEnabledState(nextEnabled);
    });
  };

  const installLocalTestToggle = (): void => {
    // Compiled out of release builds: a page on localhost can dispatch this
    // event itself, so it must never ship in a build users install.
    if (!__NAILOONG_DEV__) {
      return;
    }

    if (!["127.0.0.1", "localhost", "::1"].includes(window.location.hostname)) {
      return;
    }

    window.addEventListener("nailoong:set-enabled", (event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const detail: unknown = event.detail;

      if (typeof detail === "boolean") {
        setEnabled(detail);
        return;
      }

      if (detail !== null && typeof detail === "object" && "enabled" in detail && typeof detail.enabled === "boolean") {
        setEnabled(detail.enabled);
      }
    });
  };

  const startObserver = (): void => {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["src", "srcset", "style"],
      childList: true,
      subtree: true
    });
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || changes[enabledStorageKey] === undefined) {
      return;
    }

    applyEnabledState(changes[enabledStorageKey].newValue === true);
  });

  chrome.storage.local.get({ [enabledStorageKey]: defaultEnabled }, (items) => {
    enabled = items[enabledStorageKey] === true;
    installLocalTestToggle();
    scanDocument();
    startObserver();
  });
})();
