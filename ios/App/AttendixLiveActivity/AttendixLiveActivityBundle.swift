import SwiftUI
import WidgetKit

@main
struct AttendixLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            PlanLiveActivity()
        }
    }
}
