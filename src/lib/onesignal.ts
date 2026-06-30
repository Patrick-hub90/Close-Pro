// Notifications push via OneSignal. L'App ID est public par nature (exposé côté client).
const APP_ID = 'dcb18cac-e4a6-468a-978b-703a1759758e'

declare global {
  interface Window { OneSignalDeferred?: ((os: any) => void | Promise<void>)[] }
}

let started = false

function defer(fn: (os: any) => void | Promise<void>) {
  if (typeof window === 'undefined') return
  window.OneSignalDeferred = window.OneSignalDeferred || []
  window.OneSignalDeferred.push(fn)
}

/** Charge le SDK et initialise OneSignal une seule fois (son service worker est isolé sur /onesignal/). */
export function initPush() {
  if (started || typeof window === 'undefined') return
  started = true
  defer(async (OneSignal) => {
    try {
      await OneSignal.init({
        appId: APP_ID,
        serviceWorkerParam: { scope: '/onesignal/' },
        serviceWorkerPath: 'onesignal/OneSignalSDKWorker.js',
        allowLocalhostAsSecureOrigin: true,
      })
    } catch (e) { console.error('[Close-Pro] OneSignal init', e) }
  })
  const s = document.createElement('script')
  s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
  s.defer = true
  document.head.appendChild(s)
}

/** Lie l'utilisateur connecté (external id = id agent) pour pouvoir cibler ses notifications. */
export function pushLogin(externalId: string) { defer((os) => { try { os.login(externalId) } catch { /* sdk pas prêt */ } }) }
export function pushLogout() { defer((os) => { try { os.logout() } catch { /* sdk pas prêt */ } }) }

/** Demande l'autorisation d'afficher des notifications (à appeler sur un clic utilisateur). */
export function pushPrompt() { defer(async (os) => { try { await os.Notifications.requestPermission() } catch { /* refus */ } }) }

/** État de la permission navigateur. */
export function pushPermission(): 'default' | 'granted' | 'denied' {
  if (typeof Notification === 'undefined') return 'denied'
  return Notification.permission
}

/** Le navigateur supporte-t-il les notifications push ? */
export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}
