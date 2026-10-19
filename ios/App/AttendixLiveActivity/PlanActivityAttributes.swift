import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Shared between the app (LiveActivityPlugin) and the widget extension.
/// ContentState mirrors `LivePlanState` in supabase/functions/_shared/live-plan-state.ts;
/// the Edge Function sends exactly these keys as `content-state`.
/// Times are epoch seconds (Double) so pushes don't depend on Swift's date coding.
@available(iOS 16.1, *)
public struct PlanActivityAttributes: ActivityAttributes {
    public struct NextItem: Codable, Hashable {
        public var name: String
        public var at: Double
    }

    public struct ContentState: Codable, Hashable {
        /// "before" | "running" | "ended"
        public var phase: String
        public var index: Int
        public var total: Int
        public var title: String
        public var subtitle: String
        public var startsAt: Double
        public var endsAt: Double
        public var next: [NextItem]
        public var planStart: Double
        public var planEnd: Double
        /// Start of every item; missing in pushes from older servers.
        public var bounds: [Double]?
    }

    public var attendanceId: Int
    /// "main" for plan 1, otherwise the id of the extra plan.
    public var planKey: String
    /// Termin name, with the plan's label when the Termin has several plans.
    public var title: String
}

@available(iOS 16.1, *)
extension PlanActivityAttributes.ContentState {
    var startDate: Date { Date(timeIntervalSince1970: startsAt) }
    var endDate: Date { Date(timeIntervalSince1970: endsAt) }
    var planStartDate: Date { Date(timeIntervalSince1970: planStart) }
    var planEndDate: Date { Date(timeIntervalSince1970: planEnd) }
}
