package io.stephanus.attendix.liveplan;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Replaces the Firebase Messaging plugin's service (see AndroidManifest.xml) so
 * silent "live_plan" data messages from the live-activity-tick Edge Function
 * update the plan notification even while the app is closed. Every other
 * message goes through the plugin exactly as before.
 */
public class LivePlanMessagingService extends io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (!"live_plan".equals(data.get("type"))) {
            super.onMessageReceived(remoteMessage);
            return;
        }
        try {
            int attendanceId = Integer.parseInt(data.get("attendanceId"));
            String planKey = data.get("planKey");
            String event = data.get("event");
            String title = data.get("title") != null ? data.get("title") : "";
            if (planKey == null) {
                return;
            }
            if ("end".equals(event) && data.get("state") == null) {
                LivePlanNotifications.cancel(this, attendanceId, planKey);
                return;
            }
            JSONObject state = new JSONObject(data.get("state"));
            LivePlanTitles.put(this, attendanceId, planKey, title);
            LivePlanNotifications.show(this, attendanceId, planKey, title, state);
        } catch (NumberFormatException | JSONException | NullPointerException e) {
            // Malformed message; ignore.
        }
    }
}
