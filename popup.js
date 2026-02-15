// Načtení záložek při otevření popup
document.addEventListener('DOMContentLoaded', () => {
    loadTabs()
    document.getElementById('refreshBtn').addEventListener('click', loadTabs)

    // Periodicky aktualizovat hlasitost (každé 2 sekundy)
    setInterval(() => {
        updateVolumes()
    }, 2000)
})

// Načtení všech záložek
async function loadTabs() {
    const tabsList = document.getElementById('tabsList')
    tabsList.innerHTML = '<div class="loading">Načítání záložek...</div>'

    try {
        const response = await chrome.runtime.sendMessage({ action: 'getAllTabs' })
        const tabs = response.tabs || []

        if (tabs.length === 0) {
            tabsList.innerHTML = '<div class="empty">Žádné otevřené záložky</div>'
            return
        }

        tabsList.innerHTML = ''

        // Seřadit záložky - aktivní první
        chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
            const activeTabId = activeTabs[0]?.id
            const sortedTabs = tabs.sort((a, b) => {
                if (a.id === activeTabId) return -1
                if (b.id === activeTabId) return 1
                return 0
            })

            if (sortedTabs.length === 0) {
                tabsList.innerHTML = '<div class="empty">Žádné záložky s audio/video obsahem</div>'
                return
            }

            sortedTabs.forEach((tab) => {
                if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                    createTabItem(tab)
                }
            })
        })
    } catch (error) {
        console.error('Chyba při načítání záložek:', error)
        tabsList.innerHTML = '<div class="error">Chyba při načítání záložek</div>'
    }
}

// Vytvoření UI pro jednu záložku
function createTabItem(tab) {
    const tabItem = document.createElement('div')
    tabItem.className = 'tab-item'
    tabItem.dataset.tabId = tab.id

    const title = tab.title || 'Bez názvu'
    const truncatedTitle = title.length > 40 ? title.substring(0, 40) + '...' : title

    tabItem.innerHTML = `
    <div class="tab-info">
      <div class="tab-title-row">
        <div class="tab-title">${truncatedTitle}</div>
        <div class="tab-actions">
          <button class="action-btn mute-action-btn" data-tab-id="${tab.id}">Mute</button>
          <button class="action-btn pause-action-btn" data-tab-id="${tab.id}">Pause</button>
        </div>
      </div>
      <div class="tab-url">${getDomain(tab.url)}</div>
    </div>
    <div class="tab-controls">
      <div class="volume-control">
        <input 
          type="range" 
          class="volume-slider" 
          min="0" 
          max="100" 
          value="${Math.round(tab.volume * 100)}"
          data-tab-id="${tab.id}"
        >
        <div class="volume-value">${Math.round(tab.volume * 100)}%</div>
      </div>
    </div>
  `

    // Event listenery
    const slider = tabItem.querySelector('.volume-slider')
    const muteBtn = tabItem.querySelector('.mute-action-btn')
    const pauseBtn = tabItem.querySelector('.pause-action-btn')
    const volumeValue = tabItem.querySelector('.volume-value')

    // Funkce pro aktualizaci fialového zabarvení slideru
    function updateSliderProgress(sliderElement) {
        const value = sliderElement.value
        const max = sliderElement.max || 100
        const percentage = (value / max) * 100

        // Nastavit CSS custom property pro gradient (používá se v ::-webkit-slider-runnable-track a ::-moz-range-track)
        sliderElement.style.setProperty('--slider-progress', percentage + '%')
    }

    // Nastavit počáteční hodnotu
    updateSliderProgress(slider)

    slider.addEventListener('input', (e) => {
        const volume = e.target.value / 100
        volumeValue.textContent = Math.round(volume * 100) + '%'
        updateSliderProgress(e.target)
        setTabVolume(tab.id, volume)
    })

    // Aktualizovat stavy tlačítek
    updateButtonStates(muteBtn, pauseBtn, tab.muted, tab.paused)

    muteBtn.addEventListener('click', () => {
        toggleMute(tab.id)
        // Aktualizovat stav po kliknutí
        setTimeout(() => {
            updateButtonStates(muteBtn, pauseBtn)
        }, 200)
    })

    pauseBtn.addEventListener('click', () => {
        togglePause(tab.id)
        // Aktualizovat stav po kliknutí
        setTimeout(() => {
            updateButtonStates(muteBtn, pauseBtn)
        }, 200)
    })

    document.getElementById('tabsList').appendChild(tabItem)
}

// Aktualizace stavů tlačítek
async function updateButtonStates(muteBtn, pauseBtn, mutedState, pausedState) {
    if (!muteBtn || !pauseBtn) return

    try {
        // Pokud nejsou stavy poskytnuty, získat je
        if (mutedState === undefined || pausedState === undefined) {
            const tabId = muteBtn.dataset.tabId
            const response = await chrome.runtime.sendMessage({ action: 'getAllTabs' })
            const tab = response.tabs?.find((t) => t.id === parseInt(tabId))
            if (tab) {
                mutedState = tab.muted
                pausedState = tab.paused
            }
        }

        // Aktualizovat mute button
        if (mutedState) {
            muteBtn.classList.add('active')
            muteBtn.textContent = 'Unmute'
        } else {
            muteBtn.classList.remove('active')
            muteBtn.textContent = 'Mute'
        }

        // Aktualizovat pause button
        if (pausedState) {
            pauseBtn.classList.add('active')
            pauseBtn.textContent = 'Play'
        } else {
            pauseBtn.classList.remove('active')
            pauseBtn.textContent = 'Pause'
        }
    } catch (error) {
        console.error('Chyba při aktualizaci stavů tlačítek:', error)
    }
}

// Přepnutí mute stavu
async function toggleMute(tabId) {
    try {
        await chrome.runtime.sendMessage({
            action: 'toggleMute',
            tabId: tabId
        })
    } catch (error) {
        console.error('Chyba při přepnutí mute:', error)
    }
}

// Přepnutí pause stavu
async function togglePause(tabId) {
    try {
        await chrome.runtime.sendMessage({
            action: 'togglePause',
            tabId: tabId
        })
    } catch (error) {
        console.error('Chyba při přepnutí pause:', error)
    }
}

// Nastavení hlasitosti záložky
async function setTabVolume(tabId, volume) {
    try {
        await chrome.runtime.sendMessage({
            action: 'setVolume',
            tabId: tabId,
            volume: volume
        })
    } catch (error) {
        console.error('Chyba při nastavení hlasitosti:', error)
    }
}

// Aktualizace hlasitosti pro všechny záložky
async function updateVolumes() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getAllTabs' })
        const tabs = response.tabs || []

        tabs.forEach((tab) => {
            const tabItem = document.querySelector(`[data-tab-id="${tab.id}"]`)
            if (tabItem) {
                const slider = tabItem.querySelector('.volume-slider')
                const volumeValue = tabItem.querySelector('.volume-value')
                const muteBtn = tabItem.querySelector('.mute-action-btn')
                const pauseBtn = tabItem.querySelector('.pause-action-btn')

                if (slider && volumeValue) {
                    const currentValue = Math.round(parseFloat(slider.value))
                    const newValue = Math.round(tab.volume * 100)

                    // Aktualizovat pouze pokud se hodnota změnila
                    if (currentValue !== newValue) {
                        slider.value = newValue
                        volumeValue.textContent = newValue + '%'
                        // Aktualizovat fialové zabarvení slideru
                        const percentage = (newValue / 100) * 100
                        slider.style.setProperty('--slider-progress', percentage + '%')
                    }
                }

                // Aktualizovat stavy tlačítek
                if (muteBtn && pauseBtn) {
                    updateButtonStates(muteBtn, pauseBtn, tab.muted, tab.paused)
                }
            }
        })
    } catch (error) {
        console.error('Chyba při aktualizaci hlasitosti:', error)
    }
}

// Získání domény z URL
function getDomain(url) {
    try {
        const urlObj = new URL(url)
        return urlObj.hostname.replace('www.', '')
    } catch {
        return url
    }
}
