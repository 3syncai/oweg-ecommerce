import UIKit
import Capacitor

/// Keeps the Capacitor WebView edge-to-edge under the status bar.
/// The StatusBar plugin can shrink `view`/`webView` (they are the same object)
/// and leave a solid white native strip above the page — that was the iPhone gap.
class AppViewController: CAPBridgeViewController {
    override open func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        pinWebViewEdgeToEdge()
    }

    override open func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        pinWebViewEdgeToEdge()
    }

    override open func viewWillTransition(
        to size: CGSize,
        with coordinator: UIViewControllerTransitionCoordinator
    ) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: { _ in
            self.pinWebViewEdgeToEdge()
        }, completion: { _ in
            self.pinWebViewEdgeToEdge()
        })
    }

    private func pinWebViewEdgeToEdge() {
        guard let window = view.window else { return }
        let bounds = window.bounds
        if view.frame != bounds {
            view.frame = bounds
        }
        if let webView = webView, webView.frame != bounds {
            webView.frame = bounds
        }
        // Never let UIKit add a second top inset on top of CSS safe-area padding.
        additionalSafeAreaInsets = .zero
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }
}
