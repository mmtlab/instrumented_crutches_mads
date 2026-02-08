Aggiungi stand up e down alle condizioni 

Aggiungi feedback della condizione selezionata 

Aggiungi non valida ultima cond

Devo capire quando finisce la condizione e non ci sono momenti di attesa. Oppure metto sempre balancing

C’è un beep dell’esoscheletro a partenza e fine

Quando è fermo analizzare l’equilibrio 

Metti i colori delle condizioni per categoria

Se non ci pensa e parla va. Valutazione dell’attività verbale in futuro? 

Non c’e stand up e down quindi abbiamo usato stair down up

Assegnare id al paziente e non mettere il nome. Assegnare la sessione e non mettere il nome. Assegnare la run ad ogni start

Gestire visualizzazione e download di file pesanti

cercare l'ultima acquisizione dai nomi e non dal numero dei file nella cartella (cosa succede se elimino un file?)

Gestire il lancio del service dell'interfaccia e poi dell'error_handler prima degli altri nodi

Spostare il feedback del master a seconda di chi è il master

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

