
Devo capire quando finisce la condizione e non ci sono momenti di attesa. Oppure metto sempre balancing. 
Quando è fermo analizzare l’equilibrio.
RICHIEDO A PAOLO DI PREMERE SEMPRE BALANCING (già lo faceva)

C’è un beep dell’esoscheletro a partenza e fine
Se non ci pensa e parla va. Valutazione dell’attività verbale in futuro? 
IN FUTURO PENSIAMO DI ANALIZZARE L'AUDIO DEI PUPIL

Gestire visualizzazione e download di file pesanti

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


Aggiungere recording pupil neon con la possibilità di abilitarlo o meno
- quando non sto ancora acquisendo lo connetto
- stimo il ritardo dal cellulate del timestamp ogni 5 secondi
- quando ricevo lo start i sospendo la stima dato che potrei avere la rete intasata e una stima meno accurata
- avvio la registrazione dei pupil 
- attendere 300 ms dallo start prima di inviare il messaggio per essere sicuri che venga letto da hdf5_writer?
- riempire i campi 'recording_id', 'time_offset_ms_mean', 'time_offset_ms_std', 'time_offset_ms_median', 'roundtrip_duration_ms_mean', 'roundtrip_duration_ms_std', 'roundtrip_duration_ms_median' ed inviarli in un messaggio
- attendere lo stop
- allo stop fermare la resistrazione e salvare
- riprendere la stima del ritardo della rete ogni 5 secondi


Gestire sincronizzazione neon

Usare hd5f per salvare anche gli altri dati 
- IMU
- neon
- altre celle di carico

Aggiornare tutti i readme dei sottomoduli

