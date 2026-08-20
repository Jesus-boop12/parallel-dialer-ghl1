import SwiftUI
import FamilyControls

/// One-shot focus timer: pick apps, pick a duration, block until time is up.
struct FocusTimerView: View {
    @EnvironmentObject private var model: BlockerModel
    @State private var showingPicker = false
    @State private var selectedMinutes = 30

    private let presets = [15, 30, 60, 120, 240, 480]

    var body: some View {
        NavigationStack {
            Group {
                if let session = model.activeFocusSession, session.isActive {
                    activeSessionView(session)
                } else {
                    setupView
                }
            }
            .navigationTitle("Focus Timer")
        }
    }

    // MARK: Setup

    private var setupView: some View {
        Form {
            Section("What to block") {
                Button {
                    showingPicker = true
                } label: {
                    HStack {
                        Label("Choose Apps & Categories", systemImage: "apps.iphone")
                        Spacer()
                        Text(selectionSummary)
                            .foregroundStyle(.secondary)
                    }
                }
                .familyActivityPicker(isPresented: $showingPicker, selection: $model.focusSelection)
            }

            Section("For how long") {
                Picker("Duration", selection: $selectedMinutes) {
                    ForEach(presets, id: \.self) { minutes in
                        Text(durationLabel(minutes)).tag(minutes)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()

                Stepper(value: $selectedMinutes, in: 1...1440, step: 5) {
                    Text("Custom: \(durationLabel(selectedMinutes))")
                }
            }

            Section {
                Button {
                    model.startFocusTimer(minutes: selectedMinutes)
                } label: {
                    Label("Start Blocking", systemImage: "lock.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .listRowInsets(EdgeInsets())
                .disabled(model.focusSelectionIsEmpty)
            } footer: {
                if model.focusSelectionIsEmpty {
                    Text("Pick at least one app or category first.")
                }
            }
        }
    }

    private var selectionSummary: String {
        let apps = model.focusSelection.applicationTokens.count
        let categories = model.focusSelection.categoryTokens.count
        if apps == 0 && categories == 0 { return "None" }
        var parts: [String] = []
        if apps > 0 { parts.append("\(apps) app\(apps == 1 ? "" : "s")") }
        if categories > 0 { parts.append("\(categories) categor\(categories == 1 ? "y" : "ies")") }
        return parts.joined(separator: ", ")
    }

    // MARK: Active session

    private func activeSessionView(_ session: FocusSession) -> some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "lock.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.tint)
            Text("Apps Blocked")
                .font(.title.bold())
            Text(remainingLabel(until: session.endDate))
                .font(.system(size: 44, weight: .semibold, design: .monospaced))
            Text("Ends at \(session.endDate.formatted(date: .omitted, time: .shortened))")
                .foregroundStyle(.secondary)
            Spacer()
            Button(role: .destructive) {
                model.stopFocusTimer()
            } label: {
                Text("End Early")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .padding()
        }
    }

    // MARK: Formatting

    private func durationLabel(_ minutes: Int) -> String {
        if minutes < 60 { return "\(minutes) min" }
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? "\(h) hr" : "\(h) hr \(m) min"
    }

    private func remainingLabel(until end: Date) -> String {
        let remaining = max(0, Int(end.timeIntervalSinceNow))
        let h = remaining / 3600
        let m = (remaining % 3600) / 60
        let s = remaining % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%02d:%02d", m, s)
    }
}
