import Foundation
import FamilyControls

/// A repeating daily restriction, e.g. "block social apps 9:00–17:00 on weekdays".
struct BlockSchedule: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String
    /// The apps/categories to block, as chosen in the FamilyActivityPicker.
    var selection: FamilyActivitySelection
    /// Minutes from midnight, local time.
    var startMinutes: Int
    var endMinutes: Int
    /// Weekdays the schedule applies to (1 = Sunday ... 7 = Saturday, Calendar convention).
    var weekdays: Set<Int>
    var isEnabled: Bool = true

    var startComponents: DateComponents {
        DateComponents(hour: startMinutes / 60, minute: startMinutes % 60)
    }

    var endComponents: DateComponents {
        DateComponents(hour: endMinutes / 60, minute: endMinutes % 60)
    }

    static func == (lhs: BlockSchedule, rhs: BlockSchedule) -> Bool {
        lhs.id == rhs.id
    }
}

/// State of the one-shot focus timer, persisted so the UI can restore it
/// and the monitor extension knows what to unblock.
struct FocusSession: Codable {
    var selection: FamilyActivitySelection
    var endDate: Date

    var isActive: Bool { endDate > Date() }
}
