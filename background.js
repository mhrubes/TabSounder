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
                        }, 500)
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
        const mediaDomains = [
            'youtube.com', 'youtu.be',
            'twitch.tv', 'twitch.com',
            'spotify.com',
            'soundcloud.com',
            'vimeo.com',
            'netflix.com',
            'hulu.com',
            'dailymotion.com',
            'bitchute.com',
            'facebook.com',
            'instagram.com',
            'tiktok.com',
            'twitter.com',
            'discord.com', 'discordapp.com',
            'mixer.com',
            'dlive.tv',
            'streamable.com'
        ]
        
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
                    const volume = await getTabVolume(tab.id)
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
                        } catch (e) {
                            // Použít URL check jako fallback
                            hasMedia = hasMedia || checkUrlForMedia(tab.url)
                        }
                    }
                    return {
                        id: tab.id,
                        title: tab.title,
                        url: tab.url,
                        volume: volume,
                        hasMedia: hasMedia
                    }
                })
            )
            // Filtrovat pouze záložky s audio/video obsahem
            const tabsWithMedia = tabsWithVolumes.filter(tab => tab.hasMedia)
            sendResponse({ tabs: tabsWithMedia })
        })
        return true // Asynchronní odpověď
    }
    return false
})
