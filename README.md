# Pixelsort

Et lite program for **pixelsortering** av bilder, rett i nettleseren. Pikslene i bildet sorteres etter lysstyrke, nyanse eller metning. Det gir de typiske «smeltede», stripete bildene.

## Bildene dine blir på maskinen

Alt skjer lokalt i nettleseren. Bildene lastes ikke opp noe sted, og programmet henter ingenting fra nettet. Det virker også uten internett.

## Kom i gang

Det trengs ingen installasjon. Åpne `index.html` i en nettleser, for eksempel ved å dobbeltklikke på fila.

## Slik bruker du det

1. **Velg et bilde.** Klikk i feltet, dra og slipp et bilde inn, eller lim inn med <kbd>Ctrl</kbd>+<kbd>V</kbd>.
2. **Juster i panelet**:
   - **Vinkel**: hvilken retning stripene går. Dra i hjulet eller skriv inn grader. 0° er mot høyre, og 90° er nedover.
   - **Sorter etter**: lysstyrke, nyanse (hvilken farge) eller metning (hvor sterk fargen er).
   - **Rekkefølge**: stigende eller synkende.
   - **Stripebredde**: hvor brede de ensfargede stripene blir, i piksler.
   - **Nedre og øvre grense**: bare piksler med lysstyrke mellom grensene blir sortert. Resten blir stående.
3. **Trykk «Sorter».** Når bildet er sortert, oppdateres det mens du justerer.
4. **«Tilbakestill»** viser originalen igjen. Originalen blir aldri endret.
5. **«Last ned PNG»** lagrer det sorterte bildet i full oppløsning, som `filnavn-sortert.png`.

Alt kan brukes med tastatur. <kbd>Tab</kbd> flytter mellom kontrollene, og piltastene justerer gliderne, hjulet og valgene.

## Filer

| Fil | Innhold |
|---|---|
| `index.html` | Strukturen på siden |
| `style.css` | Utseendet, også oppsettet for mobil |
| `script.js` | All logikk: innlasting, sortering, forhåndsvisning og nedlasting |
