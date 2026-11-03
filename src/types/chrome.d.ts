type ChromeStorageStoredValue = boolean;

interface ChromeStorageChange {
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

interface ChromeStorageArea {
  get(defaults: Record<string, ChromeStorageStoredValue>, callback: (items: Record<string, ChromeStorageStoredValue>) => void): void;
  set(items: Record<string, ChromeStorageStoredValue>, callback?: () => void): void;
}

interface ChromeStorageChangedEvent {
  addListener(callback: (changes: Record<string, ChromeStorageChange>, areaName: string) => void): void;
}

interface ChromeRuntimeLastError {
  readonly message?: string;
}

interface ChromeRuntimeMessageSender {
  readonly id?: string;
  readonly url?: string;
}

interface ChromeRuntimeMessageEvent {
  addListener(callback: (message: unknown, sender: ChromeRuntimeMessageSender, sendResponse: (response?: unknown) => void) => boolean | void): void;
}

declare const chrome: {
  readonly runtime: {
    readonly id: string;
    readonly lastError?: ChromeRuntimeLastError;
    readonly onMessage: ChromeRuntimeMessageEvent;
    getURL(path: string): string;
    sendMessage(message: unknown, callback?: (response: unknown) => void): void;
  };
  readonly storage: {
    readonly local: ChromeStorageArea;
    readonly onChanged: ChromeStorageChangedEvent;
  };
};
