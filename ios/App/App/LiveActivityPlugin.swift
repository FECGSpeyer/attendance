import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Starts, updates and ends the Ablaufplan Live Activity and reports the push
/// tokens the server needs (push-to-start per device, update token per activity).
/// JS side: src/app/services/live-activity/live-activity.service.ts
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTokens", returnType: CAPPluginReturnPromise),
    ]

    /// Last known tokens, so JS can read them after it attached its listeners.
    private var pushToStartToken: String?
    private var activityTokens: [String: [String: Any]] = [:]
    private var observing = false

    override public func load() {
        if #available(iOS 16.2, *) {
            startObserving()
        }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            var pushToStart = false
            if #available(iOS 17.2, *) { pushToStart = true }
            call.resolve([
                "available": ActivityAuthorizationInfo().areActivitiesEnabled,
                "pushToStart": pushToStart,
            ])
        } else {
            call.resolve(["available": false, "pushToStart": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.reject("Live Activities need iOS 16.2") }
        guard let attendanceId = call.getInt("attendanceId"),
              let planKey = call.getString("planKey"),
              let title = call.getString("title"),
              let state = decodeState(call) else {
            return call.reject("attendanceId, planKey, title and state are required")
        }
        Task {
            if let existing = findActivity(attendanceId: attendanceId, planKey: planKey) {
                await existing.update(content(for: state))
                return call.resolve(["id": existing.id])
            }
            do {
                let attributes = PlanActivityAttributes(attendanceId: attendanceId, planKey: planKey, title: title)
                let activity = try Activity.request(attributes: attributes, content: content(for: state), pushType: .token)
                observeTokens(of: activity)
                call.resolve(["id": activity.id])
            } catch {
                call.reject("Could not start Live Activity: \(error.localizedDescription)")
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.reject("Live Activities need iOS 16.2") }
        guard let attendanceId = call.getInt("attendanceId"),
              let planKey = call.getString("planKey"),
              let state = decodeState(call) else {
            return call.reject("attendanceId, planKey and state are required")
        }
        Task {
            guard let activity = findActivity(attendanceId: attendanceId, planKey: planKey) else {
                return call.resolve(["updated": false])
            }
            await activity.update(content(for: state))
            call.resolve(["updated": true])
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        guard let attendanceId = call.getInt("attendanceId"),
              let planKey = call.getString("planKey") else {
            return call.reject("attendanceId and planKey are required")
        }
        let state = decodeState(call)
        let immediate = call.getBool("immediate") ?? false
        Task {
            if let activity = findActivity(attendanceId: attendanceId, planKey: planKey) {
                await activity.end(state.map { content(for: $0) }, dismissalPolicy: immediate ? .immediate : .default)
            }
            call.resolve()
        }
    }

    @objc func endAll(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        Task {
            for activity in Activity<PlanActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    @objc func list(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve(["activities": []]) }
        let items = Activity<PlanActivityAttributes>.activities
            .filter { $0.activityState == .active || $0.activityState == .stale }
            .map { ["id": $0.id, "attendanceId": $0.attributes.attendanceId, "planKey": $0.attributes.planKey] as [String: Any] }
        call.resolve(["activities": items])
    }

    @objc func getTokens(_ call: CAPPluginCall) {
        var result: [String: Any] = ["activityTokens": Array(activityTokens.values)]
        if let token = pushToStartToken { result["pushToStartToken"] = token }
        call.resolve(result)
    }

    // MARK: - Helpers

    @available(iOS 16.2, *)
    private func findActivity(attendanceId: Int, planKey: String) -> Activity<PlanActivityAttributes>? {
        Activity<PlanActivityAttributes>.activities.first {
            $0.attributes.attendanceId == attendanceId && $0.attributes.planKey == planKey
                && ($0.activityState == .active || $0.activityState == .stale)
        }
    }

    @available(iOS 16.2, *)
    private func decodeState(_ call: CAPPluginCall) -> PlanActivityAttributes.ContentState? {
        guard let raw = call.getObject("state"),
              let data = try? JSONSerialization.data(withJSONObject: raw) else { return nil }
        return try? JSONDecoder().decode(PlanActivityAttributes.ContentState.self, from: data)
    }

    /// Stale one minute after the current item should have ended; the widget then shows the overrun.
    @available(iOS 16.2, *)
    private func content(for state: PlanActivityAttributes.ContentState) -> ActivityContent<PlanActivityAttributes.ContentState> {
        let stale: Date?
        switch state.phase {
        case "before": stale = Date(timeIntervalSince1970: state.planStart + 60)
        case "running": stale = Date(timeIntervalSince1970: state.endsAt + 60)
        default: stale = nil
        }
        return ActivityContent(state: state, staleDate: stale)
    }

    @available(iOS 16.2, *)
    private func startObserving() {
        guard !observing else { return }
        observing = true
        for activity in Activity<PlanActivityAttributes>.activities {
            observeTokens(of: activity)
        }
        // Activities started by a push-to-start notification show up here.
        Task {
            for await activity in Activity<PlanActivityAttributes>.activityUpdates {
                // A push-to-start can race with a start from the open app: keep only the newest.
                for other in Activity<PlanActivityAttributes>.activities where other.id != activity.id
                    && other.attributes.attendanceId == activity.attributes.attendanceId
                    && other.attributes.planKey == activity.attributes.planKey {
                    await other.end(nil, dismissalPolicy: .immediate)
                }
                observeTokens(of: activity)
            }
        }
        if #available(iOS 17.2, *) {
            Task {
                for await data in Activity<PlanActivityAttributes>.pushToStartTokenUpdates {
                    let token = hex(data)
                    pushToStartToken = token
                    notifyListeners("pushToStartToken", data: ["token": token], retainUntilConsumed: true)
                }
            }
        }
    }

    @available(iOS 16.2, *)
    private func observeTokens(of activity: Activity<PlanActivityAttributes>) {
        Task {
            for await data in activity.pushTokenUpdates {
                let payload: [String: Any] = [
                    "attendanceId": activity.attributes.attendanceId,
                    "planKey": activity.attributes.planKey,
                    "token": hex(data),
                ]
                activityTokens[activity.id] = payload
                notifyListeners("activityToken", data: payload, retainUntilConsumed: true)
            }
        }
    }

    private func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}
