# Le Grand Fromage – speldesign (prototyp v0.1)

Det här dokumentet är kortversionen av idén och de beslut som fattats i prototypen. Längre resonemang och ursprungsidén finns i konceptdokumentet.

## Idén i en mening

*Cooper's Hills ostrullning, fast alla har fått med sig något att slåss med – och ostrullen har blivit en enda ost som alla vill bära längst.*

## Kärnloopen

1. Alla väljer **ett vapen** i lobbyn (hemligt tills avslöjandet precis före start). Man får bara välja en gång per match.
2. Alla spawnar på ön. En ost ligger på kullen i mitten.
3. Man springer, tacklar och slåss för att få **bära osten**. Poängen är *sekunder som bärare*, summerat över hela matchen.
4. Blir man träffad av *vad som helst* (tackling, vapen, explosion, hus som rasar, havet) tappar man osten, ligger en kort stund och återuppstår vid kusten – med samma vapen.
5. Efter 5 minuter vinner den med mest ostsekunder.

Det som ska kännas: ständigt omkastade lägen, en bärare som är jagad och skör, och många små skratt – inte skicklighetstunga duellsystem.

## Pelare

- **Mjuka vapen med karaktär.** Inga automatvapen. Saker som normalt inte är vapen, med tydliga egenheter som man lär sig på ett par sekunder.
- **En träff räcker.** Ingen hälsa. Det gör varje läge begripligt och varje bärare nervös.
- **Osten är heligt.** Den går inte att förstöra, bara att bära. Allt annat kan gå sönder.
- **Läsbart kaos.** Överdrivna effekter, stora rundlar och texter. Minikartan visar alltid var osten är.
- **Fula-roliga figurer.** Randiga tröjor, basker och toque i olika färger och former; inte för polerat.

## Ön

- Blob-formad ö, medelradie ~900 enheter (kusten varierar ±115). Att springa över hela ön tar ~6–7 sekunder.
- **Ostkullen** i mitten (radie 230): osten rullar sakta utåt från toppen om ingen håller i den.
- **Dammen** (långsamt att vada), **bryggan**, åtta **spawnrundlar** längs kusten med trikolorflaggor.
- **Byn** med boulangeri, café, fromagerie och maison, ett **mini-Eiffeltorn**, caféparasoller och bord, platanträd, tunnor. Placeras deterministiskt från ett frö – alla ser samma ö. Allt går att förstöra (rasar till spillror).
- **Havet** runt ön: gå ut för långt och du drunknar efter någon sekund. Osten som hamnar i havet flyter en stund och återställs sedan till kullen.
- **Parisduvan**: en miljöhändelse som jagar den som burit osten länge (efter ~25 s) – hindrar att en enda spelare "campar" med osten.

## Vapen

| Vapen | Fransk titel | Typ | Egenhet |
| --- | --- | --- | --- |
| Baguetten | La Baguette | Närstrid | Lagom lång och snabb, bred båge, ger krummor. Allroundvalet. |
| Gummituppen | Le Coq | Närstrid · skrik | Snabbast, men kort räckvidd. Kacklet gör de närmaste yra en kort stund. |
| Stekpannan | La Poêle | Närstrid · skydd | Håll in för att reflektera skott; släpp för en smäll. |
| Purjolöken | Le Poireau | Närstrid · lång | Längst räckvidd bland närstridsvapnen, men långsam och vickande. |
| Potatiskanonen | Canon à patates | Skjuter | Enkla, rakt framåt, lagom långsamma potatisar. |
| Pétanque-kulorna | Les Boules | Skjuter · studsar | Två kulor, studsar på allt, tre salvor sedan omladdning. |
| Brevduvan | Le Pigeon | Målsökande | Långsam laddning, duvan väljer själv (nästan) rätt mål. |
| Fyrverkeriraketen | Le 14 Juillet | Sprängs · fördröjd | Lobbas mot en ring, exploderar efter en stund. Förstör hus. |
| Stinkosten | L'Époisses | Gas · område | Kastas, öppnas till ett moln. Den som stannar i det blir långsam och svimmar (= KO). |
| Champagneminan | Le Champagne | Mina | Upp till tre flaskor. Ploppar när *någon* kliver nära – även du. |
| Lövblåsaren | Le Souffleur | Knuffar | Håll in och blås bort folk och inkommande skott – gärna ut i havet. Överhettas. |
| Studsmattan | Le Trampoline | Fälla · flykt | Lägg ut en matta med pil. Den som kliver på flyger i pilens riktning. |

Vapnen är datadrivna (`WEAPONS` i `js/cfg.js`) så att balansen kan justeras utan att röra logiken.

**Tackling** är gratis för alla: en kort sprint (0,2 s) med längre återhämtning och 1,8 s mellan försök. Bäraren kan tackla men inte använda sitt vapen och är något långsammare – det är det som gör att en bärare kan jagas.

## Franskt tema (tillägg efter första genomläsningen)

Hela spelet fick en fransk touch: titeln *Le Grand Fromage*, marinière-tröjor i olika färger och mönster som skins (Pierre, Colette, Jean-Claude, Brigitte, Gaston, Margot, Étienne, Mamie), basker och kockmössa, ost med egen liten basker, boulangeri/café/fromagerie, Eiffeltorn, musette-vals som bakgrundsmusik och franska onomatopoetika (BOUM!, COUAC!, PUANT!, CLONG!). Vapnen omtolkades därefter: gummihönan blev *Gummituppen*, och *Purjolöken*, *Pétanque-kulorna*, *Brevduvan*, *Stinkosten* (Époisses), *Fyrverkeriraketen* (14 juli) och *Champagneminan* tillkom eller bytte skepnad.

## Kamera, vy och gränssnitt

- Tredje person uppifrån, kameran tittar lite åt musens håll. Marken är ritad rakt ovanifrån, figurer och hus står upp.
- Minikarta nere till vänster: ön, osten och dig. En pil i bildkanten pekar mot osten när den är utanför bild.
- HUD: tid, poängtavla med ostbäraren markerad, händelseflöde ("Inès fyrverkerade Dominique"), rundlar för vapen och tackling, 3-2-1-nedräkning, KO-ruta, resultattavla med konfetti.
- Avslöjandet: de åtta vapenkorten visas samtidigt innan matchen så att alla vet vad de möter.

## Flerspelare

Upp till 8 spelare, värd-auktoritativt och spelare-till-spelare (WebRTC), rumslänk/rumskod, bottar som fyller tomma platser, åskådare kan ansluta mitt i matchen. Inget behov av serverdrift för vänner-emellan-spel. Detaljer och begränsningar: `README.md` och `CLAUDE.md`.

## Öppna frågor att svara på med riktiga spelare

- Är 5 minuter rätt? Är ön för liten/stor för åtta spelare? (Prototypen korsas på ~6–7 s.)
- Är något vapen för starkt eller tråkigt att möta? (Botstatistiken tyder på att tackling dominerar – är det bra?)
- Är det för lätt eller för svårt att behålla osten? Räcker Parisduvan som motvikt?
- Vill man kunna byta vapen mellan matcher i en serie, eller är *ett val* just det roliga?
- Behövs lag, rundor eller kartvarianter för att hålla intresset uppe?
- Fungerar 8 spelare på mobil (pekstyrning och sikte) – eller behövs ett förenklat styrsätt?

## Idéer på listan

Fler vapen (t.ex. croissant-bumerang, sparkcykel, kastruta), vädret (storm som blåser osten), kosmetika (hattar, tröjor, segerdanser), ostens "personlighet" (den kan skrika när den bärs), lagläge, andra turistvänliga öar (Provence, Riviera), äkta ljudfiler, kommentator, repriser av de roligaste KO:na.
