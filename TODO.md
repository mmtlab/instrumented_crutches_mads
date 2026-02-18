
Devo capire quando finisce la condizione e non ci sono momenti di attesa. Oppure metto sempre balancing. 
Quando è fermo analizzare l’equilibrio.
RICHIEDO A PAOLO DI PREMERE SEMPRE BALANCING (già lo faceva)

C’è un beep dell’esoscheletro a partenza e fine
Se non ci pensa e parla va. Valutazione dell’attività verbale in futuro? 
IN FUTURO PENSIAMO DI ANALIZZARE L'AUDIO DEI PUPIL

Gestire visualizzazione e download di file pesanti.
DOVREBBE FUNZIONARE GIA', MA E' DA VERIFICARE

Gestire il lancio del service dell'interfaccia e poi dell'error_handler prima degli altri nodi OPPURE All'avvio del web_server (o quando serve) gli agenti devono mandare un messaggio del proprio stato nel topic di pubblicazione per dire che va tutto bene. Status_handler deve gestirli e mandarli in status 

Questo per gestire i service all'avvio
[Unit]
Description=Service Controller/Loadcell ecc
After=SERVICE-STATUS_HANDLER.service

[Service]
Type=simple
ExecStartPre=/bin/sleep 3
ExecStart=/usr/local/bin/Service Controller/Loadcell

[Install]
WantedBy=multi-user.target

Aggiornare tutti i readme dei sottomoduli

Aggiungere l'acquisizione dell'imu

Aggiungere l'acquisizione dell'handle

Gestire dinamicamente il master? Bisogna gestire anche gli id per evitare di avere delle prove con lo stesso id se si cambia la stampella master. 
Ogni stampella internamente gestisce i propri id, ma ad ogni id è abbinato il subjectID e sessionID. Quindi quando scarico i dati li scarico con formato
subject_#_session_#_run_# dove la run è calcolata cercando le prove per quel soggetto e sessione. Bisogna essere sicuri quindi che l'utente non inserisca due volte lo stesso subjectID e sessionID. Direi che è un controllo che l'utente può fare. Darei la possibilità di modificare i subjectID e sessionID dopo l'acquisizione in modo che se l'utente si accorge dell'errore può modificarli prima di scaricarli. 
SOLUZIONE ATTUALE: 
- master dinamico controllando se l'ip è 10.42.0.1 (uccidere web_server, controller, status_handler se non su master)
- due "database" separati con id separati. Faremo attenzione al download
IN FUTURO:
- gestire id dei file in download


Gestire il controllo dell'avvio dell'acquisizione verificando da status_handler se gli agenti stanno pubblicando messaggi. Basta vedere se mi arriva un messaggio su quel topic.

