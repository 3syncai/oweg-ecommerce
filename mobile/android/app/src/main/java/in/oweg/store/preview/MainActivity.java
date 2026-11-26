package in.oweg.store.preview;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The storefront header is white, so keep status bar icons (clock, wifi,
        // battery) dark. Otherwise they render white-on-white and look missing.
        Window window = getWindow();
        window.setStatusBarColor(Color.WHITE);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(true);
    }
}
