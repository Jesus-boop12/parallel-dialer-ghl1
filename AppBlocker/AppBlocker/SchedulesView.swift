import SwiftUI
import FamilyControls

/// List of repeating daily restrictions.
struct SchedulesView: View {
    @EnvironmentObject private var model: BlockerModel
    @State private var editingSchedule: BlockSchedule?
    @State private var showingNewSchedule = false

    var body: some View {
        NavigationStack {
            Group {
                if model.schedules.isEmpty {
                    emptyState
                } else {
                    scheduleList
                }
            }
            .navigationTitle("Schedules")
            .toolbar {
                Button {
                    showingNewSchedule = true
                } label: {
                    Image(systemName: "plus")
                }
            }
            .sheet(isPresented: $showingNewSchedule) {
                ScheduleEditorView(schedule: nil)
            }
            .sheet(item: $editingSchedule) { schedule in
                ScheduleEditorView(schedule: schedule)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "calendar.badge.clock")
                .font(.system(size: 56))
                .foregroundStyle(.secondary)
            Text("No Schedules Yet")
                .font(.title3.bold())
            Text("Create a schedule to block apps automatically at the same time every day — like social media during work hours or everything after bedtime.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 32)
            Button("New Schedule") { showingNewSchedule = true }
                .buttonStyle(.borderedProminent)
        }
    }

    private var scheduleList: some View {
        List {
            ForEach(model.schedules) { schedule in
                ScheduleRow(schedule: schedule) {
                    editingSchedule = schedule
                }
            }
            .onDelete { offsets in
                for index in offsets {
                    model.delete(model.schedules[index])
                }
            }
        }
    }
}

private struct ScheduleRow: View {
    @EnvironmentObject private var model: BlockerModel
    let schedule: BlockSchedule
    let onTap: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(schedule.name)
                    .font(.headline)
                Text("\(timeLabel(schedule.startMinutes)) – \(timeLabel(schedule.endMinutes)) · \(weekdayLabel(schedule.weekdays))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Toggle("", isOn: Binding(
                get: { schedule.isEnabled },
                set: { model.toggle(schedule, enabled: $0) }
            ))
            .labelsHidden()
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }

    private func timeLabel(_ minutes: Int) -> String {
        let components = DateComponents(hour: minutes / 60, minute: minutes % 60)
        let date = Calendar.current.date(from: components) ?? Date()
        return date.formatted(date: .omitted, time: .shortened)
    }

    private func weekdayLabel(_ weekdays: Set<Int>) -> String {
        if weekdays.count == 7 { return "Every day" }
        if weekdays == [2, 3, 4, 5, 6] { return "Weekdays" }
        if weekdays == [1, 7] { return "Weekends" }
        let symbols = Calendar.current.shortWeekdaySymbols
        return weekdays.sorted().map { symbols[$0 - 1] }.joined(separator: " ")
    }
}
