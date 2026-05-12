# FTM Koppensneller

De Koppensneller helpt je om **sneller tot een sterke kop** te komen, in rondes. Je uploadt een concept als `.md` (uit Google Docs), kiest het genre en krijgt meerdere koprichtingen. Met jouw feedback scherpen we de volgende ronde aan.

De **FTM Koppensneller** is een webtool die met een taalmodel (om precies te zijn: gpt-4.1) en op basis van een concept van je artikel koppen FTM-waardige koppen genereert. Dat doen we in meerdere rondes, na feedback van jou, de gebruiker. 

## Wat is het probleem?

Kunstmatige intelligentie kan journalisten helpen met koppen maken. Dat doen veel FTM'ers ook al en soms werkt dat, maar vaak zijn de suggesties:

- te generiek of “Amerikaans”
- niet scherp genoeg op de nieuwswaarde
- niet in FTM-toon (te veel cliché, te weinig concreet, verkeerde focus)
- onvoldoende consistent (de ene keer raak, de volgende keer mis)

## Waarop deze tool gebaseerd is

We gebruiken een uitgebreide **LLM-superprompt** die is samengesteld op basis van:

- de (compacte versie van de) [FTM-stijlgids](https://www.spaink.net/wp-content/uploads/FTM-stijlgids.pdf)

- de [richtlijnen](https://drive.google.com/file/d/1qEB6f_e_wUJ-Przk4HRVUUpETjegsWrD/view?usp=sharing) van *Comité Cliché Weg Ermee* (gemaakt door enkele eindredacteuren van NRC)

- de [FTM-koppenchecklist](https://docs.google.com/document/d/1OlgZ-CfcXJ-VvXIp9tSpursS1giiogVIsAhbfoUmhKw/edit?tab=t.0)

- patronen uit historische koppen (samenvatting + representatieve voorbeelden)

- goedgekeurde gebruikersfeedback (lessons)

  [Bekijk de volledige LLM-superprompt](/docs/super-prompt) (sowieso nuttig om eens te bekijken, ook zonder deze app te gebruiken).

  Wil je meer weten over de opzet en code? Bekijk de repository op [GitHub](https://github.com/jsdaalder/ftm-koppensneller).

## Hoe je deze tool gebruikt
1. Download een `.md`.-versie van je conceptartikel in Google Docs: **File → Download → Markdown (.md)**
2. Kies het genre in de koppensnellertool.
3. Upload het `.md`.-bestand.
4. Kies de beste koppen en geef feedback.
5. Klik op **Nieuwe ronde** en herhaal tot je tevreden bent.
