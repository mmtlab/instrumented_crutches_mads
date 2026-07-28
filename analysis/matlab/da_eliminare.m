events_crutch = import_events(campaignDir,idxs, "crutch");
events_pupil = import_events(campaignDir,idxs, "pupil");

t0 = min([events_crutch.start_timestamp(1), events_pupil.start_timestamp(1)]);
figure
xline((events_crutch.start_timestamp - t0)*10^-9, 'r')
hold on
xline((events_pupil.start_timestamp - t0)*10^-9 -20, 'b')




