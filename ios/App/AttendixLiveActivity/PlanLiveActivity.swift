import ActivityKit
import SwiftUI
import WidgetKit

/// Live Activity of a running Ablaufplan: lock screen banner and Dynamic Island.
/// Countdown and progress are rendered by the system (timer texts), so the
/// app/server only sends an update when the current item changes.
@available(iOS 16.1, *)
struct PlanLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PlanActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.78))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(deepLink(context.attributes))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.title)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(positionText(context.state))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedIslandView(state: context.state, isStale: context.isStale)
                        .padding(.horizontal, 4)
                }
            } compactLeading: {
                HStack(spacing: 4) {
                    ProgressRing(state: context.state)
                        .frame(width: 18, height: 18)
                    Text(context.state.phase == "running" ? "\(context.state.index)/\(context.state.total)" : "")
                        .font(.caption2.weight(.semibold))
                }
            } compactTrailing: {
                CountdownText(state: context.state, isStale: context.isStale)
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .frame(maxWidth: 52)
            } minimal: {
                ProgressRing(state: context.state)
                    .frame(width: 20, height: 20)
            }
            .widgetURL(deepLink(context.attributes))
            .keylineTint(LiveColors.accent)
        }
    }
}

enum LiveColors {
    static let accent = Color(red: 0.30, green: 0.55, blue: 1.0)
    static let overdue = Color(red: 1.0, green: 0.70, blue: 0.25)
    static let done = Color(red: 0.24, green: 0.81, blue: 0.56)
}

@available(iOS 16.1, *)
private func deepLink(_ attributes: PlanActivityAttributes) -> URL? {
    URL(string: "attendix://live-plan?attendance=\(attributes.attendanceId)&plan=\(attributes.planKey)")
}

@available(iOS 16.1, *)
private func positionText(_ state: PlanActivityAttributes.ContentState) -> String {
    switch state.phase {
    case "before": return "Startet \(clock(state.planStartDate))"
    case "ended": return "Beendet"
    default: return "Punkt \(state.index) von \(state.total)"
    }
}

private func clock(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "de_DE")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
}

/// Remaining time of the current item. `Text(date, style: .timer)` counts down
/// and keeps counting up after the end, which shows an overrun until the next
/// update arrives; `isStale` (staleDate = item end + 1 min) colours it.
@available(iOS 16.1, *)
struct CountdownText: View {
    let state: PlanActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        switch state.phase {
        case "before":
            Text(state.planStartDate, style: .timer)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.white)
        case "ended":
            Image(systemName: "checkmark")
                .foregroundStyle(LiveColors.done)
        default:
            HStack(spacing: 0) {
                if isStale { Text("+") }
                Text(state.endDate, style: .timer)
                    .multilineTextAlignment(.trailing)
            }
            .foregroundStyle(isStale ? LiveColors.overdue : LiveColors.accent)
        }
    }
}

@available(iOS 16.1, *)
struct ProgressRing: View {
    let state: PlanActivityAttributes.ContentState

    var body: some View {
        if state.phase == "running", state.endsAt > state.startsAt {
            ProgressView(timerInterval: state.startDate...state.endDate, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .progressViewStyle(.circular)
            .tint(LiveColors.accent)
        } else if state.phase == "ended" {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(LiveColors.done)
        } else {
            Image(systemName: "list.bullet")
                .foregroundStyle(LiveColors.accent)
        }
    }
}

@available(iOS 16.1, *)
struct ItemProgressBar: View {
    let state: PlanActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        if state.phase == "running", state.endsAt > state.startsAt, !isStale {
            ProgressView(timerInterval: state.startDate...state.endDate, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(LiveColors.accent)
        } else if state.phase == "running" {
            Capsule().fill(LiveColors.overdue).frame(height: 4)
        }
    }
}

@available(iOS 16.1, *)
struct CurrentItemView: View {
    let state: PlanActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(headline)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(state.title)
                    .font(.headline)
                    .lineLimit(2)
                if !state.subtitle.isEmpty {
                    Text(state.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            CountdownText(state: state, isStale: isStale)
                .font(.title2.monospacedDigit().weight(.semibold))
                .frame(maxWidth: 110, alignment: .trailing)
        }
    }

    private var headline: String {
        switch state.phase {
        case "before": return "Startet um \(clock(state.planStartDate))"
        case "ended": return "\(clock(state.planStartDate)) – \(clock(state.planEndDate))"
        default: return "Jetzt · Punkt \(state.index) von \(state.total)"
        }
    }
}

@available(iOS 16.1, *)
struct NextItemsView: View {
    let state: PlanActivityAttributes.ContentState
    let limit: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(state.next.prefix(limit).enumerated()), id: \.offset) { entry in
                let item = entry.element
                HStack {
                    Text(limit == 1 ? "Danach: \(item.name)" : item.name)
                        .lineLimit(1)
                    Spacer()
                    Text(clock(Date(timeIntervalSince1970: item.at)))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
                .font(.subheadline)
            }
            if state.phase == "running" && state.next.isEmpty {
                HStack {
                    Text(limit == 1 ? "Danach: Ende" : "Ende")
                    Spacer()
                    Text(clock(state.planEndDate)).monospacedDigit().foregroundStyle(.secondary)
                }
                .font(.subheadline)
            }
        }
    }
}

@available(iOS 16.1, *)
struct LockScreenView: View {
    let context: ActivityViewContext<PlanActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "list.bullet.rectangle.fill")
                    .foregroundStyle(LiveColors.accent)
                Text(context.attributes.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                Text("bis \(clock(context.state.planEndDate))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            CurrentItemView(state: context.state, isStale: context.isStale)
            ItemProgressBar(state: context.state, isStale: context.isStale)
            if context.state.phase != "ended" {
                NextItemsView(state: context.state, limit: 2)
            }
        }
        .padding(16)
        .foregroundStyle(.white)
    }
}

@available(iOS 16.1, *)
struct ExpandedIslandView: View {
    let state: PlanActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CurrentItemView(state: state, isStale: isStale)
            ItemProgressBar(state: state, isStale: isStale)
            if state.phase != "ended" {
                NextItemsView(state: state, limit: 1)
            }
        }
    }
}
