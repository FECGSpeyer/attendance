import UIKit
import Capacitor

/// Registers the app's own native plugins (not installed via npm).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
