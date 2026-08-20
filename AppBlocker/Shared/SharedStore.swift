import Foundation
import FamilyControls
import ManagedSettings

/// Reads/writes shared state in the App Group so the main app and the
/// DeviceActivity monitor extension see the same data.
enum SharedStore {
    private static let schedulesKey = "blockSchedules"
    private static let focusSessionKey = "focusSession"

    // MARK: Schedules

    static func loadSchedules() -> [BlockSchedule] {
        guard let data = SharedConstants.defaults.data(forKey: schedulesKey),
              let schedules = try? JSONDecoder().decode([BlockSchedule].self, from: data)
        else { return [] }
        return schedules
    }

    static func saveSchedules(_ schedules: [BlockSchedule]) {
        guard let data = try? JSONEncoder().encode(schedules) else { return }
        SharedConstants.defaults.set(data, forKey: schedulesKey)
    }

    static func schedule(id: UUID) -> BlockSchedule? {
        loadSchedules().first { $0.id == id }
    }

    // MARK: Focus timer session

    static func loadFocusSession() -> FocusSession? {
        guard let data = SharedConstants.defaults.data(forKey: focusSessionKey),
              let session = try? JSONDecoder().decode(FocusSession.self, from: data)
        else { return nil }
        return session
    }

    static func saveFocusSession(_ session: FocusSession?) {
        guard let session, let data = try? JSONEncoder().encode(session) else {
            SharedConstants.defaults.removeObject(forKey: focusSessionKey)
            return
        }
        SharedConstants.defaults.set(data, forKey: focusSessionKey)
    }

    // MARK: Shield application (used by both app and extension)

    /// Applies the selection's apps, categories, and web domains as shields
    /// on the given store.
    static func applyShield(_ selection: FamilyActivitySelection, to storeName: ManagedSettingsStore.Name) {
        let store = ManagedSettingsStore(named: storeName)
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty
            ? nil
            : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
        store.shield.webDomainCategories = selection.categoryTokens.isEmpty
            ? nil
            : .specific(selection.categoryTokens)
    }

    /// Removes all shields from the given store.
    static func clearShield(from storeName: ManagedSettingsStore.Name) {
        ManagedSettingsStore(named: storeName).clearAllSettings()
    }
}
