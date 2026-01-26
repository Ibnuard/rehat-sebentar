import * as vscode from "vscode";
import { RehatSebentarView } from "./rehatSebentarView";
import * as cp from "child_process";

/**
 * Alarm state
 */
let alarmTimer: NodeJS.Timeout | undefined;
let alarmTime: string | undefined; // HH:mm
let alarmTriggered = false;
let viewProvider: RehatSebentarView;
let currentSoundProcess: cp.ChildProcess | undefined;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  viewProvider = new RehatSebentarView(context);

  // Initialize status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = "rehatsebentarView.focus";
  context.subscriptions.push(statusBarItem);

  // Restore state
  alarmTime = context.globalState.get<string>("alarmTime");
  if (alarmTime) {
    startAlarmChecking(context, alarmTime);
  }

  const testCommand = vscode.commands.registerCommand(
    "rehatsebentar.test",
    () => {
      vscode.window.showInformationMessage(
        "☕ Rehat sebentar. Kode bisa nunggu.",
      );
    },
  );

  const setAlarmCommand = vscode.commands.registerCommand(
    "rehatsebentar.setAlarm",
    async (timeFromUI?: string) => {
      const time =
        timeFromUI ??
        (await vscode.window.showInputBox({
          prompt: "Set alarm time (HH:mm)",
          placeHolder: "22:00",
          validateInput: (value) =>
            /^\d{1,2}:\d{2}$/.test(value) ? null : "Format must be HH:mm",
        }));

      if (!time) return;

      alarmTime = time;
      alarmTriggered = false;
      await context.globalState.update("alarmTime", alarmTime);

      vscode.window.showInformationMessage(
        `⏰ RehatSebentar set at ${alarmTime}`,
      );

      startAlarmChecking(context, alarmTime);
    },
  );

  const stopAlarmCommand = vscode.commands.registerCommand(
    "rehatsebentar.stopAlarm",
    async () => {
      stopAlarm(context);
      vscode.window.showInformationMessage("🛑 RehatSebentar alarm stopped");
    },
  );

  const toggleSoundCommand = vscode.commands.registerCommand(
    "rehatsebentar.toggleSound",
    async (enabled: boolean) => {
      await context.globalState.update("soundEnabled", enabled);
    },
  );

  const setSoundCommand = vscode.commands.registerCommand(
    "rehatsebentar.setSound",
    async (soundFile: string) => {
      await context.globalState.update("selectedSound", soundFile);
    },
  );

  const previewSoundCommand = vscode.commands.registerCommand(
    "rehatsebentar.previewSound",
    () => {
      playSound(context, false);
    },
  );

  context.subscriptions.push(
    testCommand,
    setAlarmCommand,
    stopAlarmCommand,
    toggleSoundCommand,
    setSoundCommand,
    previewSoundCommand,
    vscode.window.registerWebviewViewProvider(
      RehatSebentarView.viewType,
      viewProvider,
    ),
  );
}

function startAlarmChecking(
  context: vscode.ExtensionContext,
  targetTime: string,
) {
  if (alarmTimer) {
    clearInterval(alarmTimer);
  }

  const update = () => {
    const now = new Date();
    const currentStr =
      now.getHours().toString().padStart(2, "0") +
      ":" +
      now.getMinutes().toString().padStart(2, "0");

    // Calculate remaining
    const [targetH, targetM] = targetTime.split(":").map(Number);
    let targetDate = new Date();
    targetDate.setHours(targetH, targetM, 0, 0);

    // If target is in the past, don't loop to next day automatically for manual sets
    if (targetDate < now && currentStr !== targetTime) {
      if (now.getTime() - targetDate.getTime() > 60000) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    }

    const diffMs = targetDate.getTime() - now.getTime();

    // If it's already passed (more than 1 min), reset
    if (diffMs < -60000) {
      stopAlarm(context);
      return;
    }

    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);

    let remainingStr = "";
    if (diffHrs > 0) {
      remainingStr += `${diffHrs}h `;
    }
    remainingStr += `${diffMins}m ${diffSecs}s`;

    if (diffMs < 0) {
      remainingStr = "00:00";
    }

    viewProvider.updateState(targetTime, remainingStr);

    // Update status bar
    statusBarItem.text = `$(coffee) ${remainingStr}`;
    statusBarItem.tooltip = `RehatSebentar: Target ${targetTime}`;
    statusBarItem.show();

    if (currentStr === targetTime && !alarmTriggered) {
      alarmTriggered = true;

      // Play sound if enabled (with loop)
      const soundEnabled = context.globalState.get<boolean>(
        "soundEnabled",
        true,
      );
      if (soundEnabled) {
        playSound(context, true);
      }

      vscode.window
        .showInformationMessage(
          "☕ Sudah waktunya. Rehat sebentar, ya.",
          { modal: true },
          "Stop Alarm",
          "Snooze 5m",
        )
        .then((selection) => {
          stopSound();
          if (selection === "Stop Alarm") {
            stopAlarm(context);
          } else if (selection === "Snooze 5m") {
            const snoozeTime = new Date(Date.now() + 5 * 60000);
            const timeStr =
              snoozeTime.getHours().toString().padStart(2, "0") +
              ":" +
              snoozeTime.getMinutes().toString().padStart(2, "0");
            vscode.commands.executeCommand("rehatsebentar.setAlarm", timeStr);
          } else {
            stopAlarm(context);
          }
        });
    }
  };

  update();
  alarmTimer = setInterval(update, 1000); // Check every second for countdown
}

function stopAlarm(context: vscode.ExtensionContext) {
  if (alarmTimer) {
    clearInterval(alarmTimer);
    alarmTimer = undefined;
  }
  alarmTime = undefined;
  alarmTriggered = false;
  context.globalState.update("alarmTime", undefined);
  viewProvider.updateState(undefined);
  statusBarItem.hide();
  stopSound();
}

export function deactivate() {
  if (alarmTimer) {
    clearInterval(alarmTimer);
  }
  stopSound();
}

function playSound(context: vscode.ExtensionContext, loop: boolean) {
  stopSound();

  const soundFile = context.globalState.get<string>(
    "selectedSound",
    "alarm1.wav",
  );
  const soundPath = vscode.Uri.joinPath(
    context.extensionUri,
    "media",
    soundFile,
  ).fsPath;

  // Since user is on Mac
  if (loop) {
    // Wrap afplay in a loop shell command
    currentSoundProcess = cp.spawn("sh", [
      "-c",
      `while true; do afplay "${soundPath}"; done`,
    ]);
  } else {
    currentSoundProcess = cp.spawn("afplay", [soundPath]);
  }
}

function stopSound() {
  if (currentSoundProcess) {
    // Kill the whole process group if needed, but sh -c usually kills descendants
    currentSoundProcess.kill();
    currentSoundProcess = undefined;
  }
}
