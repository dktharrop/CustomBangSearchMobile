import browser from 'webextension-polyfill';

import {
  dev, currentBrowser, version, hash, hostPermissions,
} from '../lib/esbuilddefinitions';
import { processRequest } from './requests';
import { Settings } from '../lib/settings';
import * as legacy from './legacy';
import * as storage from '../lib/storage';
import { setBangsLookup } from './lookup';
import { setIgnoredDomains } from './ignoreddomains';
import defaultSettings from '../lib/settings.default.json';

function updateGlobals(settings: Settings): void {
  setBangsLookup(settings);
  setIgnoredDomains(settings.options.ignoredDomains);
}

async function setupSettings(): Promise<void> {
  let currentSettings: Settings | undefined;

  currentSettings = await storage.getSettings();

  const legacySettings = await storage.getAndRmLegacySettings();
  let convertedSettings: Settings | undefined;

  // If we found no settings, but we found legacy settings.
  if (currentSettings === undefined && legacySettings !== undefined) {
    if (legacy.isSettingsV1(legacySettings)) {
      convertedSettings = legacy.convertSettingsV1ToV3(legacySettings);
    } else if (legacy.isSettingsV2(legacySettings)) {
      convertedSettings = legacy.convertSettingsV2ToV3(legacySettings);
    }
  }

  if (convertedSettings !== undefined) {
    currentSettings = convertedSettings;
  }

  if (currentSettings === undefined) {
    currentSettings = defaultSettings;
  }

  updateGlobals(currentSettings);

  // Redundant if the user just has settings set. Only happens once per load tho, not a problem.
  return storage.storeSettings(currentSettings);
}

function main(): void {
  if (dev) {
    // eslint-disable-next-line no-console
    console.info(`Dev: ${dev}, Browser: ${currentBrowser}, Version: ${version}, Hash: ${hash}`);
  }

  // Because service workers need to set their event listeners immediately, we can't await this.
  // FIXME: There may be a better way to do this, but for now we just hope it runs quickly!
  setupSettings();

  browser.storage.sync.onChanged.addListener((changes: { settings?: { newValue: string } }) => {
    if (changes.settings !== undefined) {
      const newSettings = storage.decompressSettings(changes.settings.newValue);
      if (newSettings !== null) {
        updateGlobals(newSettings);
      }
    }
  });

  browser.webRequest.onBeforeRequest.addListener(
    (r) => {
      // Type defs don't like an async non-blocking handler.
      processRequest(r);
    },
    { urls: hostPermissions },
    // The requestBody opt is required for handling POST situations.
    ['requestBody'],
  );
}

main();
