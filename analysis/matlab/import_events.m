function events = import_events(campaignDir, idxs, eventsSource, syncSource)
    % This function imports events data from HDF5 or pupil files for the specified acquisition IDs 
    % According to the eventsSource, it reads the events data from either the "coordinator" group in the HDF5 files saved in the raw data directory
    % or from the pupil files in the preprocessing directory (since it has to be processed by the pupil analysis pipeline). 
    %
    % Inputs:
    %   campaignDir: string, path to the folder containing the raw and preprocessing data directories
    %   idxs: array of acquisition IDs
    %   eventsSource: string, specifies the source of events data ("crutch" or "pupil")
    % Output:
    %   events: table containing the imported events data

    raw_events = table(); % Initialize an empty table to store events data

    % paths setup
    switch eventsSource
        case "crutch"
            dataDir = fullfile(campaignDir, '01_raw', 'crutch');
            for idx = idxs
                % seek for the crutches' h5 file
                crutchFiles = dir(fullfile(dataDir, sprintf('*_acq_%d.h5', idx)));
                if isempty(crutchFiles)
                    error('HDF5 file not found for acquisition %d.', idx);
                end
                crutchFilename = fullfile(crutchFiles.folder, crutchFiles.name);

                groupPath = "/coordinator";
                datasets = h5info(crutchFilename, groupPath).Datasets;
                datasetNames = string({datasets.Name});

                timestampsRaw = read_dataset(crutchFilename, groupPath + "/timestamp");
                formattedTimestamps = parse_mads_timestamps(timestampsRaw);
                timestampUnixNs = double(round(posixtime(formattedTimestamps) .* 1e9));

                signalNames = datasetNames(~ismember(datasetNames, "timestamp"));
                if isempty(signalNames)
                    return
                end

                signalSeries = cell(numel(signalNames), 1);

                for s = 1:numel(signalNames)
                    signalName = signalNames(s);
                    signal = read_dataset(crutchFilename, groupPath + "/" + signalName);
                    signalSeries{s} = string(signal(:));
                end

                signalNames = string(signalNames(:));
                tableVarNames = matlab.lang.makeUniqueStrings(matlab.lang.makeValidName(cellstr(signalNames)));

                baseTable = table(timestampUnixNs, 'VariableNames', {'timestamp'});
                for i = 1:numel(signalSeries)
                    baseTable.(tableVarNames{i}) = signalSeries{i};
                end

                raw_events = [raw_events; baseTable];
                
            end

        case "pupil"
            dataDir = fullfile(campaignDir, '02_preprocessing', 'pupil');
            for idx = idxs
                % seek for the pupil folder
                pupilFolder = dir(fullfile(dataDir, sprintf('*_acq_%d-*', idx)));
                if isempty(pupilFolder)
                    % We can have several cases where we have more crutch acquisitions than pupil acquisitions, so we just skip the missing ones and warn the user.
                    warning('Pupil folder not found for acquisition %d. Check if this acquisition is present and needed.', idx);
                    continue;
                end
                pupilEvents = readtable(fullfile(pupilFolder.folder, pupilFolder.name, 'events.csv'), "VariableNamingRule", "preserve");
                timestampsRaw = double(pupilEvents.("timestamp [ns]"));
                labelNames = string(pupilEvents.("name"));

                raw_events = [raw_events; table(timestampsRaw, labelNames, idx*ones(length(timestampsRaw),1),'VariableNames', {'timestamp', 'label', 'id'})];
            end
        otherwise
            error('Invalid eventsSource: %s. Must be either "crutch" or "pupil".', eventsSource);

        % 
    end

    % Format the events
    % Events labels can be: 
    % "rest", "balance", "walk", "left_90", "right_90", "left_180", "right_180", 
    % "ramp_up", "ramp_down", "stairs_up", "stairs_down", "sit_down", "stand_up"
    % 
    % Every event has a ".begin" and a ".end" suffix 
    %
    % Every output event needs to have a start and an end timestamp, so we need to check if the events are paired correctly.
    % If an event is not paired correctly, we will discard it and warn the user.
    events = table(); % Initialize the events table with the raw events data
    for r = 1:height(raw_events)
        label = raw_events.label(r);
        if endsWith(label, ".begin")
            eventName = extractBefore(label, ".begin");
            endLabel = eventName + ".end";
            endIdx = find(raw_events.label == endLabel & raw_events.timestamp > raw_events.timestamp(r), 1, "first");
            if isempty(endIdx)
                warning('Unpaired event: %s at timestamp %d. This event will be discarded.', label, raw_events.timestamp(r));
                raw_events.label(r) = "";
            else
                % Add the paired event to the events table with the start and end timestamps
                events = [events; table(eventName, raw_events.timestamp(r), raw_events.timestamp(endIdx), raw_events.id(r), 'VariableNames', {'label', 'start_timestamp', 'end_timestamp', 'id'})];

                % Mark the paired begin and end events as processed
                raw_events.label(r) = ""; 
                raw_events.label(endIdx) = ""; 
            end
        elseif endsWith(label, ".end")
            % Since we process events in order, if we encounter an ".end" event it means that we didn't have a corresponding ".begin" event
            warning('Unpaired event: %s at timestamp %d. This event will be discarded.', label, raw_events.timestamp(r));
            raw_events.label(r) = "";
        
        end
    end
    

    % The crutches' raspberry are not automatically synchronized with the pupil neon. Therefore we need to handle the delay. 
    % We adopt two methods: "auto" the pupil neon delay is store in the crutch h5 file, "manual" a sync event is manually labeled in the pupil recording and on the crutch data
    % 2026-07-27: at the moment we will only develop the manual solution

    if syncSource == "manual"
        crutch_sync_info= readtable(fullfile(dataDir,"sync_with_crutch_force.xlsx"));
        
        % if we have more idxs for the same pupil recording we require to
        % add a suffix with the crutch id to combine
        for idx = idxs
            syncPupilIdx = find(events.label == "sync_" + idx, 1, "first");

            crutchMask = find(crutch_sync_info.id == idx, 1);
            delay = events.start_timestamp(syncPupilIdx) - crutch_sync_info.crutch_sync_event(crutchMask);
            
            idMask = events.id == idx;
            events.start_timestamp(idMask) = events.start_timestamp(idMask) - delay;
            events.end_timestamp(idMask) = events.end_timestamp(idMask) - delay;

        end

    elseif syncSource == "auto"
        error("Mode not yet implemented")
    else
        error("Mode not yet implemented")

    end

    


end

