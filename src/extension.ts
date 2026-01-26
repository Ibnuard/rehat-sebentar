import * as vscode from "vscode";
import { RehatSebentarView } from "./rehatSebentarView";

/**
 * Alarm state
 */
let alarmTimer: NodeJS.Timeout | undefined;
let alarmTime: string | undefined; // HH:mm
let alarmTriggered = false;
let viewProvider: RehatSebentarView;

export function activate(context: vscode.ExtensionContext) {
  viewProvider = new RehatSebentarView(context);

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

  context.subscriptions.push(
    testCommand,
    setAlarmCommand,
    stopAlarmCommand,
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

    if (currentStr === targetTime && !alarmTriggered) {
      alarmTriggered = true;
      vscode.window
        .showInformationMessage(
          "☕ Sudah waktunya. Rehat sebentar, ya.",
          { modal: true },
          "Stop Alarm",
          "Snooze 5m",
        )
        .then((selection) => {
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
}

export function deactivate() {
  if (alarmTimer) {
    clearInterval(alarmTimer);
  }
}
