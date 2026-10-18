package io.stephanus.attendix;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import io.stephanus.attendix.liveplan.LiveActivityPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins must be registered before super.onCreate.
        registerPlugin(LiveActivityPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
