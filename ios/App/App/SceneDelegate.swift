import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    // UIKit legt das Fenster aus Main.storyboard an (UISceneStoryboardFile in der Info.plist).
    // So bleibt eine eigene CAPBridgeViewController-Unterklasse im Storyboard wirksam.
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Wird mit der Scene-Lifecycle statt application(_:open:options:) aufgerufen
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        // Universal Links, ersetzt application(_:continue:restorationHandler:)
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
