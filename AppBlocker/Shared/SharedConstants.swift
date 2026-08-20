import Foundation
import DeviceActivity
import ManagedSettings

/// Values shared between the main app and the extensions.
enum SharedConstants {
    /// App Group used to pass data between the app and its extensions.
    /// Must match the App Group enabled on all three targets.
    static let appGroupID = "group.com.jcmarketing.appblocker"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroupID) ?? .standard
    }
}

extension DeviceActivityName {
    /// The one-shot focus timer session.
    static let focusTimer = Self("focusTimer")

    /// A repeating daily schedule. One activity per saved schedule.
    static func schedule(id: UUID) -> Self {
        Self("schedule_\(id.uuidString)")
    }
}

extension ManagedSettingsStore.Name {
    /// Store used by the manual/timer block.
    static let focus = Self("focus")

    /// Store used by a repeating schedule. One store per saved schedule
    /// so overlapping schedules don't clear each other's shields.
    static func schedule(id: UUID) -> Self {
        Self("schedule_\(id.uuidString)")
    }
}
