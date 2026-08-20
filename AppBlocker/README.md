# App Blocker for iPhone

A personal iPhone app that blocks other apps on your phone, with:

- **Focus Timer** — pick apps (or whole categories like Social or Games), pick a duration (15 min to 24 hours), and they're instantly blocked until the timer ends. You can end early if needed.
- **Schedules** — recurring daily restrictions, e.g. "block social media 9 AM–5 PM on weekdays" or "block everything after 10 PM." Turn each schedule on/off with a toggle. Blocking happens automatically in the background even when this app is closed.
- **Custom block screen** — when you try to open a blocked app, iOS shows a full-screen shield with your reminder message.
- **Website blocking** — the same picker also lets you block websites in Safari.

Everything runs 100% on-device through Apple's official **Screen Time API** (FamilyControls, ManagedSettings, DeviceActivity). No account, no server, no data collection.

## Why it has to work this way

iOS does not let one app kill or hide another app directly — the only sanctioned mechanism is the Screen Time API, which requires:

1. Building the app with Xcode on a Mac (it can't be sideloaded from a website).
2. Running on a **real iPhone** (iOS 16+). App blocking does not work in the Simulator.
3. Granting Screen Time permission on first launch (one tap).

## Build & install (one-time setup, ~15 minutes)

### What you need

- A Mac with [Xcode 15+](https://apps.apple.com/us/app/xcode/id497799835) installed
- An iPhone on iOS 16 or newer, connected by cable
- An Apple ID signed into Xcode (Xcode → Settings → Accounts). A free account works for installing on your own phone; a paid Apple Developer account ($99/yr) is only needed for App Store/TestFlight distribution.

### Steps

1. **Generate the Xcode project** (this repo ships the project definition, not the heavyweight generated file):

   ```bash
   brew install xcodegen        # once
   cd AppBlocker
   xcodegen generate
   open AppBlocker.xcodeproj
   ```

2. **Set your signing team** — in Xcode, click the blue `AppBlocker` project icon → select each of the three targets (`AppBlocker`, `MonitorExtension`, `ShieldConfigExtension`) → *Signing & Capabilities* → choose your Team. If Xcode complains the bundle ID is taken, change `com.jcmarketing.appblocker` in `project.yml` to something unique and re-run `xcodegen generate`.

3. **Check capabilities** — the project file already declares them, but verify each of the three targets shows both:
   - **Family Controls** (add it via *+ Capability* if missing)
   - **App Groups** with `group.com.jcmarketing.appblocker` (must match the bundle ID prefix you chose in step 2 if you changed it — also update `SharedConstants.appGroupID` in `Shared/SharedConstants.swift`)

4. **Run it** — select your iPhone as the destination and press ▶. The first launch asks for Screen Time access; tap **Continue** and authenticate.

5. **Trust the developer profile** (free accounts only) — on the phone: Settings → General → VPN & Device Management → trust your Apple ID.

### If you want it on the App Store later

The *Family Controls (Distribution)* entitlement must be requested from Apple at <https://developer.apple.com/contact/request/family-controls-distribution>. For personal use on your own device, the development entitlement Xcode adds automatically is enough.

## How it works under the hood

| Piece | Role |
| --- | --- |
| `AppBlocker` (main app) | UI. Asks for Screen Time authorization, shows the `FamilyActivityPicker` (Apple's system sheet for choosing apps), starts timers, and saves schedules. |
| `MonitorExtension` | A `DeviceActivityMonitor` extension iOS wakes at each schedule boundary. Applies the shield when a window starts (checking the weekday) and clears it when the window ends — the main app doesn't need to be running. |
| `ShieldConfigExtension` | Draws the custom full-screen "blocked" overlay. |
| `Shared/` | Models + an App Group `UserDefaults` store, so the app and extensions see the same schedules and selections. Each schedule gets its own named `ManagedSettingsStore`, so overlapping schedules don't clear each other. |

Notes on behavior:

- The focus timer applies its shield **immediately** in the app, then registers a DeviceActivity interval so the extension lifts the shield at the end even if the app is killed. Apple requires DeviceActivity intervals to be ≥ 15 minutes; for shorter timers the app clears the shield itself when the countdown ends (reopen the app if it was force-quit before the timer finished).
- Repeating schedules fire daily; the monitor extension enforces your selected weekdays.
- If you create a schedule whose window is already in progress, blocking starts right away.

## Files

```
AppBlocker/
├── project.yml                  # XcodeGen project definition (generates AppBlocker.xcodeproj)
├── AppBlocker/                  # Main app (SwiftUI)
│   ├── AppBlockerApp.swift
│   ├── BlockerModel.swift       # Authorization, timer + schedule logic
│   ├── ContentView.swift        # Tabs + permission screen
│   ├── FocusTimerView.swift
│   ├── SchedulesView.swift
│   └── ScheduleEditorView.swift
├── MonitorExtension/
│   └── MonitorExtension.swift   # Background enforcement
├── ShieldConfigExtension/
│   └── ShieldConfigExtension.swift  # Custom block screen
└── Shared/
    ├── SharedConstants.swift    # App Group + activity/store names
    ├── Models.swift             # BlockSchedule, FocusSession
    └── SharedStore.swift        # App Group persistence + shield apply/clear
```
