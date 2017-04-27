# Parklate andmed

Parklate nimistut tuleks hoida lahus Pargi rakendusest, muutes need andmed seeläbi kasutatavaks ka mujal kui Pargi rakenduses ning lihtsustades nende uuendamist. Parklaid ja nende atribuute tuleks hoida JSONi formaadis, peegeldades mingil määral seda, kuidas parklaid rakendustes kajastatakse.

## Andmebaas

Andmebaasi peamine struktuur on järgnev:

Nimetus       | Tüüp (_type_) | Kohustuslik | Selgitus
------------- | ------------- | ----------- | --------
`version`     | _string_ | Jah | Andmebaasi versiooni number, kasutada tuleks [semantilist versiooni](http://semver.org)
`date`        | _UNIX timestamp_ | Jah | Andmebaasi loomise kuupäev/kellaaeg
`hash`        | _SHA1 hash_ | Jah | SHA1 `data` objektist
`data`        | _dictionary_ | Jah | Andmed

## `data`

Nimetus       | Tüüp (_type_) | Kohustuslik | Selgitus
------------- | ------------- | ----------- | --------
`providers`   | _array of `Provider`_ | Jah | Loend teenusepakkujatest
`zones`       | _array of `Zone`_ | Jah | Loend tsoonidest
`groups`      | _array of `ZoneGroup`_ | Ei | Loend tsoonigruppidest

## `Provider`

Teenusepakkuja, igal tsoonil peaks olema teenusepakkuja, kuid igal teenusepakkujal ei pea olema tsoone. Teenusepakkujate roll andmebaasis on enamasti informatiivne, luues vaikimisi seose teatud tsoonide vahel (mis kuuluvad samale teenusepakkujale).

Nimetus       | Tüüp (_type_) | Kohustuslik | Selgitus
------------- | ------------- | ----------- | --------
`id`          | _32-bit uint_ | Jah | Unikaalne number teenusepakkujate seas, kasutatakse andmebaasi uuendamiseks ja korrashoiuks
`beacon-major`| _16-bit uint_ | Ei | iBeaconi major, kombinatsioon `Provider` majorist ja `Zone` minorist peab olema unikaalne.
`name`        | _string_      | Jah | Teenusepakkuja nimi
`color`       | _string hex color_   | Jah | Värv, mida kasutada teenusepakkuja parklate eristamiseks kaartidel ja rakenduses üldiselt
`contact`     | _dictionary_ | Ei | Kontaktandmed, jäljendades [_AddressBooki_](https://developer.apple.com/library/prerelease/ios/documentation/AddressBook/Reference/AddressBook_iPhoneOS_Framework/) poolt pakutavaid andmeid

## `Zone`

Parkimistsoon, iga tsooni kohta eraldi objekt, kuigi ühe `code` kohta võib olla mitu tsooni, peaks üldiselt olema neid täpselt üks.

Nimetus       | Tüüp (_type_) | Kohustuslik | Selgitus
------------- | ------------- | ----------- | --------
`id`          | _32-bit uint_ | Jah | Parklate seas unikaalne ID number
`provider`    | _32-bit uint_ | Jah | Teenusepakkuja ID number, loob seose `Provider` nimistuga
`code`        | _string_      | Jah | SMSiga saadetav kood
`beacon-minor`| _16-bit uint_ | Ei | iBeaconi minor, mis selle konkreetse tsooniga seotud on, kombinatsioon tsooni minorist ja pakkuja majorist peab olema unikaalne
|||
`tariffs`     | _array of `Tariff`_ | Ei | Nimistu hinnainfoga, otsest piirangut arvul ei ole, kuna hinnainfo võib olla väga spetsifiiline. Kui puudub, siis hinnainfot ei tohiks kuvada. Kui info puudub konkreetse päeva kohta, siis ei tohiks infot samuti kuvada. Ühe päeva kohta võib olla mitu alternatiivi, mis puhul tuleks võtta kõige täpsem.
|||
`regions`     | `Region` või _array of `Region`_  | Jah | Asukoha informatsioon, jada et lubada mitmikalasid, nagu näiteks Tartu linnatsoonid, mis langevad ühe koodi ja tariifi alla, kuid hõlmavad mitut eraldiseisvat geograafilist ala. Enamasti on vaid üks, seega shorthandina on lubatud ka kasutada otse `Region` objekti.

### `Tariff`

Nimetus       | Tüüp (_type_) | Kohustuslik | Selgitus
------------- | ------------- | ----------- | --------
`days`        | _array of uint_ | Jah | Päeva(de) numbrid, vahemikus 1 - 7 (1 - esmaspäev, 7 - pühapäev)
`start`       | _uint_        | Ei | Perioodi algus, sekundites keskööst (9:00 = 32400) (kui puudub, siis 0)
`end`         | _uint_        | Ei | Perioodi lõpp, sekundites keskööst (18:00 = 64800) (kui puudub, siis 86400)
`periods`     | _dictionary_  | Jah | Perioodid ja vastavad hinnad, näiteks kui 30 minutit maksab 1 euro, aga 24h maksab 6 eurot, siis on kaks välja - 1800 : 100 ja 86400 : 600. Võti on aeg sekundites ja väärtus on hind euro sentides (float, kuna mõnikord on vähem kui sent). Tegelik hind arvutatakse kõige odavamana kolmest variandist: kõige väiksema ühikuga, kõige suurema ühikuga ja viimaks täites aja võimalikult suurte ühikutega - nö _greedy change making_
`free-period` | _uint_        | Ei | Tasuta periood parkimise algusest. Sekundites, vaikimisi 0, ehk tasuta periood puudub
`min-period`  | _uint_        | Ei | Minimaalne periood, sekundites. Aitab defineerida parkimist, millel on minimaalne tasu, a'la "esimesed 3h hinnaga x, iga järgnev tund hinnaga y", mis sisuliselt tähendab minimaalset perioodi.
`min-amount`  | _float_       | Ei | Minimaalne tasu, euro sentides. Sarnaselt eelmisele, aitab defineerida hinda, mis muutub, näiteks "esimene tund 50 senti, iga järgnev 20 senti", mis sisuliselt on miinimum tasu + miinimum periood.


#### Tariifiarvutused

Kuna täpne arvutus oleneb teenusepakkujast ja vahendajast, siis Pargi eesmärgiks on pakkuda ennustust, et anda lihtne ülevaade võimalikust hinnast. Näidisarvutus perioodi ja hinna kohta, võttes aluseks järgneva tariifi "E-P 24h päevas, iga alustatud tund €1.50, 24h €6"

```
{
    "days" : [1,2,3,4,5,6,7],
    "periods" : {
        "3600" : 150,
        "86400" : 600
    }
}
```

```
A - kõige väiksema ühikuga
B - kõige suurema ühikuga (8000 -> 86400)
C - võimalikult suurte ühikutega aja täitmine

Juhul kui pargitud on 30 minutit (1800 sekundit):

A = periods[3600] * 1 = 150 (valitud)
B = periods[86400] * 1 = 600
C = periods[3600] * 1 + periods[86400] * 0 = 150 (valitud)

Juhul kui pargitud on 4 tundi ja 30 minutit (16200 sekundit)

A = periods[3600] * 5 = 750
B = periods[86400] * 1 = 600 (valitud)
C = periods[3600] * 5 + periods[86400] * 0 = 750

Juhul kui pargitud on 2 päeva, 2 tundi ja 5 minutit (180300 sekundit)

A = periods[3600] * 51 = 7650
B = periods[86400] * 3 = 1800
C = periods[3600] * 3 + periods[86400] * 2 = 1650 (valitud)
```

### `Region`

Osa `Zone` objektist, defineerib ühe geograafilise ala, mis võib omada üht või mitut sisemist ala (nö auku).

Nimetus       | Tüüp (_type_) | Kohustuslik | Selgitus
------------- | ------------- | ----------- | --------
`points`      | _array of array of double_ | Jah | Nimistu koordinaatidest, mis on _[lat, long]_ tüüpi arrayd, kui vaid üks, siis tuleks kuvada punktina. Mitme puhul tuleks moodustada hulknurk.
`interior-regions` | _array of `Region`_ | Ei | Juhul kui regioon on "auguga", siis see loend peaks sisaldama regioone, mis kujutavad nimetatud auku/auke. Valdavalt puudub.

## `ZoneGroup`

Abstraktne objekt, mis lubab grupeerida erinevaid tsoone. Näiteks võib olla grupp tsoone, mis kõik kuuluvad sama geograafilise asumi alla (linn, vald, maakond), sarnaselt võib luua gruppi, mis hõlmab tasuta tsoone või neid, millel on iBeaconi tugi.

Nimetus       | Tüüp (_type_) | Kohustuslik | Selgitus
------------- | ------------- | ----------- | --------
`id`          | _32-bit uint_ | Jah | Gruppide seas unikaalne ID number
`zones`       | _array of 32-bit uint_ | Jah | Loend tsoonide ID numbritega, mis antud gruppi kuuluvad
`reason`      | _string_, hetkel lubatud "geo" | Jah | Grupeerimise alus
`name`        | _string_ | Jah | Grupi nimi, peaks sobima näitamiseks kasutajaliideses
`localized-name` | _string_ | Ei | Eelistatud, võetakse kui võtit tõlgitud kasutajaliidese stringidesse, vt NSLocalizedString. See on Pargi rakenduse spetsiifiline võti, mida teised rakendused võivad ignoreerida või sobivaks kasutuseks mugandada.
