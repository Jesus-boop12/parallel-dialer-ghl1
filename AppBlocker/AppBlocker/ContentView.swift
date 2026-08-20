import SwiftUI
import FamilyControls

struct ContentView: View {
    @EnvironmentObject private var model: BlockerModel

    var body: some View {
        Group {
            if model.isAuthorized {
                TabView {
                    FocusTimerView()
                        .tabItem { Label("Timer", systemImage: "timer") }
                    SchedulesView()
                        .tabItem { Label("Schedules", systemImage: "calendar.badge.clock") }
                }
            } else {
                AuthorizationView()
            }
        }
    }
}

/// First-run screen asking for Screen Time permission.
struct AuthorizationView: View {
    @EnvironmentObject private var model: BlockerModel

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "hand.raised.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
            Text("App Blocker")
                .font(.largeTitle.bold())
            Text("To block apps, this app needs Screen Time permission. Nothing leaves your device — Apple's Screen Time framework handles all blocking locally.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)

            if let error = model.authorizationError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Spacer()
            Button {
                Task { await model.requestAuthorization() }
            } label: {
                Text("Allow Screen Time Access")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding()
        }
    }
}
