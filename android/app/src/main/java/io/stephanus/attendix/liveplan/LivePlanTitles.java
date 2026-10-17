package io.stephanus.attendix.liveplan;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Remembers the header of each shown plan notification, so updates without a title keep it. */
final class LivePlanTitles {

    private static final String PREFS = "live_plan_titles";

    static final class Entry {
        final int attendanceId;
        final String planKey;

        Entry(int attendanceId, String planKey) {
            this.attendanceId = attendanceId;
            this.planKey = planKey;
        }
    }

    private LivePlanTitles() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void put(Context context, int attendanceId, String planKey, String title) {
        prefs(context).edit().putString(attendanceId + ":" + planKey, title).apply();
    }

    static String get(Context context, int attendanceId, String planKey, String fallback) {
        String stored = prefs(context).getString(attendanceId + ":" + planKey, null);
        return stored != null ? stored : fallback;
    }

    static List<Entry> all(Context context) {
        List<Entry> entries = new ArrayList<>();
        for (Map.Entry<String, ?> e : prefs(context).getAll().entrySet()) {
            String key = e.getKey();
            int sep = key.indexOf(':');
            if (sep <= 0) {
                continue;
            }
            try {
                entries.add(new Entry(Integer.parseInt(key.substring(0, sep)), key.substring(sep + 1)));
            } catch (NumberFormatException ignored) {
                // not one of ours
            }
        }
        return entries;
    }
}
