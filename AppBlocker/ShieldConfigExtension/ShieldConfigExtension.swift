import ManagedSettings
import ManagedSettingsUI
import UIKit

/// Customizes the full-screen "blocked" overlay iOS shows when the user
/// opens a shielded app or website.
final class ShieldConfigExtension: ShieldConfigurationDataSource {
    private func makeConfiguration(title: String) -> ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: UIColor.black.withAlphaComponent(0.6),
            icon: UIImage(systemName: "hand.raised.fill"),
            title: .init(text: title, color: .white),
            subtitle: .init(
                text: "You blocked this to stay focused. It will unlock when your timer or schedule ends.",
                color: UIColor.white.withAlphaComponent(0.8)
            ),
            primaryButtonLabel: .init(text: "OK", color: .black),
            primaryButtonBackgroundColor: .white
        )
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        makeConfiguration(title: application.localizedDisplayName.map { "\($0) is Blocked" } ?? "App Blocked")
    }

    override func configuration(
        shielding application: Application,
        in category: ActivityCategory
    ) -> ShieldConfiguration {
        makeConfiguration(title: application.localizedDisplayName.map { "\($0) is Blocked" } ?? "App Blocked")
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        makeConfiguration(title: webDomain.domain.map { "\($0) is Blocked" } ?? "Website Blocked")
    }

    override func configuration(
        shielding webDomain: WebDomain,
        in category: ActivityCategory
    ) -> ShieldConfiguration {
        makeConfiguration(title: webDomain.domain.map { "\($0) is Blocked" } ?? "Website Blocked")
    }
}
