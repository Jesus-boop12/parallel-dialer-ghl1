import DeviceActivity
import ManagedSettings
import Foundation

/// Runs in the background, woken by iOS at schedule boundaries.
/// Applies shields when a blocking window starts and removes them when it ends —
/// even if the main app isn't running.
final class MonitorExtension: DeviceActivityMonitor {
    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)

        if activity == .focusTimer {
            // Shield was already applied by the app; re-apply defensively.
            if let session = SharedStore.loadFocusSession(), session.isActive {
                SharedStore.applyShield(session.selection, to: .focus)
            }
            return
        }

        guard let id = scheduleID(from: activity),
              let schedule = SharedStore.schedule(id: id),
              schedule.isEnabled
        else { return }

        // Repeating DeviceActivity schedules fire every day; only shield on
        // the weekdays the user picked.
        let weekday = Calendar.current.component(.weekday, from: Date())
        guard schedule.weekdays.contains(weekday) else { return }

        SharedStore.applyShield(schedule.selection, to: .schedule(id: id))
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)

        if activity == .focusTimer {
            SharedStore.clearShield(from: .focus)
            SharedStore.saveFocusSession(nil)
            return
        }

        if let id = scheduleID(from: activity) {
            SharedStore.clearShield(from: .schedule(id: id))
        }
    }

    private func scheduleID(from activity: DeviceActivityName) -> UUID? {
        guard activity.rawValue.hasPrefix("schedule_") else { return nil }
        return UUID(uuidString: String(activity.rawValue.dropFirst("schedule_".count)))
    }
}
