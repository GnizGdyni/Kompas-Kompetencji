-- ============================================================================
-- Kompas Kompetencji — baza wiedzy asystenta AI (rozporządzenia, poradniki)
-- Uruchom PO 01_schema.sql. Można uruchamiać wielokrotnie (aktualizuje treści).
-- ============================================================================
insert into public.legal_documents (code, title, stage, sort_order, content)
values
(
  'FIRST_ORD_2015_CORE',
  'Dz. U. 2015 poz. 1144 — pierwsza ocena (rdzeń §§ 1–14)',
  'ALL_STAGES',
  10,
  $doc$
Źródło: rozporządzenie PRM z 23.07.2015 r. w sprawie szczegółowych warunków i sposobu dokonywania pierwszej oceny w służbie cywilnej (Dz. U. poz. 1144).

§ 1. Rozporządzenie określa m.in. sposób i tryb pierwszej oceny, warunki oceny pozytywnej/negatywnej, wzór arkusza oraz zakres i wzór sprawozdania.

§ 2. Pierwszej oceny dokonuje się, biorąc pod uwagę:
1) postawę, zaangażowanie i postępy, relacje ze współpracownikami oraz terminowość — elementy: rzetelność; wykorzystywanie wiedzy i doskonalenie zawodowe; organizacja pracy i orientacja na cele; komunikacja; współpraca;
2) wynik egzaminu ze służby przygotowawczej (jeśli obowiązek przystąpienia);
3) sprawozdanie sporządzone przez ocenianego.

§ 3. W terminie 21 dni od nawiązania stosunku pracy (a przy zastępstwie — 21 dni od ustalenia, że oceniany podlega pierwszej ocenie) bezpośredni przełożony przeprowadza rozmowę wstępną, podczas której:
1) zapoznaje ze sposobem dokonywania pierwszej oceny;
2) omawia główne obowiązki z OSP i oczekiwania co do ich wykonywania;
3) omawia oczekiwania co do postawy/zaangażowania/relacji/terminowości (opisy w załączniku nr 1);
4) wyznacza termin na złożenie sprawozdania.

§ 4. Termin sprawozdania (od–do) ustala się tak, by przypadał po upływie 8 miesięcy od nawiązania stosunku pracy i by ocenę dało się zrobić w terminie z art. 38 ust. 1 ustawy. Do arkusza wpisuje się: datę rozmowy wstępnej, termin sprawozdania, okres dokonania oceny. Oceniany podpisuje potwierdzenie. Przełożony przekazuje kopię części I i II arkusza. Wzór arkusza — załącznik nr 2.

§ 5. Nowy termin sprawozdania: przy usprawiedliwionej nieobecności / obowiązkach poza miejscem pracy (przedłużenie o ten okres) albo przy przedłużeniu umowy (art. 35 ust. 4 ustawy); tak, by ocenę zrobić nie później niż miesiąc przed zakończeniem stosunku pracy. Zawiadomienie pisemne; kopia do arkusza.

§ 6. Sprawozdanie obejmuje okres nie krótszy niż 7 miesięcy i opisuje: zadania z OSP i inne istotne; problemy i rozwiązania; nowe umiejętności/wiedzę; wnioski usprawniające. Wzór — załącznik nr 3.

§ 7. Dokonanie pierwszej oceny: rozmowa oceniająca (§ 2; można omówić rozwój); oceny cząstkowe za elementy; ocena łączna = średnia arytmetyczna; werdykt pozytywny lub negatywny.

§ 8. Rozmowa oceniająca niezwłocznie po złożeniu sprawozdania albo po upływie terminu. Może uczestniczyć kierujący komórką.

§ 9. Skala: 3 pkt — poniżej oczekiwań; 5 — na poziomie; 7 — powyżej. Bierze się wnioski z rozmowy. Oceny wpisuje się do arkusza.

§ 10. Pozytywna wymaga łącznie: (1) zaliczenia egzaminu ze służby przygotowawczej; (2) złożenia sprawozdania w terminie; (3) nie więcej niż jednej oceny cząstkowej 3 pkt; (4) średniej nie niższej niż 5 pkt. Negatywna — gdy warunki nie spełnione. Wyjątki od egzaminu: absolwent KSAP bez wniosku o mianowanie; zastępstwo podlegające pierwszej ocenie; wyższe stanowisko w SC. Negatywna → uzasadnienie obowiązkowe. Pozytywna → uzasadnienie opcjonalne; wnioski rozwojowe opcjonalnie w porozumieniu z kierującym komórką.

§ 11. Niezwłoczne zapoznanie ocenianego; oryginał arkusza + sprawozdanie + pisma o terminach → akta osobowe; kopia arkusza → oceniany.
$doc$
),
(
  'FIRST_ORD_2015_ELEMENTS',
  'Dz. U. 2015 poz. 1144 — Załącznik nr 1 (opisy 5 elementów)',
  'FINAL_EVALUATION',
  20,
  $doc$
Źródło: Załącznik nr 1 do rozporządzenia Dz. U. 2015 poz. 1144 — OPISY ELEMENTÓW OCENY (pierwsza ocena).

1. RZETELNOŚĆ — wykonywanie zadań zgodnie ze standardami (przepisy, zasady, procedury) i dbałość o jakość; dotrzymywanie zobowiązań w wyznaczonym czasie.

2. WYKORZYSTYWANIE WIEDZY I DOSKONALENIE ZAWODOWE — wykorzystywanie wiedzy na stanowisku; doskonalenie wiedzy/umiejętności (wyszukiwanie, dobre praktyki, doświadczenia innych); korzystanie z dostępnych źródeł, rozwiązań i technologii.

3. ORGANIZACJA PRACY I ORIENTACJA NA OSIĄGANIE CELÓW — określanie sposobu realizacji; priorytety (waga i pilność); dobór zasobów; dostosowywanie się do okoliczności; wytrwałość i zaangażowanie.

4. KOMUNIKACJA — koncentracja na rozmówcy i wzajemne zrozumienie; jasne i precyzyjne wypowiedzi ustne; jasne wypowiedzi pisemne; przekonujące argumenty.

5. WSPÓŁPRACA — włączanie się we wspólne działania; przepływ informacji; dobra atmosfera i otwartość; dostrzeganie wkładu innych; branie pod uwagę zdania innych; dzielenie się wiedzą i doświadczeniem.
$doc$
),
(
  'FIRST_GUIDE_2016_STEPS',
  'Poradnik DSC 2016 — pierwsza ocena (krok po kroku)',
  'INITIAL_TALK',
  30,
  $doc$
Źródło: Poradnik „Pierwsza ocena w służbie cywilnej” (DSC KPRM, 2016) — skrót praktyczny dla przełożonego. Nie zastępuje rozporządzenia.

ETAPY (logika procesu):
1) Rozmowa wstępna (do 21 dni od nawiązania stosunku pracy / ustalenia podlegania ocenie przy zastępstwie).
2) Okres pracy + służba przygotowawcza / egzamin (gdy dotyczy) + obserwacja.
3) Sprawozdanie ocenianego (okres ≥ 7 mies.; termin od–do po 8 mies. od zatrudnienia, z zachowaniem terminu ustawowego oceny).
4) Rozmowa oceniająca + wypełnienie arkusza (oceny 3/5/7, średnia, werdykt).
5) Zapoznanie ocenianego; dokumenty do akt.

ROZMOWA WSTĘPNA — przełożony powinien:
- wyjaśnić sposób i tryb pierwszej oceny oraz 5 elementów z załącznika nr 1;
- omówić główne obowiązki z OSP i oczekiwania co do sposobu ich wykonywania;
- omówić oczekiwania co do postawy, zaangażowania, relacji i terminowości;
- wyznaczyć i wpisać termin sprawozdania oraz okres dokonania oceny;
- uzyskać podpis potwierdzający; przekazać kopię części I–II arkusza.

SPRAWOZDANIE — oceniany opisuje zadania, problemy/rozwiązania, nowe umiejętności, wnioski usprawniające. Brak sprawozdania w terminie lub złożenie po terminie wpływa na warunki oceny pozytywnej (§ 10).

ROZMOWA OCENIAJĄCA — po sprawozdaniu / po terminie; można omówić rozwój. Oceny cząstkowe odzwierciedlają poziom spełniania elementów, nie „sympatiæ”.

WERDYKT — pozytywna tylko przy spełnieniu wszystkich warunków § 10; negatywna wymaga uzasadnienia.

KOMPAS KOMPETENCJI (mapowanie): etap 1 = rozmowa wstępna; etap 2 = okres/służba przygotowawcza/sprawozdanie; etap 3 = rozmowa + arkusz + werdykt.
$doc$
),
(
  'PERIODIC_ORD_2016_CORE',
  'Dz. U. 2016 poz. 470 — ocena okresowa (rdzeń §§ 1–14)',
  'PERIODIC',
  40,
  $doc$
Źródło: rozporządzenie PRM z 4.04.2016 r. w sprawie warunków i sposobu przeprowadzania ocen okresowych urzędników i pracowników służby cywilnej (Dz. U. poz. 470).

§ 1–2. Ocena okresowa według kryteriów odpowiednich dla stanowiska. Kryteria: obowiązkowe + dodatkowe (max 3), jeśli uzasadnione charakterem obowiązków z OSP. Wykaz — załącznik nr 1.

§ 3. Arkusze:
- A — kierownik urzędu (stanowisko w SC);
- B — bezpośrednie kierowanie pracownikami (inne niż A);
- C — pozostałe stanowiska.
W Kompasie MC: B i C.

§ 4. Kryteria obowiązkowe:
- B (kierowanie): zarządzanie ludźmi; podejmowanie decyzji i odpowiedzialność; organizacja pracy i orientacja na cele; współpraca; komunikacja.
- C (specjalistyczne/inne): wykorzystywanie wiedzy i doskonalenie zawodowe; rzetelność; organizacja pracy i orientacja na cele; współpraca; komunikacja.
(Arkusz A m.in. + zarządzanie strategiczne — poza typowym zakresem B/C w Kompasie.)

§ 5–6. Rozmowa o kryteriach: obowiązki z OSP; kryteria obowiązkowe i ewentualne dodatkowe; oczekiwania; cele (gdy uzasadnione). Po rozmowie: wpis dodatkowych kryteriów i terminu sporządzenia oceny na piśmie; podpis ocenianego; oryginał do akt, kopia części I ocenianemu.

§ 7. Terminy tych czynności: 30 dni od poprzedniej oceny na piśmie lub od zatrudnienia na czas nieokreślony; albo 7 dni od negatywnej oceny na piśmie.

§ 8–9. Zmiana terminu oceny (ustawa) → pisemne zawiadomienie. Zmiana stanowiska z istotną zmianą obowiązków w ciągu 6 mies. → ponowne czynności § 5–6 w 30 dni (termin oceny bez zmiany). Zmiana oceniającego → ocena na wcześniej wybranych kryteriach.

§ 10. Przed oceną na piśmie: rozmowa oceniająca (obowiązki i kryteria; cele jeśli były; rozwój i potrzeby kwalifikacji).

§ 11. Sporządzenie na piśmie:
Skala cząstkowa: 1 / 3 / 5 / 7 / 9 (znacznie poniżej → znacznie powyżej).
Poziom ogólny = średnia: 1–2; >2–4; >4–6; >6–8; >8–9.
Pozytywna: poziom ogólny „na poziomie / powyżej / znacznie powyżej” ORAZ brak cząstkowej „znacznie poniżej” (1 pkt).
Negatywna: poziom „poniżej / znacznie poniżej” LUB co najmniej jedna cząstkowa 1 pkt.
Wnioski do indywidualnego programu rozwoju. Uzasadnienie obowiązkowe przy negatywnej; opcjonalne przy pozytywnej. Przy pozytywnej urzędnika SC — możliwy wniosek o kolejny stopień służbowy (część III).

§ 12. Zapoznanie ocenianego; oryginał do akt; kopia ocenianemu.

Praktyka cyklu: ocena co 24 miesiące (ustawa); w Kompasie kotwica + 24 mies. na kolejny cykl.
$doc$
),
(
  'PERIODIC_GUIDE_2016_STEPS',
  'Poradnik DSC 2016 — ocena okresowa (krok po kroku)',
  'PERIODIC',
  50,
  $doc$
Źródło: Poradnik „Oceny okresowe w służbie cywilnej” (DSC KPRM, 2016) — skrót praktyczny. Nie zastępuje rozporządzenia Dz. U. poz. 470.

ETAPY:
1) Rozmowa o kryteriach i terminie (obowiązkowe + max 3 dodatkowe z OSP) → podpis, kopia części I.
2) Okres podlegania ocenie (obserwacja, realizacja celów jeśli wyznaczono).
3) Rozmowa oceniająca → arkusz B/C na piśmie (cząstkowe, średnia, werdykt, wnioski rozwojowe) → zapoznanie.

DOBÓR ARKUSZA:
- B — gdy praca polega na bezpośrednim kierowaniu pracownikami;
- C — pozostałe (bez kierowania zespołem w rozumieniu § 3).

KRYTERIA DODATKOWE — max 3, najistotniejsze względem OSP; nie zastępują obowiązkowych.

TERMIN 24 MIES.: od poprzedniej oceny / zasad ustawowych; rozmowa o kryteriach zwykle w 30 dni od startu cyklu / zatrudnienia na czas nieokreślony (lub 7 dni po negatywnej).

WERDYKT: średnia > 4 i brak jedynek → ścieżka pozytywna (przy poziomach „na poziomie” i wyżej); 1 pkt na kryterium albo niski poziom ogólny → negatywna + uzasadnienie.

KOMPAS: etap 1 = kryteria i termin; etap 2 = okres; etap 3 = rozmowa + arkusz B/C.
$doc$
),
(
  'KOMPAS_APP_MAP',
  'Mapowanie procesu w aplikacji Kompas Kompetencji',
  'GENERAL',
  60,
  $doc$
Aplikacja Kompas Kompetencji wspiera przełożonego (i podgląd HR) w pierwszej ocenie oraz ocenie okresowej.

Role:
- supervisor / unit_head — prowadzą ocenę (tworzenie procesu, uwagi, arkusz, werdykt);
- hr — nadzór/podgląd, bez prowadzenia oceny.

Pierwsza ocena — 3 etapy UI:
1) Rozmowa wstępna (checklist, daty);
2) Służba przygotowawcza / okres + sprawozdanie (termin, plik/opis);
3) Rozmowa oceniająca + arkusz (wskaźniki → 3/5/7, średnia, werdykt, uzasadnienie, wnioski rozwojowe).

Ocena okresowa — 3 etapy UI:
1) Kryteria i termin (obowiązkowe + dodatkowe z OSP);
2) Okres podlegający ocenie;
3) Rozmowa + arkusz B/C (skala 1–9).

Narzędzia AI w procesie (poza czatem asystenta): sugestia kryteriów/pytań z OSP, mapowanie uwag na kompetencje, wnioski rozwojowe pod słabsze oceny.
Asystent czatu: pytania o przepisy i „co zrobić na etapie”; decyzja zawsze należy do przełożonego.
$doc$
)
on conflict (code) do update set
  title = excluded.title,
  stage = excluded.stage,
  sort_order = excluded.sort_order,
  content = excluded.content,
  updated_at = now();

select count(*) as legal_documents from public.legal_documents;
