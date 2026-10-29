package com.anxiouslyokay.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;

/**
 * Privacy screen: the recents/app-switcher thumbnail never shows entries.
 * Android 13+: the system thumbnail is disabled outright. Older versions: a cream
 * cover with the app name is placed over the content when the activity pauses.
 * Screenshots inside the app are still allowed (no FLAG_SECURE).
 */
public class MainActivity extends BridgeActivity {
    private FrameLayout privacyCover;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            setRecentsScreenshotEnabled(false);
        }
    }

    @Override
    public void onPause() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && privacyCover == null) {
            privacyCover = new FrameLayout(this);
            privacyCover.setBackgroundColor(Color.parseColor("#FFFBF5"));
            TextView name = new TextView(this);
            name.setText(R.string.app_name);
            name.setTextColor(Color.parseColor("#2A1C0E"));
            name.setTextSize(22);
            privacyCover.addView(name, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
            addContentView(privacyCover, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (privacyCover != null) {
            ViewGroup parent = (ViewGroup) privacyCover.getParent();
            if (parent != null) parent.removeView(privacyCover);
            privacyCover = null;
        }
    }
}
