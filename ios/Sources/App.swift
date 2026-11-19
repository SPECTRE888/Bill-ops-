import SwiftUI
import UIKit
import WebKit
import AuthenticationServices

// Helm Ops iPhone : coque native autour de la PWA (mobile/index.html, servie par GitHub Pages).
// Mises à jour de l'interface sans republier l'app ; seul le login Google passe par une feuille Safari.

let appURL = URL(string: "https://spectre888.github.io/Bill-ops-/")!

@main
struct HelmOpsApp: App {
    var body: some Scene { WindowGroup { WebHost().ignoresSafeArea() } }
}

let bg = UIColor(red: 8 / 255, green: 8 / 255, blue: 8 / 255, alpha: 1)

struct WebHost: UIViewRepresentable {
    func makeCoordinator() -> Bridge { Bridge() }
    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.userContentController.addUserScript(WKUserScript(source: "window.__helmNative=true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let w = WKWebView(frame: .zero, configuration: cfg)
        w.isOpaque = false
        w.backgroundColor = bg
        w.scrollView.backgroundColor = bg
        w.scrollView.contentInsetAdjustmentBehavior = .never
        w.allowsBackForwardNavigationGestures = false
        #if DEBUG
        // Inspecteur Safari réservé aux builds de développement : en production il exposerait la session et les données clients à qui branche le téléphone sur un Mac.
        if #available(iOS 16.4, *) { w.isInspectable = true }
        #endif
        w.uiDelegate = context.coordinator
        w.navigationDelegate = context.coordinator
        context.coordinator.web = w
        w.load(URLRequest(url: appURL, cachePolicy: .reloadRevalidatingCacheData))
        return w
    }
    func updateUIView(_ v: WKWebView, context: Context) {}
}

@MainActor
final class Bridge: NSObject, WKUIDelegate, WKNavigationDelegate, ASWebAuthenticationPresentationContextProviding {
    weak var web: WKWebView?
    private var session: ASWebAuthenticationSession?

    nonisolated func presentationAnchor(for s: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { web?.window ?? UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first! }
    }

    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        guard let u = a.request.url else { decisionHandler(.allow); return }
        // Login Google : Google refuse les WebView, on passe par ASWebAuthenticationSession.
        if u.host?.hasSuffix("supabase.co") == true, u.path.hasSuffix("/auth/v1/authorize") {
            decisionHandler(.cancel); googleLogin(u); return
        }
        let interne = u.host == appURL.host || u.host?.hasSuffix("supabase.co") == true || ["about", "blob", "data"].contains(u.scheme ?? "")
        if a.targetFrame?.isMainFrame != false, !interne, ["http", "https", "mailto", "tel"].contains(u.scheme ?? "") {
            UIApplication.shared.open(u); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }

    private func googleLogin(_ u: URL) {
        var c = URLComponents(url: u, resolvingAgainstBaseURL: false)!
        c.queryItems = (c.queryItems ?? []).map {
            $0.name == "redirect_to" ? URLQueryItem(name: "redirect_to", value: appURL.absoluteString) : $0
        }
        let s = ASWebAuthenticationSession(url: c.url!, callbackURLScheme: "helmops") { [weak self] cb, _ in
            Task { @MainActor in
                guard let self, let cb, let frag = cb.fragment else { return }
                // URL différente de la page courante (paramètre ?login=…) sinon WebKit ne fait qu'un saut d'ancre sans recharger.
                self.web?.load(URLRequest(url: URL(string: appURL.absoluteString + "?login=\(Int(Date().timeIntervalSince1970))#" + frag)!))
            }
        }
        s.presentationContextProvider = self
        s.prefersEphemeralWebBrowserSession = true
        session?.cancel()
        session = s
        // iOS refuse parfois de présenter la feuille si l'app n'est pas encore active : on réessaie.
        let ok = s.start()
        if !ok {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                if s.start() == false { self?.web?.evaluateJavaScript("document.getElementById('loginStatus').textContent='Impossible d\\'ouvrir Google, réessaie.'") }
            }
        }
    }

    // Liens target=_blank (PDF, mentions…) : Safari.
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url, ["http", "https", "mailto", "tel"].contains(u.scheme ?? "") { UIApplication.shared.open(u) }
        return nil
    }

    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable () -> Void) {
        let a = UIAlertController(title: nil, message: m, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        guard let top = topController() else { completionHandler(); return }
        top.present(a, animated: true)
    }

    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: m, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "Confirmer", style: .destructive) { _ in completionHandler(true) })
        guard let top = topController() else { completionHandler(false); return }
        top.present(a, animated: true)
    }

    func webView(_ w: WKWebView, runJavaScriptTextInputPanelWithPrompt p: String, defaultText d: String?, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (String?) -> Void) {
        let a = UIAlertController(title: nil, message: p, preferredStyle: .alert)
        a.addTextField { $0.text = d }
        a.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        guard let top = topController() else { completionHandler(nil); return }
        top.present(a, animated: true)
    }

    private func topController() -> UIViewController? {
        var t = web?.window?.rootViewController
        while let p = t?.presentedViewController { t = p }
        return t
    }
}
