// Správa hlasitosti záložek pomocí storage a content scriptů

// Inicializace při spuštění
chrome.runtime.onInstalled.addListener(() => {
    console.log('TabSounder extension nainstalována')
})

// Sledování zavření záložek
chrome.tabs.onRemoved.addListener((tabId) => {
    // Odstranit z storage
    chrome.storage.local.get(['tabVolumes'], (result) => {
        const tabVolumes = result.tabVolumes || {}
        delete tabVolumes[tabId]
        chrome.storage.local.set({ tabVolumes })
    })
})

// Sledování aktualizace záložek
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        // Při dokončení načítání aplikuj uloženou hlasitost přes content script
        chrome.storage.local.get(['tabVolumes'], (result) => {
            if (result.tabVolumes && result.tabVolumes[tabId] !== undefined) {
                chrome.tabs
                    .sendMessage(tabId, {
                        action: 'volumeChanged',
                        volume: result.tabVolumes[tabId]
                    })
                    .catch(() => {
                        // Content script nemusí být ještě načten, zkusíme znovu za chvíli
                        setTimeout(() => {
                            chrome.tabs
                                .sendMessage(tabId, {
                                    action: 'volumeChanged',
                                    volume: result.tabVolumes[tabId]
                                })
                                .catch(() => {})
                        }, 300)
                    })
            }
        })
    }
})

// Funkce pro nastavení hlasitosti záložky
function setTabVolume(tabId, volume) {
    // Uložit hlasitost do storage
    chrome.storage.local.get(['tabVolumes'], (result) => {
        const tabVolumes = result.tabVolumes || {}
        tabVolumes[tabId] = volume
        chrome.storage.local.set({ tabVolumes })
    })

    // Poslat zprávu do content scriptu pro aplikaci změny
    chrome.tabs
        .sendMessage(tabId, {
            action: 'volumeChanged',
            volume: volume
        })
        .catch(() => {
            // Content script nemusí být načten, to je v pořádku
        })
}

// Funkce pro získání hlasitosti záložky
function getTabVolume(tabId) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['tabVolumes'], (result) => {
            const tabVolumes = result.tabVolumes || {}
            resolve(tabVolumes[tabId] ?? 1.0)
        })
    })
}

// Posluchač zpráv z popup a content scriptů
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'setVolume') {
        setTabVolume(request.tabId, request.volume)
        sendResponse({ success: true })
    } else if (request.action === 'volumeChangedFromPage') {
        // Aktualizovat uloženou hlasitost, když se změní na stránce
        const tabId = request.tabId || sender.tab?.id
        if (tabId) {
            chrome.storage.local.get(['tabVolumes'], (result) => {
                const tabVolumes = result.tabVolumes || {}
                tabVolumes[tabId] = request.volume
                chrome.storage.local.set({ tabVolumes })
            })
        }
        sendResponse({ success: true })
    } else if (request.action === 'getVolume') {
        const tabId = request.tabId || sender.tab?.id
        if (tabId) {
            getTabVolume(tabId).then((volume) => {
                sendResponse({ volume })
            })
            return true // Asynchronní odpověď
        } else {
            sendResponse({ volume: 1.0 })
        }
    } else if (request.action === 'toggleMute') {
        // Přepnout mute stav na záložce
        chrome.tabs.sendMessage(request.tabId, { action: 'toggleMute' }, (response) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message })
            } else {
                sendResponse({ success: true })
            }
        })
        return true // Asynchronní odpověď
    } else if (request.action === 'togglePause') {
        // Přepnout pause stav na záložce
        chrome.tabs.sendMessage(request.tabId, { action: 'togglePause' }, (response) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message })
            } else {
                sendResponse({ success: true })
            }
        })
        return true // Asynchronní odpověď
    } else if (request.action === 'getCurrentTabId') {
        sendResponse({ tabId: sender.tab?.id })
    } else if (request.action === 'hasMedia') {
        // Zkontrolovat, jestli záložka má audio/video obsah
        chrome.tabs.sendMessage(request.tabId, { action: 'hasMedia' }, (response) => {
            if (chrome.runtime.lastError) {
                sendResponse({ hasMedia: false })
            } else {
                sendResponse({ hasMedia: response?.hasMedia || false })
            }
        })
        return true // Asynchronní odpověď
    } else if (request.action === 'getAllTabs') {
        // Seznam domén, které typicky mají audio/video obsah
        const mediaDomains = ['youtube.com', 'youtu.be', 'twitch.tv', 'twitch.com', 'spotify.com', 'soundcloud.com', 'vimeo.com', 'netflix.com', 'hulu.com', 'dailymotion.com', 'bitchute.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'discord.com', 'discordapp.com', 'mixer.com', 'dlive.tv', 'streamable.com']

        // Pomocná funkce pro kontrolu URL
        function checkUrlForMedia(url) {
            if (!url) return false
            const urlLower = url.toLowerCase()
            for (const domain of mediaDomains) {
                if (urlLower.includes(domain)) {
                    return true
                }
            }
            return false
        }

        chrome.tabs.query({}, async (tabs) => {
            const tabsWithVolumes = await Promise.all(
                tabs.map(async (tab) => {
                    // Nejdřív získat uloženou hlasitost
                    let volume = await getTabVolume(tab.id)

                    // Zkontrolovat, jestli má záložka audio/video obsah
                    let hasMedia = false
                    if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                        // Nejdřív zkontrolovat URL jako fallback
                        hasMedia = checkUrlForMedia(tab.url)

                        // Pak zkusit content script (pokud je načten)
                        try {
                            const response = await new Promise((resolve) => {
                                chrome.tabs.sendMessage(tab.id, { action: 'hasMedia' }, (response) => {
                                    if (chrome.runtime.lastError) {
                                        // Content script není načten, použijeme URL check
                                        resolve({ hasMedia: hasMedia })
                                    } else {
                                        resolve(response || { hasMedia: hasMedia })
                                    }
                                })
                            })
                            // Použít výsledek z content scriptu, nebo fallback na URL check
                            hasMedia = response.hasMedia || hasMedia

                            // Pokud má media, zkusit získat skutečnou aktuální hlasitost a stavy
                            if (hasMedia) {
                                try {
                                    const volumeResponse = await new Promise((resolve) => {
                                        chrome.tabs.sendMessage(tab.id, { action: 'getCurrentVolume' }, (response) => {
                                            if (chrome.runtime.lastError) {
                                                resolve(null)
                                            } else {
                                                resolve(response)
                                            }
                                        })
                                    })
                                    // Pokud jsme získali skutečnou hlasitost, použít ji
                                    if (volumeResponse && volumeResponse.volume !== undefined) {
                                        volume = volumeResponse.volume
                                        // Aktualizovat uloženou hodnotu
                                        chrome.storage.local.get(['tabVolumes'], (result) => {
                                            const tabVolumes = result.tabVolumes || {}
                                            tabVolumes[tab.id] = volume
                                            chrome.storage.local.set({ tabVolumes })
                                        })
                                    }
                                } catch (e) {
                                    // Pokud se nepodařilo získat skutečnou hlasitost, použít uloženou
                                }
                            }
                        } catch (e) {
                            // Použít URL check jako fallback
                            hasMedia = hasMedia || checkUrlForMedia(tab.url)
                        }
                    }
                    // Získat mute a pause stav
                    let isMuted = false
                    let isPaused = true
                    if (hasMedia) {
                        try {
                            const muteResponse = await new Promise((resolve) => {
                                chrome.tabs.sendMessage(tab.id, { action: 'getMuteState' }, (response) => {
                                    if (chrome.runtime.lastError) {
                                        resolve({ muted: false })
                                    } else {
                                        resolve(response || { muted: false })
                                    }
                                })
                            })
                            isMuted = muteResponse.muted || false

                            const pauseResponse = await new Promise((resolve) => {
                                chrome.tabs.sendMessage(tab.id, { action: 'getPauseState' }, (response) => {
                                    if (chrome.runtime.lastError) {
                                        resolve({ paused: true })
                                    } else {
                                        resolve(response || { paused: true })
                                    }
                                })
                            })
                            isPaused = pauseResponse.paused !== undefined ? pauseResponse.paused : true
                        } catch (e) {
                            // Použít výchozí hodnoty
                        }
                    }

                    return {
                        id: tab.id,
                        title: tab.title,
                        url: tab.url,
                        volume: volume,
                        hasMedia: hasMedia,
                        muted: isMuted,
                        paused: isPaused
                    }
                })
            )
            // Filtrovat pouze záložky s audio/video obsahem
            const tabsWithMedia = tabsWithVolumes.filter((tab) => tab.hasMedia)
            sendResponse({ tabs: tabsWithMedia })
        })
        return true // Asynchronní odpověď
    }
    return false
})
