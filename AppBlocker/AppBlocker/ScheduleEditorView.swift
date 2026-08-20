import SwiftUI
import FamilyControls

/// Create or edit a repeating schedule.
struct ScheduleEditorView: View {
    @EnvironmentObject private var model: BlockerModel
    @Environment(\.dismiss) private var dismiss

    let existing: BlockSchedule?

    @State private var name: String
    @State private var selection: FamilyActivitySelection
    @State private var startTime: Date
    @State private var endTime: Date
    @State private var weekdays: Set<Int>
    @State private var showingPicker = false

    init(schedule: BlockSchedule?) {
        existing = schedule
        let calendar = Calendar.current
        func date(fromMinutes minutes: Int) -> Date {
            calendar.date(from: DateComponents(hour: minutes / 60, minute: minutes % 60)) ?? Date()
        }
        _name = State(initialValue: schedule?.name ?? "")
        _selection = State(initialValue: schedule?.selection ?? FamilyActivitySelection())
        _startTime = State(initialValue: date(fromMinutes: schedule?.startMinutes ?? 9 * 60))
        _endTime = State(initialValue: date(fromMinutes: schedule?.endMinutes ?? 17 * 60))
        _weekdays = State(initialValue: schedule?.weekdays ?? [2, 3, 4, 5, 6])
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("e.g. Work Focus, Bedtime", text: $name)
                }

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
                    .familyActivityPicker(isPresented: $showingPicker, selection: $selection)
                }

                Section("When") {
                    DatePicker("Start", selection: $startTime, displayedComponents: .hourAndMinute)
                    DatePicker("End", selection: $endTime, displayedComponents: .hourAndMinute)
                    WeekdayPicker(selected: $weekdays)
                }
            }
            .navigationTitle(existing == nil ? "New Schedule" : "Edit Schedule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(!isValid)
                }
            }
        }
    }

    private var selectionSummary: String {
        let count = selection.applicationTokens.count + selection.categoryTokens.count
        return count == 0 ? "None" : "\(count) selected"
    }

    private var isValid: Bool {
        let hasSelection = !selection.applicationTokens.isEmpty || !selection.categoryTokens.isEmpty
        return hasSelection && !weekdays.isEmpty && minutes(startTime) != minutes(endTime)
    }

    private func minutes(_ date: Date) -> Int {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (components.hour ?? 0) * 60 + (components.minute ?? 0)
    }

    private func save() {
        var schedule = existing ?? BlockSchedule(
            name: "",
            selection: selection,
            startMinutes: 0,
            endMinutes: 0,
            weekdays: []
        )
        schedule.name = name.isEmpty ? "Schedule" : name
        schedule.selection = selection
        schedule.startMinutes = minutes(startTime)
        schedule.endMinutes = minutes(endTime)
        schedule.weekdays = weekdays
        model.addOrUpdate(schedule)
        dismiss()
    }
}

/// Circular Sun–Sat toggles.
private struct WeekdayPicker: View {
    @Binding var selected: Set<Int>

    var body: some View {
        HStack(spacing: 8) {
            ForEach(1...7, id: \.self) { day in
                let label = Calendar.current.veryShortWeekdaySymbols[day - 1]
                let isOn = selected.contains(day)
                Button {
                    if isOn { selected.remove(day) } else { selected.insert(day) }
                } label: {
                    Text(label)
                        .font(.callout.bold())
                        .frame(width: 36, height: 36)
                        .background(isOn ? Color.accentColor : Color(.systemGray5))
                        .foregroundStyle(isOn ? .white : .primary)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
    }
}
