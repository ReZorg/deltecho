/* eslint-disable no-console */
import React, { useState, useEffect, useRef } from "react";

import SettingsStoreInstance, { useSettingsStore } from "../../stores/settings";
import { SendBackupDialog } from "../dialogs/SetupMultiDevice";
import { runtime } from "@deltachat-desktop/runtime-interface";
import { donationUrl } from "../../../../shared/constants";
import SettingsIconButton from "./SettingsIconButton";
import ConnectivityButton from "./ConnectivityButton";
import ChatsAndMedia from "./ChatsAndMedia";
import Notifications from "./Notifications";
import About from "../dialogs/About";
import Appearance from "./Appearance";
import Advanced from "./Advanced";
import Profile from "./Profile";
import Dialog, { DialogBody, DialogHeader } from "../Dialog";
import EditProfileDialog from "../dialogs/EditProfileDialog";
import SettingsSeparator from "./SettingsSeparator";
import useDialog from "../../hooks/dialog/useDialog";
import useTranslationFunction from "../../hooks/useTranslationFunction";
import BotSettings from "./BotSettings";
import AICompanionSettings from "../Settings/AICompanionSettings";

import { Brain } from "lucide-react";
import type { DialogProps } from "../../contexts/DialogContext";

type SettingsView =
  | "main"
  | "chats_and_media"
  | "notifications"
  | "appearance"
  | "advanced"
  | "bot_settings"
  | "ai_companion_settings";

export default function Settings({ onClose }: DialogProps) {
  const { openDialog, closeDialog, openDialogIds } = useDialog();

  // settingsStore may be null during async initialization — all hooks must
  // be called unconditionally before any early return (Rules of Hooks).
  // We also read the store directly as a fallback: selectAccount() calls
  // effect.load() as a fire-and-forget before MainScreen renders, so the store
  // may already be populated by the time Settings opens even though the
  // useStore useState snapshot was initialised with null.
  const _settingsStoreFromHook = useSettingsStore()[0];
  const settingsStore = _settingsStoreFromHook ?? SettingsStoreInstance.getState();
  const tx = useTranslationFunction();
  const [settingsMode, setSettingsMode] = useState<SettingsView>("main");

  useEffect(() => {
    const handler = (evt: KeyboardEvent) => {
      if (
        settingsMode !== "main" &&
        window.__settingsOpened &&
        evt.key === "Escape"
      ) {
        evt.preventDefault();
        if (openDialogIds.length > 1) {
          // if there is an open dialog on top of settings dialog
          // (like Backup or Password & Account dialog) close that
          closeDialog(openDialogIds[openDialogIds.length - 1].toString());
        } else {
          // switch back to main Settings dialog
          setSettingsMode("main");
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [settingsMode, openDialogIds, closeDialog]);

  useEffect(() => {
    if (window.__settingsOpened) {
      throw new Error(
        "Settings window was already open - this should not happen, please file a bug",
      );
    }
    window.__settingsOpened = true;
    return () => {
      window.__settingsOpened = false;
    };
  }, []);

  useEffect(() => {
    try {
      const dialogDiv = document.querySelector("div.dc-settings-dialog");
      if (!dialogDiv) return;

      if (openDialogIds.length === 0) {
        dialogDiv.classList.remove("on-top");
      } else if (
        openDialogIds.length > 0 &&
        openDialogIds[0] === "dc-settings-dialog"
      ) {
        dialogDiv.classList.add("on-top");
      } else {
        dialogDiv.classList.remove("on-top");
      }
    } catch (error) {
      console.error(error);
    }
  }, [openDialogIds]);

  // Guard: settings store not yet loaded (async init).
  // useStore's subscribe effect runs before this effect (React runs effects in
  // declaration order within a component tree), so the listener is registered
  // before load() resolves. We also set up a polling interval as a safety net
  // in case the store was already populated by selectAccount's fire-and-forget
  // load() but the useState snapshot missed it.
  const loadAttempted = useRef(false);
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    // If store is already loaded (selectAccount's fire-and-forget completed),
    // the useState in useStore captured the stale null — force a re-read.
    if (SettingsStoreInstance.getState() !== null) {
      forceUpdate(n => n + 1);
      return;
    }
    // Store is genuinely null — trigger load if an account is selected.
    if (!loadAttempted.current && window.__selectedAccountId !== undefined) {
      loadAttempted.current = true;
      SettingsStoreInstance.effect.load().catch(() => {
        // Silently ignore — account may not be fully configured yet
      });
    }
    // Polling fallback: re-check every 200ms in case the store loads via
    // another code path (e.g. MainScreen's useEffect).
    const interval = setInterval(() => {
      if (SettingsStoreInstance.getState() !== null) {
        forceUpdate(n => n + 1);
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settingsStore) {
    return (
      <Dialog onClose={onClose} fixed width={400} dataTestid="settings-dialog">
        <DialogHeader title={tx("menu_settings")} onClose={onClose} />
        <DialogBody>
          <div
            style={{
              padding: "1rem",
              textAlign: "center",
              color: "var(--colorText)",
            }}
          >
            {tx("loading")}…
          </div>
        </DialogBody>
      </Dialog>
    );
  }

  return (
    <Dialog onClose={onClose} fixed width={400} dataTestid="settings-dialog">
      {settingsMode === "main" && (
        <>
          <DialogHeader
            title={tx("menu_settings")}
            onClose={onClose}
            dataTestid="settings"
          />
          <DialogBody>
            <Profile settingsStore={settingsStore} />
            <SettingsIconButton
              icon="person"
              onClick={() => {
                openDialog(EditProfileDialog, {
                  settingsStore,
                });
              }}
            >
              {tx("pref_edit_profile")}
            </SettingsIconButton>
            <SettingsSeparator />
            <SettingsIconButton
              icon="forum"
              onClick={() => setSettingsMode("chats_and_media")}
            >
              {tx("pref_chats_and_media")}
            </SettingsIconButton>
            <SettingsIconButton
              icon="bell"
              onClick={() => setSettingsMode("notifications")}
            >
              {tx("pref_notifications")}
            </SettingsIconButton>
            <SettingsIconButton
              icon="brightness-6"
              onClick={() => setSettingsMode("appearance")}
            >
              {tx("pref_appearance")}
            </SettingsIconButton>
            <SettingsIconButton
              icon="devices"
              onClick={() => {
                openDialog(SendBackupDialog);
                onClose();
              }}
            >
              {tx("multidevice_title")}
            </SettingsIconButton>
            <ConnectivityButton />
            <SettingsIconButton
              customIcon={<div className="material-icons">smart_toy</div>}
              onClick={() => setSettingsMode("bot_settings")}
              dataTestid="open-bot-settings"
            >
              Deep Tree Echo Bot
            </SettingsIconButton>
            <SettingsIconButton
              customIcon={<Brain size={20} />}
              onClick={() => setSettingsMode("ai_companion_settings")}
              dataTestid="open-ai-companion-settings"
            >
              AI Companion Neighborhood
            </SettingsIconButton>
            <SettingsIconButton
              icon="code-tags"
              onClick={() => setSettingsMode("advanced")}
              dataTestid="open-advanced-settings"
            >
              {tx("menu_advanced")}
            </SettingsIconButton>
            <SettingsSeparator />
            {!runtime.getRuntimeInfo().isMac && (
              <SettingsIconButton
                icon="favorite"
                onClick={() => runtime.openLink(donationUrl)}
                isLink
              >
                {tx("donate")}
              </SettingsIconButton>
            )}
            <SettingsIconButton
              icon="question_mark"
              onClick={() => runtime.openHelpWindow()}
            >
              {tx("menu_help")}
            </SettingsIconButton>
            <SettingsIconButton icon="info" onClick={() => openDialog(About)}>
              {tx("global_menu_help_about_desktop")}
            </SettingsIconButton>
          </DialogBody>
        </>
      )}
      {settingsMode === "chats_and_media" && (
        <>
          <DialogHeader
            title={tx("pref_chats_and_media")}
            onClickBack={() => setSettingsMode("main")}
            onClose={onClose}
          />
          <DialogBody>
            <ChatsAndMedia
              settingsStore={settingsStore}
              desktopSettings={settingsStore.desktopSettings}
            />
          </DialogBody>
        </>
      )}
      {settingsMode === "notifications" && (
        <>
          <DialogHeader
            title={tx("pref_notifications")}
            onClickBack={() => setSettingsMode("main")}
            onClose={onClose}
          />
          <DialogBody>
            <Notifications desktopSettings={settingsStore.desktopSettings} />
          </DialogBody>
        </>
      )}
      {settingsMode === "appearance" && (
        <>
          <DialogHeader
            title={tx("pref_appearance")}
            onClickBack={() => setSettingsMode("main")}
            onClose={onClose}
          />
          <DialogBody>
            <Appearance
              rc={settingsStore.rc}
              desktopSettings={settingsStore.desktopSettings}
              settingsStore={settingsStore}
            />
          </DialogBody>
        </>
      )}
      {settingsMode === "advanced" && (
        <>
          <DialogHeader
            title={tx("menu_advanced")}
            onClickBack={() => setSettingsMode("main")}
            onClose={onClose}
            dataTestid="settings-advanced"
          />
          <DialogBody>
            <Advanced settingsStore={settingsStore} />
          </DialogBody>
        </>
      )}
      {settingsMode === "bot_settings" && (
        <>
          <DialogHeader
            title="Deep Tree Echo Bot"
            onClickBack={() => setSettingsMode("main")}
            onClose={onClose}
            dataTestid="settings-bot"
          />
          <DialogBody>
            <BotSettings
              settingsStore={settingsStore}
              onNavigateToAdvanced={() => setSettingsMode("advanced")}
            />
          </DialogBody>
        </>
      )}
      {settingsMode === "ai_companion_settings" && (
        <>
          <DialogHeader
            title="AI Companion Neighborhood"
            onClickBack={() => setSettingsMode("main")}
            onClose={onClose}
            dataTestid="settings-ai-companions"
          />
          <DialogBody>
            <AICompanionSettings onClose={onClose} />
          </DialogBody>
        </>
      )}
    </Dialog>
  );
}
