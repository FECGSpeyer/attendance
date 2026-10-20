import Foundation
import Capacitor
import UIKit
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
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        let reporter = LiveActivityTokenReporter.shared
        reporter.onPushToStartToken = { [weak self] token in
            self?.notifyListeners("pushToStartToken", data: ["token": token], retainUntilConsumed: true)
        }
        reporter.onActivityToken = { [weak self] payload in
            self?.notifyListeners("activityToken", data: payload, retainUntilConsumed: true)
        }
        reporter.start()
    }

    /// Where the reporter sends update tokens while the app runs in the background.
    @objc func configure(_ call: CAPPluginCall) {
        guard let url = call.getString("url"), let key = call.getString("key") else {
            return call.reject("url and key are required")
        }
        LiveActivityTokenReporter.shared.configure(url: url, key: key)
        call.resolve()
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
                LiveActivityTokenReporter.shared.observeTokens(of: activity)
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
        let reporter = LiveActivityTokenReporter.shared
        var result: [String: Any] = ["activityTokens": Array(reporter.activityTokens.values)]
        if let token = reporter.pushToStartToken { result["pushToStartToken"] = token }
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

}

/// Observes Live Activity push tokens from app launch on, also when iOS only
/// wakes the app in the background after a push-to-start (no WebView then).
/// Update tokens are sent straight to the `live-activity-token` Edge Function,
/// so the server can move the activity on without the app being opened.
final class LiveActivityTokenReporter {
    static let shared = LiveActivityTokenReporter()

    private static let urlKey = "liveActivity.apiUrl"
    private static let apiKeyKey = "liveActivity.apiKey"
    private static let startTokenKey = "liveActivity.pushToStartToken"

    /// Last known tokens, so JS can read them after it attached its listeners.
    private(set) var pushToStartToken: String?
    private(set) var activityTokens: [String: [String: Any]] = [:]
    var onPushToStartToken: ((String) -> Void)?
    var onActivityToken: (([String: Any]) -> Void)?
    private var observing = false
    private var observedActivities = Set<String>()

    private init() {
        pushToStartToken = UserDefaults.standard.string(forKey: Self.startTokenKey)
    }

    func configure(url: String, key: String) {
        UserDefaults.standard.set(url, forKey: Self.urlKey)
        UserDefaults.standard.set(key, forKey: Self.apiKeyKey)
    }

    /// Called from AppDelegate on every launch and again by the plugin; runs once.
    func start() {
        guard #available(iOS 16.2, *) else { return }
        DispatchQueue.main.async { self.startObserving() }
    }

    @available(iOS 16.2, *)
    private func startObserving() {
        guard !observing else { return }
        observing = true
        for activity in Activity<PlanActivityAttributes>.activities {
            observeTokens(of: activity)
        }
        // Activities started by a push-to-start notification show up here.
        Task { @MainActor in
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
            Task { @MainActor in
                for await data in Activity<PlanActivityAttributes>.pushToStartTokenUpdates {
                    let token = Self.hex(data)
                    pushToStartToken = token
                    UserDefaults.standard.set(token, forKey: Self.startTokenKey)
                    onPushToStartToken?(token)
                }
            }
        }
    }

    @available(iOS 16.2, *)
    func observeTokens(of activity: Activity<PlanActivityAttributes>) {
        DispatchQueue.main.async {
            guard self.observedActivities.insert(activity.id).inserted else { return }
            Task { @MainActor in
                for await data in activity.pushTokenUpdates {
                    let payload: [String: Any] = [
                        "attendanceId": activity.attributes.attendanceId,
                        "planKey": activity.attributes.planKey,
                        "token": Self.hex(data),
                    ]
                    self.activityTokens[activity.id] = payload
                    self.onActivityToken?(payload)
                    self.upload(payload)
                }
            }
        }
    }

    /// The server finds the user by this device's push-to-start token.
    private func upload(_ payload: [String: Any]) {
        guard let base = UserDefaults.standard.string(forKey: Self.urlKey),
              let key = UserDefaults.standard.string(forKey: Self.apiKeyKey),
              let startToken = pushToStartToken,
              let url = URL(string: "\(base)/functions/v1/live-activity-token") else { return }
        var body = payload
        body["startToken"] = startToken
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(key, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        // Finish the request even if iOS only woke the app for this.
        var task: UIBackgroundTaskIdentifier = .invalid
        task = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(task) }
        URLSession.shared.dataTask(with: request) { _, _, _ in
            DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(task) }
        }.resume()
    }

    private static func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}
