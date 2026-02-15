// Content script pro aplikaci změn hlasitosti na stránkách
let currentVolume = 1.0
const audioElements = new Set()
let currentTabId = null

// Získat tabId této záložky
chrome.runtime.sendMessage({ action: 'getCurrentTabId' }, (response) => {
    if (response && response.tabId) {
        currentTabId = response.tabId
        // Načíst uloženou hlasitost pro tuto záložku
        chrome.runtime.sendMessage({ action: 'getVolume', tabId: currentTabId }, (response) => {
            if (response && response.volume !== undefined) {
                applyVolume(response.volume)
            }
        })
    }
})

// Funkce pro aplikaci hlasitosti na všechny audio/video elementy
function applyVolume(volume) {
    currentVolume = volume

    // Najít všechny audio a video elementy
    const allMedia = document.querySelectorAll('audio, video')

    allMedia.forEach((media) => {
        audioElements.add(media)
        media.volume = volume

        // Sledovat změny hlasitosti zvenčí a obnovit naši hodnotu
        const originalVolumeSetter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume')?.set
        if (originalVolumeSetter) {
            Object.defineProperty(media, 'volume', {
                get: function () {
                    return currentVolume
                },
                set: function (value) {
                    // Ignorovat externí změny, použít naši hodnotu
                    originalVolumeSetter.call(this, currentVolume)
                },
                configurable: true
            })
        }
    })
}

// Sledování nových audio/video elementů
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
                // Element node
                // Zkontrolovat přidané audio/video elementy
                if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
                    audioElements.add(node)
                    node.volume = currentVolume
                }

                // Zkontrolovat vnořené audio/video elementy
                const mediaElements = node.querySelectorAll?.('audio, video')
                if (mediaElements) {
                    mediaElements.forEach((media) => {
                        audioElements.add(media)
                        media.volume = currentVolume
                    })
                }
            }
        })
    })
})

// Spustit observer
if (document.body) {
    observer.observe(document.body, {
        childList: true,
        subtree: true
    })
} else {
    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, {
            childList: true,
            subtree: true
        })
    })
}

// Aplikovat hlasitost při načtení stránky
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        applyVolume(currentVolume)
    })
} else {
    applyVolume(currentVolume)
}

// Funkce pro kontrolu, jestli stránka má audio/video elementy
function hasMediaElements() {
    const currentUrl = window.location.href.toLowerCase()
    const hostname = window.location.hostname.toLowerCase()

    // Seznam domén, které typicky mají audio/video obsah
    const mediaDomains = ['youtube.com', 'youtu.be', 'twitch.tv', 'twitch.com', 'spotify.com', 'soundcloud.com', 'vimeo.com', 'netflix.com', 'hulu.com', 'dailymotion.com', 'bitchute.com', 'facebook.com/watch', 'instagram.com', 'tiktok.com', 'twitter.com', 'discord.com', 'discordapp.com', 'mixer.com', 'dlive.tv', 'streamable.com']

    // Kontrola hostname - pokud je to známá media stránka, vrať true
    for (const domain of mediaDomains) {
        if (hostname.includes(domain) || currentUrl.includes(domain)) {
            return true
        }
    }

    // Zkontrolovat, jestli jsou nějaké audio/video elementy
    const mediaElements = document.querySelectorAll('audio, video')
    if (mediaElements.length > 0) {
        // Zkontrolovat, jestli alespoň jeden má src nebo source elementy nebo je playing
        for (const media of mediaElements) {
            if (media.src || media.querySelector('source') || media.currentSrc || !media.paused || media.readyState > 0) {
                return true
            }
        }
    }

    // Zkontrolovat, jestli jsou nějaké iframe s možným audio/video obsahem
    const iframes = document.querySelectorAll('iframe')
    for (const iframe of iframes) {
        const src = (iframe.src || iframe.getAttribute('src') || '').toLowerCase()
        const dataSrc = (iframe.getAttribute('data-src') || '').toLowerCase()
        const combinedSrc = src + dataSrc

        // Kontrola URL iframe
        for (const domain of mediaDomains) {
            if (combinedSrc.includes(domain)) {
                return true
            }
        }

        // Kontrola přístupu k obsahu iframe (pokud není CORS)
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
            if (iframeDoc) {
                const iframeMedia = iframeDoc.querySelectorAll('audio, video')
                if (iframeMedia.length > 0) {
                    return true
                }
            }
        } catch (e) {
            // CORS chyba - pokud iframe má src, může obsahovat media
            if (src && !src.startsWith('about:') && !src.startsWith('javascript:')) {
                // Pokud iframe má nějaký src, může obsahovat media
                // Ale to je příliš obecné, takže to přeskočíme
            }
        }
    }

    // Kontrola specifických selektorů pro známé služby
    // Twitch specifické selektory
    if (document.querySelector('[data-a-player], [data-a-target="player-container"], video[data-a-target="player-video"]')) {
        return true
    }

    // YouTube specifické selektory
    if (document.querySelector('#movie_player, .html5-video-player, ytd-player')) {
        return true
    }

    // Discord - kontrola voice/video kanálů
    if (document.querySelector('[class*="video"], [class*="voice"], video')) {
        return true
    }

    return false
}

// Posluchač zpráv z background scriptu
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'volumeChanged') {
        applyVolume(request.volume)
        sendResponse({ success: true })
    } else if (request.action === 'hasMedia') {
        const hasMedia = hasMediaElements()
        sendResponse({ hasMedia })
    }
    return true
})
