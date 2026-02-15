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

// Flag pro označení, že změna hlasitosti pochází z rozšíření
let isExtensionChange = false
let lastKnownVolume = 1.0

// Funkce pro synchronizaci hlasitosti se stránkou
function syncVolumeFromPage() {
    const allMedia = document.querySelectorAll('audio, video')
    if (allMedia.length === 0) return

    // Najít aktivní nebo první media element
    let activeMedia = null
    for (const media of allMedia) {
        if (media.readyState > 0 && !media.paused) {
            activeMedia = media
            break
        }
    }
    if (!activeMedia && allMedia.length > 0) {
        activeMedia = allMedia[0]
    }

    if (activeMedia) {
        const actualVolume = activeMedia.volume
        // Pokud se hlasitost změnila a nepochází z rozšíření, aktualizovat
        if (Math.abs(actualVolume - lastKnownVolume) > 0.001 && !isExtensionChange) {
            currentVolume = actualVolume
            lastKnownVolume = actualVolume
            // Poslat změnu do background scriptu
            if (currentTabId) {
                chrome.runtime
                    .sendMessage({
                        action: 'volumeChangedFromPage',
                        tabId: currentTabId,
                        volume: currentVolume
                    })
                    .catch(() => {})
            }
        } else if (Math.abs(actualVolume - lastKnownVolume) > 0.001) {
            // Aktualizovat lastKnownVolume i když je to z rozšíření
            lastKnownVolume = actualVolume
        }
    }
}

// Polling mechanismus pro detekci změn hlasitosti
let volumeCheckInterval = null

function startVolumePolling() {
    if (volumeCheckInterval) return

    volumeCheckInterval = setInterval(() => {
        syncVolumeFromPage()
    }, 300) // Kontrolovat každých 300ms pro rychlejší detekci
}

function stopVolumePolling() {
    if (volumeCheckInterval) {
        clearInterval(volumeCheckInterval)
        volumeCheckInterval = null
    }
}

// Funkce pro unmutování na YouTube
function unmuteYouTube() {
    try {
        // Najít YouTube mute button
        const muteButton = document.querySelector('.ytp-mute-button') ||
                          document.querySelector('button[aria-label*="Unmute" i]')
        
        if (muteButton) {
            const buttonLabel = muteButton.getAttribute('aria-label')?.toLowerCase() || ''
            // Pokud je muted (tlačítko říká "Unmute"), kliknout na něj
            if (buttonLabel.includes('unmute')) {
                muteButton.click()
            }
        }
    } catch (e) {
        console.log('YouTube unmute error:', e)
    }
}

// Funkce pro unmutování na Twitch
function unmuteTwitch() {
    try {
        // Najít Twitch mute button pomocí různých selektorů
        const muteButtonSelectors = [
            '[data-a-target="player-mute-unmute-button"]',
            'button[aria-label*="Unmute" i]',
            'button[aria-label*="Mute" i]',
            '.player-controls button[aria-label*="sound" i]',
            'button[data-a-target*="mute"]',
            '.player-controls-bottom button:first-child',
            'video + div button[aria-label*="sound" i]'
        ]
        
        let muteButton = null
        for (const selector of muteButtonSelectors) {
            muteButton = document.querySelector(selector)
            if (muteButton) break
        }
        
        if (muteButton) {
            const buttonLabel = muteButton.getAttribute('aria-label')?.toLowerCase() || ''
            const ariaPressed = muteButton.getAttribute('aria-pressed')
            const title = muteButton.getAttribute('title')?.toLowerCase() || ''
            
            // Zkontrolovat, jestli je muted různými způsoby
            const isMuted = buttonLabel.includes('unmute') || 
                          ariaPressed === 'true' ||
                          title.includes('unmute') ||
                          muteButton.classList.contains('active') ||
                          muteButton.querySelector('svg[data-a-target="player-mute-icon"]')
            
            // Pokud je muted, kliknout na něj
            if (isMuted) {
                muteButton.click()
                // Počkat chvíli a zkusit znovu, pokud to nepomohlo
                setTimeout(() => {
                    const stillMuted = document.querySelector('video')?.muted
                    if (stillMuted) {
                        muteButton?.click()
                    }
                }, 100)
            }
        }
        
        // Také zkusit najít video element a unmutovat ho přímo
        const video = document.querySelector('video[data-a-target="player-video"]') ||
                     document.querySelector('video')
        if (video && video.muted) {
            video.muted = false
        }
    } catch (e) {
        console.log('Twitch unmute error:', e)
    }
}

// Funkce pro aplikaci hlasitosti na všechny audio/video elementy
function applyVolume(volume, fromExtension = false) {
    isExtensionChange = fromExtension
    currentVolume = volume
    lastKnownVolume = volume

    // Najít všechny audio a video elementy
    const allMedia = document.querySelectorAll('audio, video')

    // Pokud je změna z rozšíření a hlasitost > 0, zkontrolovat mute stav
    if (fromExtension && volume > 0) {
        const hostname = window.location.hostname.toLowerCase()
        
        // Zkontrolovat, jestli je nějaký media element muted
        let hasMutedMedia = false
        for (const media of allMedia) {
            if (media.muted) {
                hasMutedMedia = true
                break
            }
        }
        
        // Pokud je muted, unmutovat
        if (hasMutedMedia) {
            // Nejdřív zkusit unmutovat pomocí UI tlačítek (YouTube, Twitch)
            if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
                setTimeout(() => unmuteYouTube(), 50)
            } else if (hostname.includes('twitch.tv') || hostname.includes('twitch.com')) {
                setTimeout(() => unmuteTwitch(), 50)
            }
            
            // Pak unmutovat všechny media elementy
            allMedia.forEach((media) => {
                if (media.muted) {
                    media.muted = false
                }
            })
        }
    }

    allMedia.forEach((media) => {
        audioElements.add(media)

        // Pokud se hlasitost liší, aplikovat novou hodnotu
        if (Math.abs(media.volume - volume) > 0.001) {
            media.volume = volume
            lastKnownVolume = volume
        }
        
        // Pokud je změna z rozšíření a hlasitost > 0, unmutovat
        if (fromExtension && volume > 0 && media.muted) {
            media.muted = false
        }

        // Sledovat změny hlasitosti zvenčí (např. z UI stránky)
        if (!media._volumeListenerAdded) {
            media.addEventListener('volumechange', () => {
                if (!isExtensionChange && Math.abs(media.volume - currentVolume) > 0.001) {
                    currentVolume = media.volume
                    lastKnownVolume = media.volume
                    if (currentTabId) {
                        chrome.runtime
                            .sendMessage({
                                action: 'volumeChangedFromPage',
                                tabId: currentTabId,
                                volume: currentVolume
                            })
                            .catch(() => {})
                    }
                }
                isExtensionChange = false
            })
            media._volumeListenerAdded = true
        }
    })

    isExtensionChange = false

    // Spustit polling pokud ještě neběží
    if (allMedia.length > 0) {
        startVolumePolling()
    }
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
                    // Zkontrolovat aktuální hlasitost nového elementu
                    if (Math.abs(node.volume - currentVolume) > 0.001 && !isExtensionChange) {
                        // Pokud má jinou hlasitost, použít ji
                        currentVolume = node.volume
                        lastKnownVolume = node.volume
                        if (currentTabId) {
                            chrome.runtime
                                .sendMessage({
                                    action: 'volumeChangedFromPage',
                                    tabId: currentTabId,
                                    volume: currentVolume
                                })
                                .catch(() => {})
                        }
                    } else if (Math.abs(node.volume - currentVolume) > 0.001) {
                        node.volume = currentVolume
                    }
                    // Přidat posluchač pro změny hlasitosti
                    if (!node._volumeListenerAdded) {
                        node.addEventListener('volumechange', () => {
                            if (!isExtensionChange && Math.abs(node.volume - currentVolume) > 0.001) {
                                currentVolume = node.volume
                                lastKnownVolume = node.volume
                                if (currentTabId) {
                                    chrome.runtime
                                        .sendMessage({
                                            action: 'volumeChangedFromPage',
                                            tabId: currentTabId,
                                            volume: currentVolume
                                        })
                                        .catch(() => {})
                                }
                            }
                            isExtensionChange = false
                        })
                        node._volumeListenerAdded = true
                    }
                    // Spustit polling pokud ještě neběží
                    startVolumePolling()
                }

                // Zkontrolovat vnořené audio/video elementy
                const mediaElements = node.querySelectorAll?.('audio, video')
                if (mediaElements) {
                    mediaElements.forEach((media) => {
                        audioElements.add(media)
                        // Zkontrolovat aktuální hlasitost nového elementu
                        if (Math.abs(media.volume - currentVolume) > 0.001 && !isExtensionChange) {
                            // Pokud má jinou hlasitost, použít ji
                            currentVolume = media.volume
                            lastKnownVolume = media.volume
                            if (currentTabId) {
                                chrome.runtime
                                    .sendMessage({
                                        action: 'volumeChangedFromPage',
                                        tabId: currentTabId,
                                        volume: currentVolume
                                    })
                                    .catch(() => {})
                            }
                        } else if (Math.abs(media.volume - currentVolume) > 0.001) {
                            media.volume = currentVolume
                        }
                        // Přidat posluchač pro změny hlasitosti
                        if (!media._volumeListenerAdded) {
                            media.addEventListener('volumechange', () => {
                                if (!isExtensionChange && Math.abs(media.volume - currentVolume) > 0.001) {
                                    currentVolume = media.volume
                                    lastKnownVolume = media.volume
                                    if (currentTabId) {
                                        chrome.runtime
                                            .sendMessage({
                                                action: 'volumeChangedFromPage',
                                                tabId: currentTabId,
                                                volume: currentVolume
                                            })
                                            .catch(() => {})
                                    }
                                }
                                isExtensionChange = false
                            })
                            media._volumeListenerAdded = true
                        }
                    })
                    // Spustit polling pokud ještě neběží
                    if (mediaElements.length > 0) {
                        startVolumePolling()
                    }
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
function initializeVolume() {
    // Nejdřív zkontrolovat, jestli už jsou nějaké media elementy s nastavenou hlasitostí
    const allMedia = document.querySelectorAll('audio, video')
    let foundVolume = null

    for (const media of allMedia) {
        if (media.volume !== undefined) {
            foundVolume = media.volume
            lastKnownVolume = media.volume
            break
        }
    }

    // Pokud jsme našli jinou hlasitost, použít ji
    if (foundVolume !== null && Math.abs(foundVolume - currentVolume) > 0.001) {
        currentVolume = foundVolume
        lastKnownVolume = foundVolume
        // Poslat změnu do background scriptu
        if (currentTabId) {
            chrome.runtime
                .sendMessage({
                    action: 'volumeChangedFromPage',
                    tabId: currentTabId,
                    volume: currentVolume
                })
                .catch(() => {})
        }
    }

    applyVolume(currentVolume)

    // Spustit polling pro detekci změn
    if (allMedia.length > 0) {
        startVolumePolling()
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Počkat chvíli, aby se media elementy načetly
        setTimeout(initializeVolume, 500)
    })
} else {
    // Počkat chvíli, aby se media elementy načetly
    setTimeout(initializeVolume, 500)
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

// Funkce pro získání aktuální hlasitosti z media elementů
function getCurrentMediaVolume() {
    const allMedia = document.querySelectorAll('audio, video')
    if (allMedia.length === 0) {
        return currentVolume
    }

    // Najít první aktivní media element s hlasitostí
    for (const media of allMedia) {
        if (media.readyState > 0 && !media.paused) {
            return media.volume
        }
    }

    // Pokud není žádný aktivní, použít první dostupný
    if (allMedia.length > 0) {
        return allMedia[0].volume
    }

    return currentVolume
}

// Posluchač zpráv z background scriptu
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'volumeChanged') {
        applyVolume(request.volume, true) // Označit jako změnu z rozšíření
        sendResponse({ success: true })
    } else if (request.action === 'hasMedia') {
        const hasMedia = hasMediaElements()
        sendResponse({ hasMedia })
    } else if (request.action === 'getCurrentVolume') {
        const actualVolume = getCurrentMediaVolume()
        sendResponse({ volume: actualVolume })
    }
    return true
})
