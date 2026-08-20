import SwiftUI

@main
struct AppBlockerApp: App {
    @StateObject private var model = BlockerModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
        }
    }
}
