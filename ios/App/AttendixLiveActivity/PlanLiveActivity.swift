import ActivityKit
import SwiftUI
import WidgetKit

/// Live Activity of a running Ablaufplan: lock screen banner and Dynamic Island.
/// Layout: the current item large with its remaining time, a timeline bar for
/// the whole plan, then the next items like a printed programme.
/// Countdown and progress are rendered by the system (timer views), so the
/// app/server only sends an update when the current item changes.
@available(iOS 16.1, *)
struct PlanLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PlanActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.8))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(deepLink(context.attributes))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        StatusDot(state: shownState(context))
                        Text(islandTitle(shownState(context)))
                            .font(.headline)
                            .lineLimit(1)
                    }
                    .padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    CountdownText(state: shownState(context))
                        .font(.title3.monospacedDigit().weight(.bold))
                        .padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        TimelineBar(state: shownState(context))
                            .frame(height: 4)
                        NextItemsView(state: shownState(context), limit: 1)
                    }
                    .padding(.horizontal, 6)
                }
            } compactLeading: {
                Text(islandTitle(shownState(context)))
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .frame(maxWidth: 84, alignment: .leading)
            } compactTrailing: {
                CountdownText(state: shownState(context))
                    .font(.caption.monospacedDigit().weight(.bold))
                    .frame(maxWidth: 48)
            } minimal: {
                ProgressRing(state: shownState(context))
                    .frame(width: 20, height: 20)
            }
            .widgetURL(deepLink(context.attributes))
            .keylineTint(LiveColors.accent)
        }
    }
}

enum LiveColors {
    /// Attendix teal, lightened for the dark Live Activity background.
    static let accent = Color(red: 0.37, green: 0.72, blue: 0.75)
    /// Grey of the segments still to come, also drawn behind the running one.
    static let track = Color.white.opacity(0.3)
    static let secondary = Color(white: 0.72)
    static let done = Color(red: 0.24, green: 0.81, blue: 0.56)
}

/// iOS marks the activity stale a minute after the current item (or the start) is over.
/// If the update for the next item didn't arrive by then (e.g. weak network), the plan
/// is assumed to run by the clock, so it never sits on "Beginnt in 0:00".
@available(iOS 16.1, *)
private func shownState(_ context: ActivityViewContext<PlanActivityAttributes>) -> PlanActivityAttributes.ContentState {
    if #available(iOS 16.2, *), context.isStale {
        return context.state.advanced(to: Date())
    }
    return context.state
}

@available(iOS 16.1, *)
extension PlanActivityAttributes.ContentState {
    /// The item running at `now`, as far as `next` and `bounds` reach.
    func advanced(to now: Date) -> Self {
        guard phase != "ended", let bounds, !bounds.isEmpty else { return self }
        let nowSec = now.timeIntervalSince1970
        var state = self
        if nowSec >= planEnd {
            state.phase = "ended"
            state.index = total
            state.title = "Ablaufplan beendet"
            state.subtitle = ""
            state.next = []
            return state
        }
        // Before the start the first item is next[0] (see iosLiveState), so it counts as step 0.
        guard let k = next.lastIndex(where: { $0.at <= nowSec }) else { return self }
        let item = next[k]
        state.phase = "running"
        state.index = (phase == "before" ? index - 1 : index) + k + 1
        state.title = item.name
        state.subtitle = ""
        state.startsAt = item.at
        state.endsAt = bounds.first(where: { $0 > item.at }) ?? planEnd
        state.next = Array(next.dropFirst(k + 1))
        return state
    }
}

@available(iOS 16.1, *)
private func deepLink(_ attributes: PlanActivityAttributes) -> URL? {
    URL(string: "attendix://live-plan?attendance=\(attributes.attendanceId)&plan=\(attributes.planKey)")
}

private func clock(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "de_DE")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
}

@available(iOS 16.1, *)
private func islandTitle(_ state: PlanActivityAttributes.ContentState) -> String {
    switch state.phase {
    case "before": return "Beginnt \(clock(state.planStartDate))"
    case "ended": return "Beendet"
    default: return state.title
    }
}

/// Remaining time of the current item (before the start: time until the start).
/// Counts down and stops at 0:00 until the update for the next item arrives.
@available(iOS 16.1, *)
struct CountdownText: View {
    let state: PlanActivityAttributes.ContentState

    var body: some View {
        switch state.phase {
        case "before":
            Text(timerInterval: min(Date(), state.planStartDate)...state.planStartDate, countsDown: true)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.white)
        case "ended":
            Image(systemName: "checkmark")
                .foregroundStyle(LiveColors.done)
        default:
            Text(timerInterval: state.startDate...max(state.startDate, state.endDate), countsDown: true)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(LiveColors.accent)
        }
    }
}

@available(iOS 16.1, *)
struct StatusDot: View {
    let state: PlanActivityAttributes.ContentState

    var body: some View {
        Circle()
            .fill(state.phase == "running" ? LiveColors.accent : (state.phase == "ended" ? LiveColors.done : LiveColors.track))
            .frame(width: 10, height: 10)
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

/// One segment per item, as wide as its share of the plan: done items filled,
/// the current one filling up live, later ones grey.
@available(iOS 16.1, *)
struct TimelineBar: View {
    let state: PlanActivityAttributes.ContentState

    private struct Segment {
        let start: Double
        let end: Double
    }

    private var segments: [Segment] {
        guard let bounds = state.bounds, !bounds.isEmpty else { return [] }
        return bounds.enumerated().compactMap { entry in
            let end = entry.offset + 1 < bounds.count ? bounds[entry.offset + 1] : state.planEnd
            return end > entry.element ? Segment(start: entry.element, end: end) : nil
        }
    }

    var body: some View {
        let items = segments
        if items.isEmpty {
            // Push from an older server without bounds: progress of the current item only.
            SingleItemBar(state: state)
        } else {
            GeometryReader { geo in
                let spacing: CGFloat = 3
                let total = max(state.planEnd - state.planStart, 1)
                let usable = max(geo.size.width - spacing * CGFloat(items.count - 1), 0)
                HStack(spacing: spacing) {
                    ForEach(Array(items.enumerated()), id: \.offset) { entry in
                        let segment = entry.element
                        SegmentView(state: state, start: segment.start, end: segment.end)
                            .frame(width: usable * CGFloat((segment.end - segment.start) / total))
                    }
                }
            }
        }
    }
}

@available(iOS 16.1, *)
private struct SegmentView: View {
    let state: PlanActivityAttributes.ContentState
    let start: Double
    let end: Double

    var body: some View {
        let done = state.phase == "ended" || (state.phase == "running" && end <= state.startsAt)
        let current = state.phase == "running" && start == state.startsAt
        if current {
            ProgressView(timerInterval: Date(timeIntervalSince1970: start)...Date(timeIntervalSince1970: end), countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .progressViewStyle(.linear)
            .tint(LiveColors.accent)
            // The system track is almost invisible on the dark background: same grey as the later segments behind it.
            .frame(height: 4)
            .background(Capsule().fill(LiveColors.track))
            .clipShape(Capsule())
        } else {
            Capsule().fill(done ? LiveColors.accent : LiveColors.track)
                .frame(height: 4)
        }
    }
}

@available(iOS 16.1, *)
private struct SingleItemBar: View {
    let state: PlanActivityAttributes.ContentState

    var body: some View {
        if state.phase == "running", state.endsAt > state.startsAt {
            ProgressView(timerInterval: state.startDate...state.endDate, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .progressViewStyle(.linear)
            .tint(LiveColors.accent)
        } else {
            Capsule().fill(state.phase == "ended" ? LiveColors.accent : LiveColors.track)
        }
    }
}

/// Current item and its remaining time (before the start: time until the start).
@available(iOS 16.1, *)
struct CurrentItemView: View {
    let state: PlanActivityAttributes.ContentState

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.caption2.weight(.bold))
                    .tracking(0.8)
                    .foregroundStyle(state.phase == "running" ? LiveColors.accent : LiveColors.secondary)
                Text(headline)
                    .font(.headline)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                if state.phase == "running" && !state.subtitle.isEmpty && state.title.count <= 26 {
                    Text(state.subtitle)
                        .font(.caption)
                        .foregroundStyle(LiveColors.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 0) {
                if state.phase == "before" {
                    Text("in").font(.caption2).foregroundStyle(LiveColors.secondary)
                }
                CountdownText(state: state)
                    .font(.system(size: 28, weight: .bold).monospacedDigit())
                    .frame(maxWidth: 110, alignment: .trailing)
            }
        }
    }

    private var label: String {
        switch state.phase {
        case "before": return "BEGINNT UM \(clock(state.planStartDate))"
        case "ended": return "\(clock(state.planStartDate)) – \(clock(state.planEndDate))"
        default: return "JETZT"
        }
    }

    private var headline: String {
        switch state.phase {
        case "before": return "Noch nicht gestartet"
        case "ended": return "Ablaufplan beendet"
        default: return state.title
        }
    }
}

@available(iOS 16.1, *)
struct NextItemsView: View {
    let state: PlanActivityAttributes.ContentState
    let limit: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(state.next.prefix(limit).enumerated()), id: \.offset) { entry in
                ProgrammeRow(label: entry.offset == 0 ? firstLabel : nil, name: entry.element.name,
                             time: clock(Date(timeIntervalSince1970: entry.element.at)))
            }
            if state.phase == "running" && state.next.isEmpty {
                ProgrammeRow(label: firstLabel, name: "Ende", time: clock(state.planEndDate))
            }
        }
    }
}

@available(iOS 16.1, *)
extension NextItemsView {
    /// The plan's first item comes through `next` before the start (see iosLiveState).
    var firstLabel: String { state.phase == "before" ? "Als Erstes" : "Danach" }
}

@available(iOS 16.1, *)
private struct ProgrammeRow: View {
    let label: String?
    let name: String
    let time: String

    var body: some View {
        HStack(spacing: 6) {
            if let label {
                Text(label)
                    .foregroundStyle(LiveColors.secondary)
            }
            Text(name)
                .lineLimit(1)
            Spacer(minLength: 6)
            Text(time)
                .monospacedDigit()
                .foregroundStyle(LiveColors.secondary)
        }
        .font(.subheadline)
    }
}

@available(iOS 16.1, *)
struct LockScreenView: View {
    let context: ActivityViewContext<PlanActivityAttributes>

    var body: some View {
        let state = shownState(context)
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Image(systemName: "list.bullet.rectangle.fill")
                    .foregroundStyle(LiveColors.accent)
                Text(context.attributes.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                Text(headerDetail(state))
                    .font(.caption)
                    .foregroundStyle(LiveColors.secondary)
            }
            CurrentItemView(state: state)
            TimelineBar(state: state)
                .frame(height: 4)
            if state.phase != "ended" {
                NextItemsView(state: state, limit: 1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .foregroundStyle(.white)
    }

    private func headerDetail(_ state: PlanActivityAttributes.ContentState) -> String {
        switch state.phase {
        case "running": return "Punkt \(state.index) von \(state.total)"
        case "ended": return "Beendet"
        default: return "\(clock(state.planStartDate)) – \(clock(state.planEndDate))"
        }
    }
}
