package io.stephanus.attendix.liveplan;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import io.stephanus.attendix.R;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Ongoing notification of a running Ablaufplan, the Android counterpart of the
 * iOS Live Activity. On Android 16 it is requested as a promoted "Live Update"
 * (status bar chip). The state JSON matches LivePlanState in
 * supabase/functions/_shared/live-plan-state.ts.
 */
public final class LivePlanNotifications {

    public static final String CHANNEL_ID = "live_plan";
    static final String TAG = "live-plan";
    /** Notification.EXTRA_REQUEST_PROMOTED_ONGOING (API 36), as a literal so older compile SDKs work. */
    private static final String EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing";
    private static final long TAIL_MS = 15 * 60 * 1000;

    private LivePlanNotifications() {}

    public static boolean canPost(Context context) {
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    public static int notificationId(int attendanceId, String planKey) {
        return (attendanceId + ":" + planKey).hashCode();
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Laufender Ablaufplan", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Zeigt den aktuellen Punkt eines laufenden Ablaufplans");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private static String clock(double epochSeconds) {
        return new SimpleDateFormat("HH:mm", Locale.GERMANY).format(new Date((long) (epochSeconds * 1000)));
    }

    /** Posts or replaces the notification for one plan. */
    public static void show(Context context, int attendanceId, String planKey, String title, JSONObject state) {
        if (!canPost(context)) {
            return;
        }
        ensureChannel(context);
        String phase = state.optString("phase", "running");
        int index = state.optInt("index", 1);
        int total = state.optInt("total", 1);
        JSONArray next = state.optJSONArray("next");
        double planEnd = state.optDouble("planEnd", 0);

        String nextLine;
        if (next != null && next.length() > 0) {
            JSONObject first = next.optJSONObject(0);
            nextLine = "Danach: " + first.optString("name") + " · " + clock(first.optDouble("at"));
        } else {
            nextLine = "Danach: Ende · " + clock(planEnd);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_live_plan)
            .setSubText(title)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openIntent(context, attendanceId, planKey));

        switch (phase) {
            case "before":
                builder
                    .setContentTitle("Startet um " + clock(state.optDouble("planStart")))
                    .setContentText("Zuerst: " + state.optString("title"))
                    .setOngoing(true)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true)
                    .setShowWhen(true)
                    .setWhen((long) (state.optDouble("planStart") * 1000));
                break;
            case "ended":
                builder
                    .setContentTitle("Ablaufplan beendet")
                    .setContentText(clock(state.optDouble("planStart")) + " – " + clock(planEnd))
                    .setOngoing(false)
                    .setAutoCancel(true)
                    .setTimeoutAfter(TAIL_MS);
                break;
            default:
                String subtitle = state.optString("subtitle", "");
                builder
                    .setContentTitle(state.optString("title"))
                    .setContentText(subtitle.isEmpty() ? nextLine : subtitle + " · " + nextLine)
                    .setOngoing(true)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true)
                    .setShowWhen(true)
                    .setWhen((long) (state.optDouble("endsAt") * 1000))
                    .setProgress(Math.max(total, 1), Math.max(index - 1, 0), false);
                break;
        }
        if (!"ended".equals(phase)) {
            // Drop it on its own if no "end" arrives (app killed, no network).
            builder.setTimeoutAfter(Math.max(60_000L, (long) (planEnd * 1000) + TAIL_MS - System.currentTimeMillis()));
            builder.getExtras().putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true);
        }

        try {
            NotificationManagerCompat.from(context).notify(TAG, notificationId(attendanceId, planKey), builder.build());
        } catch (SecurityException e) {
            // Notification permission revoked meanwhile.
        }
    }

    public static void cancel(Context context, int attendanceId, String planKey) {
        NotificationManagerCompat.from(context).cancel(TAG, notificationId(attendanceId, planKey));
    }

    public static void cancelAll(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        for (StatusBarNotification n : manager.getActiveNotifications()) {
            if (TAG.equals(n.getTag())) {
                manager.cancel(TAG, n.getId());
            }
        }
    }

    /** Ids of the plan notifications currently shown. */
    public static List<Integer> activeIds(Context context) {
        List<Integer> ids = new ArrayList<>();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        for (StatusBarNotification n : manager.getActiveNotifications()) {
            if (TAG.equals(n.getTag())) {
                ids.add(n.getId());
            }
        }
        return ids;
    }

    private static PendingIntent openIntent(Context context, int attendanceId, String planKey) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("attendix://live-plan?attendance=" + attendanceId + "&plan=" + Uri.encode(planKey)));
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            notificationId(attendanceId, planKey),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
