// Načtení záložek při otevření popup
document.addEventListener('DOMContentLoaded', () => {
  loadTabs();
  document.getElementById('refreshBtn').addEventListener('click', loadTabs);
  
  // Periodicky aktualizovat hlasitost (každé 2 sekundy)
  setInterval(() => {
    updateVolumes();
  }, 2000);
});

// Načtení všech záložek
async function loadTabs() {
  const tabsList = document.getElementById('tabsList');
  tabsList.innerHTML = '<div class="loading">Načítání záložek...</div>';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllTabs' });
    const tabs = response.tabs || [];

    if (tabs.length === 0) {
      tabsList.innerHTML = '<div class="empty">Žádné otevřené záložky</div>';
      return;
    }

    tabsList.innerHTML = '';
    
    // Seřadit záložky - aktivní první
    chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
      const activeTabId = activeTabs[0]?.id;
      const sortedTabs = tabs.sort((a, b) => {
        if (a.id === activeTabId) return -1;
        if (b.id === activeTabId) return 1;
        return 0;
      });

      if (sortedTabs.length === 0) {
        tabsList.innerHTML = '<div class="empty">Žádné záložky s audio/video obsahem</div>';
        return;
      }

      sortedTabs.forEach(tab => {
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          createTabItem(tab);
        }
      });
    });
  } catch (error) {
    console.error('Chyba při načítání záložek:', error);
    tabsList.innerHTML = '<div class="error">Chyba při načítání záložek</div>';
  }
}

// Vytvoření UI pro jednu záložku
function createTabItem(tab) {
  const tabItem = document.createElement('div');
  tabItem.className = 'tab-item';
  tabItem.dataset.tabId = tab.id;

  const title = tab.title || 'Bez názvu';
  const truncatedTitle = title.length > 40 ? title.substring(0, 40) + '...' : title;

  tabItem.innerHTML = `
    <div class="tab-info">
      <div class="tab-title">${truncatedTitle}</div>
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
      <button class="mute-btn" data-tab-id="${tab.id}" title="Ztlumit/Zapnout">
        ${tab.volume === 0 ? '🔇' : '🔊'}
      </button>
    </div>
  `;

  // Event listenery
  const slider = tabItem.querySelector('.volume-slider');
  const muteBtn = tabItem.querySelector('.mute-btn');
  const volumeValue = tabItem.querySelector('.volume-value');

  // Funkce pro aktualizaci fialového zabarvení slideru
  function updateSliderProgress(sliderElement) {
    const value = sliderElement.value;
    const max = sliderElement.max || 100;
    const percentage = (value / max) * 100;
    
    // Nastavit CSS custom property pro gradient (používá se v ::-webkit-slider-runnable-track a ::-moz-range-track)
    sliderElement.style.setProperty('--slider-progress', percentage + '%');
  }

  // Nastavit počáteční hodnotu
  updateSliderProgress(slider);

  slider.addEventListener('input', (e) => {
    const volume = e.target.value / 100;
    volumeValue.textContent = Math.round(volume * 100) + '%';
    updateSliderProgress(e.target);
    setTabVolume(tab.id, volume);
    updateMuteButton(muteBtn, volume);
  });

  muteBtn.addEventListener('click', () => {
    const currentVolume = parseFloat(slider.value) / 100;
    const newVolume = currentVolume === 0 ? 1.0 : 0;
    slider.value = newVolume * 100;
    volumeValue.textContent = Math.round(newVolume * 100) + '%';
    updateSliderProgress(slider);
    setTabVolume(tab.id, newVolume);
    updateMuteButton(muteBtn, newVolume);
  });

  document.getElementById('tabsList').appendChild(tabItem);
}

// Aktualizace tlačítka mute
function updateMuteButton(btn, volume) {
  btn.textContent = volume === 0 ? '🔇' : '🔊';
}

// Nastavení hlasitosti záložky
async function setTabVolume(tabId, volume) {
  try {
    await chrome.runtime.sendMessage({
      action: 'setVolume',
      tabId: tabId,
      volume: volume
    });
  } catch (error) {
    console.error('Chyba při nastavení hlasitosti:', error);
  }
}

// Aktualizace hlasitosti pro všechny záložky
async function updateVolumes() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllTabs' });
    const tabs = response.tabs || [];
    
    tabs.forEach(tab => {
      const tabItem = document.querySelector(`[data-tab-id="${tab.id}"]`);
      if (tabItem) {
        const slider = tabItem.querySelector('.volume-slider');
        const volumeValue = tabItem.querySelector('.volume-value');
        const muteBtn = tabItem.querySelector('.mute-btn');
        
        if (slider && volumeValue) {
          const currentValue = Math.round(parseFloat(slider.value));
          const newValue = Math.round(tab.volume * 100);
          
          // Aktualizovat pouze pokud se hodnota změnila
          if (currentValue !== newValue) {
            slider.value = newValue;
            volumeValue.textContent = newValue + '%';
            // Aktualizovat fialové zabarvení slideru
            const percentage = (newValue / 100) * 100;
            slider.style.setProperty('--slider-progress', percentage + '%');
            updateMuteButton(muteBtn, tab.volume);
          }
        }
      }
    });
  } catch (error) {
    console.error('Chyba při aktualizaci hlasitosti:', error);
  }
}

// Získání domény z URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
}

