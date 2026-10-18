package io.stephanus.attendix.liveplan;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * Same API as the iOS LiveActivityPlugin, backed by an ongoing notification.
 * Android has no push tokens per activity: the server reaches the device via
 * its normal FCM token (see LivePlanMessagingService).
 */
@CapacitorPlugin(name = "LiveActivity")
public class LiveActivityPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", LivePlanNotifications.canPost(getContext()));
        result.put("pushToStart", true);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        show(call, true);
    }

    @PluginMethod
    public void update(PluginCall call) {
        show(call, false);
    }

    private void show(PluginCall call, boolean isStart) {
        Integer attendanceId = call.getInt("attendanceId");
        String planKey = call.getString("planKey");
        JSONObject state = call.getObject("state");
        if (attendanceId == null || planKey == null || state == null) {
            call.reject("attendanceId, planKey and state are required");
            return;
        }
        String title = call.getString("title", "");
        boolean shown = LivePlanNotifications.activeIds(getContext()).contains(LivePlanNotifications.notificationId(attendanceId, planKey));
        if (!isStart && !shown) {
            JSObject result = new JSObject();
            result.put("updated", false);
            call.resolve(result);
            return;
        }
        if (!isStart) {
            title = LivePlanTitles.get(getContext(), attendanceId, planKey, title);
        } else {
            LivePlanTitles.put(getContext(), attendanceId, planKey, title);
        }
        LivePlanNotifications.show(getContext(), attendanceId, planKey, title, state);
        JSObject result = new JSObject();
        result.put("id", attendanceId + ":" + planKey);
        result.put("updated", true);
        call.resolve(result);
    }

    @PluginMethod
    public void end(PluginCall call) {
        Integer attendanceId = call.getInt("attendanceId");
        String planKey = call.getString("planKey");
        if (attendanceId == null || planKey == null) {
            call.reject("attendanceId and planKey are required");
            return;
        }
        JSONObject state = call.getObject("state");
        if (state != null && !call.getBoolean("immediate", false)) {
            LivePlanNotifications.show(getContext(), attendanceId, planKey, LivePlanTitles.get(getContext(), attendanceId, planKey, ""), state);
        } else {
            LivePlanNotifications.cancel(getContext(), attendanceId, planKey);
        }
        call.resolve();
    }

    @PluginMethod
    public void endAll(PluginCall call) {
        LivePlanNotifications.cancelAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray activities = new JSArray();
        for (LivePlanTitles.Entry entry : LivePlanTitles.all(getContext())) {
            if (LivePlanNotifications.activeIds(getContext()).contains(LivePlanNotifications.notificationId(entry.attendanceId, entry.planKey))) {
                JSObject item = new JSObject();
                item.put("id", entry.attendanceId + ":" + entry.planKey);
                item.put("attendanceId", entry.attendanceId);
                item.put("planKey", entry.planKey);
                activities.put(item);
            }
        }
        JSObject result = new JSObject();
        result.put("activities", activities);
        call.resolve(result);
    }

    @PluginMethod
    public void getTokens(PluginCall call) {
        JSObject result = new JSObject();
        result.put("activityTokens", new JSArray());
        call.resolve(result);
    }
}
