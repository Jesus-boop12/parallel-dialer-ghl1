import Foundation
import Combine
import FamilyControls
import DeviceActivity
import ManagedSettings

/// Central state for the app: Screen Time authorization, the one-shot
/// focus timer, and the repeating schedules.
@MainActor
final class BlockerModel: ObservableObject {
    @Published var isAuthorized = false
    @Published var authorizationError: String?

    /// Selection used by the focus timer screen.
    @Published var focusSelection = FamilyActivitySelection()
    @Published var activeFocusSession: FocusSession?

    @Published var schedules: [BlockSchedule] = []

    private let center = DeviceActivityCenter()
    private var timerCancellable: AnyCancellable?

    init() {
        isAuthorized = AuthorizationCenter.shared.authorizationStatus == .approved
        schedules = SharedStore.loadSchedules()
        restoreFocusSession()
    }

    // MARK: - Authorization

    func requestAuthorization() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            isAuthorized = AuthorizationCenter.shared.authorizationStatus == .approved
            authorizationError = nil
        } catch {
            isAuthorized = false
            authorizationError = error.localizedDescription
        }
    }

    // MARK: - Focus timer (one-shot block for a duration)

    private func restoreFocusSession() {
        guard let session = SharedStore.loadFocusSession() else { return }
        if session.isActive {
            activeFocusSession = session
            focusSelection = session.selection
            startCountdownRefresh()
        } else {
            // Session expired while the app was closed; make sure it's cleaned up.
            SharedStore.saveFocusSession(nil)
            SharedStore.clearShield(from: .focus)
        }
    }

    var focusSelectionIsEmpty: Bool {
        focusSelection.applicationTokens.isEmpty
            && focusSelection.categoryTokens.isEmpty
            && focusSelection.webDomainTokens.isEmpty
    }

    /// Blocks the selected apps immediately for `minutes` minutes.
    func startFocusTimer(minutes: Int) {
        guard !focusSelectionIsEmpty, minutes >= 1 else { return }

        let endDate = Date().addingTimeInterval(TimeInterval(minutes * 60))
        let session = FocusSession(selection: focusSelection, endDate: endDate)
        SharedStore.saveFocusSession(session)

        // Shield right away so the block is instant.
        SharedStore.applyShield(focusSelection, to: .focus)

        // Ask DeviceActivity to wake the monitor extension when time is up,
        // so the shield is removed even if this app isn't running.
        let calendar = Calendar.current
        let start = calendar.dateComponents([.hour, .minute, .second], from: Date())
        let end = calendar.dateComponents([.hour, .minute, .second], from: endDate)
        let schedule = DeviceActivitySchedule(intervalStart: start, intervalEnd: end, repeats: false)

        center.stopMonitoring([.focusTimer])
        do {
            try center.startMonitoring(.focusTimer, during: schedule)
        } catch {
            // DeviceActivity requires intervals of at least 15 minutes. For
            // shorter timers the extension won't fire; the app clears the
            // shield itself when the countdown ends (see startCountdownRefresh),
            // or on next launch if it was closed.
        }

        activeFocusSession = session
        startCountdownRefresh()
    }

    /// Ends the focus session early.
    func stopFocusTimer() {
        center.stopMonitoring([.focusTimer])
        SharedStore.clearShield(from: .focus)
        SharedStore.saveFocusSession(nil)
        activeFocusSession = nil
        timerCancellable = nil
    }

    private func startCountdownRefresh() {
        timerCancellable = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self else { return }
                if let session = self.activeFocusSession, !session.isActive {
                    self.stopFocusTimer()
                } else {
                    // Nudge SwiftUI to re-render the countdown.
                    self.objectWillChange.send()
                }
            }
    }

    // MARK: - Repeating schedules

    func addOrUpdate(_ schedule: BlockSchedule) {
        if let index = schedules.firstIndex(of: schedule) {
            schedules[index] = schedule
        } else {
            schedules.append(schedule)
        }
        SharedStore.saveSchedules(schedules)
        syncMonitoring(for: schedule)
    }

    func delete(_ schedule: BlockSchedule) {
        schedules.removeAll { $0.id == schedule.id }
        SharedStore.saveSchedules(schedules)
        center.stopMonitoring([.schedule(id: schedule.id)])
        SharedStore.clearShield(from: .schedule(id: schedule.id))
    }

    func toggle(_ schedule: BlockSchedule, enabled: Bool) {
        var updated = schedule
        updated.isEnabled = enabled
        addOrUpdate(updated)
    }

    /// Starts or stops DeviceActivity monitoring to match the schedule's state.
    private func syncMonitoring(for schedule: BlockSchedule) {
        let name = DeviceActivityName.schedule(id: schedule.id)
        center.stopMonitoring([name])

        guard schedule.isEnabled else {
            SharedStore.clearShield(from: .schedule(id: schedule.id))
            return
        }

        // DeviceActivity has no per-weekday filter on a repeating daily
        // schedule, so the monitor extension checks the weekday at interval
        // start and only shields on selected days.
        let activitySchedule = DeviceActivitySchedule(
            intervalStart: schedule.startComponents,
            intervalEnd: schedule.endComponents,
            repeats: true
        )
        do {
            try center.startMonitoring(name, during: activitySchedule)
            // If we're already inside the window right now, shield immediately —
            // intervalDidStart won't fire until the next boundary.
            if isNowInside(schedule) {
                SharedStore.applyShield(schedule.selection, to: .schedule(id: schedule.id))
            }
        } catch {
            authorizationError = "Could not start schedule: \(error.localizedDescription)"
        }
    }

    private func isNowInside(_ schedule: BlockSchedule) -> Bool {
        let calendar = Calendar.current
        let now = Date()
        guard schedule.weekdays.contains(calendar.component(.weekday, from: now)) else { return false }
        let minutes = calendar.component(.hour, from: now) * 60 + calendar.component(.minute, from: now)
        return minutes >= schedule.startMinutes && minutes < schedule.endMinutes
    }
}
