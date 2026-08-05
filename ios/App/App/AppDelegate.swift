import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    // APNs-токен получен → отдаём его Firebase и берём FCM-токен,
    // который Capacitor прокинет в JS как событие 'registration'.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error = error {
                NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
            } else if let token = token {
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // Deep links (в т.ч. возврат из оплаты subday://) — НЕ удалять.
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}

// MARK: - ScreenGuard (блокировка скриншота/записи экрана на отдельном экране)
//
// Приём тот же, что у банковских приложений: слой окна помещается ВНУТРЬ «секретного»
// слоя невидимого UITextField (isSecureTextEntry=true). Система исключает такой слой из
// скриншотов, записи экрана и AirPlay-трансляции — кадр выходит ЧЁРНЫМ. Оборачиваем один
// раз (лениво), а enable/disable лишь переключают isSecureTextEntry. Дёргается точечно из
// JS (src/lib/screenGuard.ts) на экране показа QR; вне его — защита выключена.
//
// Плагин определён здесь (в уже компилируемом файле таргета) и подхватывается Capacitor 8
// автоматически по протоколу CAPBridgedPlugin — регистрировать вручную не нужно. Провал
// (напр. изменение внутренних слоёв в будущей iOS) «мягкий»: защита просто не сработает,
// приложение НЕ падает (JS-обёртка глотает ошибку).
@objc(ScreenGuardPlugin)
public class ScreenGuardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScreenGuardPlugin"
    public let jsName = "ScreenGuard"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise)
    ]

    private var secureField: UITextField?

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.setSecure(true); call.resolve() }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.setSecure(false); call.resolve() }
    }

    private func setSecure(_ secure: Bool) {
        guard let window = (self.bridge?.viewController?.view.window)
            ?? UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first(where: { $0.isKeyWindow })
        else { return }

        // Первый вызов — один раз оборачиваем слой окна в секретный слой поля.
        if secureField == nil {
            let field = UITextField()
            field.isUserInteractionEnabled = false
            window.addSubview(field)
            window.layer.superlayer?.addSublayer(field.layer)
            field.layer.sublayers?.last?.addSublayer(window.layer)
            secureField = field
        }
        // Включаем/выключаем защиту — просто переключаем secureTextEntry.
        secureField?.isSecureTextEntry = secure
    }
}
