import * as vscode from "vscode";

export class RehatSebentarView implements vscode.WebviewViewProvider {
  public static readonly viewType = "rehatsebentarView";
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "setAlarm":
          vscode.commands.executeCommand(
            "rehatsebentar.setAlarm",
            message.time,
          );
          break;
        case "stopAlarm":
          vscode.commands.executeCommand("rehatsebentar.stopAlarm");
          break;
        case "setPreset":
          this.setPreset(message.minutes);
          break;
      }
    });

    // Send initial state
    this.updateState();
  }

  private setPreset(minutes: number) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);
    const timeStr =
      now.getHours().toString().padStart(2, "0") +
      ":" +
      now.getMinutes().toString().padStart(2, "0");
    vscode.commands.executeCommand("rehatsebentar.setAlarm", timeStr);
  }

  public updateState(alarmTime?: string, remaining?: string) {
    if (this._view) {
      this._view.webview.postMessage({
        command: "updateState",
        alarmTime,
        remaining,
      });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.css"),
    );

    const nonce = getNonce();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>Rehat Sebentar</title>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>☕ Rehat Sebentar</h1>
    </div>

    <div id="status-card" class="status-card">
      <div id="timer" class="timer-display">--:--</div>
      <div id="timer-label" class="timer-label">No Alarm Set</div>
    </div>

    <div id="controls" class="controls-container">
      <div class="presets">
        <button class="btn-secondary preset-btn" data-minutes="5">5m Quick</button>
        <button class="btn-secondary preset-btn" data-minutes="15">15m Relax</button>
        <button class="btn-secondary preset-btn" data-minutes="30">30m Nap</button>
        <button class="btn-secondary preset-btn" data-minutes="60">1h Rest</button>
      </div>

      <div class="input-group">
        <label for="time">Custom Alarm Time</label>
        <input id="time" type="time" />
        <button id="set-custom-btn" class="btn-primary">Set Custom Alarm</button>
      </div>
    </div>

    <button id="stop-btn" class="btn-outline" style="display: none;">Stop Alarm</button>

    <div class="hint">
      "☕ Rehat sebentar. Kode bisa nunggu."
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentAlarmTime = null;

    // Set custom alarm
    document.getElementById('set-custom-btn').addEventListener('click', () => {
      const timeInput = document.getElementById('time');
      const time = timeInput.value;
      if (time) {
        vscode.postMessage({ command: 'setAlarm', time });
        timeInput.value = ''; // Reset input after set
      }
    });

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const minutes = parseInt(btn.getAttribute('data-minutes'));
        vscode.postMessage({ command: 'setPreset', minutes });
      });
    });

    // Stop alarm
    document.getElementById('stop-btn').addEventListener('click', () => {
      vscode.postMessage({ command: 'stopAlarm' });
    });

    function format12h(timeStr) {
      if (!timeStr) return "--:--";
      const [hours, minutes] = timeStr.split(':').map(Number);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      return h12 + ':' + minutes.toString().padStart(2, '0') + ' ' + ampm;
    }

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updateState') {
        const timer = document.getElementById('timer');
        const label = document.getElementById('timer-label');
        const card = document.getElementById('status-card');
        const stopBtn = document.getElementById('stop-btn');
        const controls = document.getElementById('controls');

        if (message.alarmTime) {
          currentAlarmTime = message.alarmTime;
          timer.innerText = message.remaining || "--:--";
          label.innerText = "Target: " + format12h(message.alarmTime);
          card.classList.add('active-timer');
          stopBtn.style.display = 'block';
          controls.style.display = 'none';
        } else {
          currentAlarmTime = null;
          timer.innerText = "--:--";
          label.innerText = "No Alarm Set";
          card.classList.remove('active-timer');
          stopBtn.style.display = 'none';
          controls.style.display = 'block';
        }
      }
    });
  </script>
</body>
</html>
`;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
