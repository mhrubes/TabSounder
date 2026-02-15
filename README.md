# TabSounder - Volume Control Extension

Chrome extension pro individuální ovládání hlasitosti každé záložky zvlášť.

## Funkce

-   🎚️ **Individuální hlasitost** - Ovládejte hlasitost každé záložky nezávisle
-   🔊 **Snadné ovládání** - Intuitivní slider pro každou záložku
-   🔇 **Rychlé ztlumení** - Jedno kliknutí pro ztlumení/zapnutí
-   💾 **Automatické ukládání** - Hlasitost se automaticky ukládá a obnovuje
-   🎨 **Moderní design** - Krásné a přehledné rozhraní

## Instalace

1. Otevřete Chrome a přejděte na `chrome://extensions/`
2. Zapněte "Režim vývojáře" (Developer mode) v pravém horním rohu
3. Klikněte na "Načíst rozbalené" (Load unpacked)
4. Vyberte složku `sound_chrome_extension`
5. Extension je nyní nainstalována a připravena k použití!

## Použití

1. Klikněte na ikonu extension v panelu nástrojů Chrome
2. Zobrazí se seznam všech otevřených záložek
3. Použijte slider pro nastavení hlasitosti (0-100%)
4. Nebo klikněte na tlačítko 🔊/🔇 pro rychlé ztlumení/zapnutí
5. Hlasitost se automaticky ukládá a obnovuje při příštím otevření záložky

## Poznámky

-   Extension funguje pouze s webovými stránkami (ne s chrome:// stránkami)
-   Některé stránky mohou mít vlastní audio ovládání, které může ovlivnit funkčnost
-   Pro nejlepší výsledky použijte extension na stránkách s audio/video obsahem

## Vytvoření ikon

Před instalací extension je potřeba vytvořit ikony:

1. Otevřete soubor `icons/generate-icons.html` v prohlížeči
2. Klikněte na tlačítka pro stažení ikon (16x16, 48x48, 128x128)
3. Uložte stažené soubory do složky `icons` jako:
    - `icon16.png`
    - `icon48.png`
    - `icon128.png`

Alternativně můžete použít vlastní ikony ve formátu PNG v požadovaných velikostech.

## Technické detaily

-   **Manifest Version**: 3
-   **Permissions**: tabs, storage, activeTab
-   **Host Permissions**: <all_urls>

## Autor

Vytvořeno pro individuální ovládání hlasitosti záložek v Chrome.
