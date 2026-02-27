
Devo capire quando finisce la condizione e non ci sono momenti di attesa. Oppure metto sempre balancing. 
Quando è fermo analizzare l’equilibrio.
RICHIEDO A PAOLO DI PREMERE SEMPRE BALANCING (già lo faceva)

C’è un beep dell’esoscheletro a partenza e fine
Se non ci pensa e parla va. Valutazione dell’attività verbale in futuro? 
IN FUTURO PENSIAMO DI ANALIZZARE L'AUDIO DEI PUPIL

Gestire visualizzazione e download di file pesanti.
DOVREBBE FUNZIONARE GIA', MA E' DA VERIFICARE

Gestire il lancio del service dell'interfaccia e poi dell'error_handler prima degli altri nodi OPPURE All'avvio del web_server (o quando serve) gli agenti devono mandare un messaggio del proprio stato nel topic di pubblicazione per dire che va tutto bene. Status_handler deve gestirli e mandarli in status 
SOLUZIONE IN PROVA: per semplicità voglio lanciare tutti gli agenti al boot senza controllare i service. Ogni agente deve rispondere al comando "health_status" con il campo "health_status" nel json in output. Il campo può contenere valori come "recording", "idle", "connected"

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

IMPORTANTE: quando cambia la condizione devo mandare old_condition.end e quando inizia new_condition.begin


Donne con capelli legati per non coprire gli occhiali. Portare una confezione di lacci da lasciare in Larin.

Difficile passare da turning a walking, come possiamo identificare automaticamente? 
Comandi vocali per le condizioni?

Cavetto occhiali da sistemare per non dare fastidio a paolo e al soggetto 

Spessori per i piedi piccoli perché ballano

Quando parlano con Paolo tendono a girare la testa


Fare Manuale d'uso delle stampelle
Accendi stampella destra
Accendi cellulare pupil e connettilo alla wifi crutchwifi
Apri l’app stampelle
Previ calibrate e verifica che si aggiorni l’offset della destra
Accendi stampella sinistra e attendi finché si aggiorna l’offset sull’interfaccia
Solleva entrambe le stampelle e ripremi calibrate
Collega gli occhiali al cellulare e dopo 5 secondi circa premi connect su eye tracker. Verifica che esca connected
Correggi l’offset sull’app neon (oppure lo possiamo fare post?) 
Inserisci i dati attuali di soggetto e sessione





Da dire a Paolo
- non c'è modified_settings con l'evento shutdown, ma solo con lo startup. Sembra un po' radomico in realtà
- Non trova il plugin e mi dà errore dei driver con la versione più recente (88) di mads
- dont-block in agent_event è sempre null anche se attivo
- Gli agenti python non pubblicano su agent_event


NEXT:
- aggiornare i grafici con la nuova configurazione del file h5
- caricare i nuovi agenti sulla raspi e compilare
- aggiornare i service per farli partire tutti insieme semplicemente (forse è già così). Controllare quello di hdf5_writer che è passato da Sink a Filter