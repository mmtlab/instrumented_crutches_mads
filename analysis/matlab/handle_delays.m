function delays = handle_delays(campaign_dir, idxs, events, crutch_info)
    % This function eveluate the delays between the pupil neon's smartphone
    % and the crutches master's raspberry that runs the h5 file logger
    %
    % Inputs:
    %   campaignDir: string, path to the folder containing the raw and preprocessing data directories
    %   idxs: table of acquisition IDs of the pupil and the crutch
    %
    % Output:
    %   delays: struct containing the delay with the testID
    

    % Before 30/07/2026 the crutches' raspberry are not automatically synchronized with the pupil neon. 
    % Therefore we need to handle the delay and we adopt two methods: 
    % - "auto" the pupil neon delay is store in the crutch h5 file,
    % - "manual" a sync event is manually labeled in the pupil recording and on the crutch data
    % 
    % In the "overwrite_sync_with_crutch.xlsx" stored in the
    % "02_preprocessing\pupil" folder we let the user define which test
    % should overwrite the automatic method with the manual. If there is no
    % raw with the related subject_id, session_id and id we assume the
    % automatic syncronization

    overwrite_sync= readtable(fullfile(campaign_dir,"02_preprocessing","pupil","overwrite_sync_with_crutch.xlsx"));

    for i = 1:height(idxs)

        subject_id = idxs.subject_id(i);
        session_id = idxs.session_id(i);
        pupil_id = idxs.pupil_id(i);
        crutch_id = idxs.crutch_id(i);

        % Ids must match 
        row_mask = double(overwrite_sync{:, "subject"}) == subject_id & double(overwrite_sync{:, "session"}) == session_id;
        row_mask = row_mask & double(overwrite_sync{:, "pupil_id"}) == pupil_id & double(overwrite_sync{:, "crutch_id"}) == crutch_id;

        % Take the min and max time for this IDs combination
        left_crutch_info_row_mask = crutch_info.left_crutch{:, "subject_id"} == subject_id & crutch_info.left_crutch{:, "session_id"} == session_id;
        left_crutch_info_row_mask = left_crutch_info_row_mask & crutch_info.left_crutch{:, "crutch_id"} == crutch_id;
        right_crutch_info_row_mask = crutch_info.right_crutch{:, "subject_id"} == subject_id & crutch_info.right_crutch{:, "session_id"} == session_id;
        right_crutch_info_row_mask = right_crutch_info_row_mask & crutch_info.right_crutch{:, "crutch_id"} == crutch_id;
        
        crutch_start_time = min([crutch_info.left_crutch.start_time(left_crutch_info_row_mask,:), crutch_info.right_crutch.start_time(right_crutch_info_row_mask)]);
        crutch_end_time = min([crutch_info.left_crutch.end_time(left_crutch_info_row_mask,:), crutch_info.right_crutch.end_time(right_crutch_info_row_mask)]);

        delays.subject_id(i,:) = subject_id;
        delays.session_id(i,:) = session_id;
        delays.crutch_id(i,:) = crutch_id;
        delays.pupil_id(i,:) = pupil_id;

        if any(row_mask)
            % if the subject_id, session_id and id combination is present,
            % use the manual synchronization
            sync_pupil_idx = find(events.label == "sync_" + crutch_id, 1, "first");

            delays.value(i,:) = overwrite_sync.crutch_sync_event(i) - events.start_timestamp(sync_pupil_idx);

            delays.pupil_start_time(i,:) = crutch_start_time - delays.value(i,:);
            delays.pupil_end_time(i,:) = crutch_end_time - delays.value(i,:);
            
        else
            % Use the default automatic method that use the delay estimated
            % with the pupil real time api methods. Delays are store in the
            % crutch h5 file
            data_dir = fullfile(campaign_dir, '01_raw', 'crutch');
            [~, ~, pupil_neon] = import_hdf5_data(data_dir, idx, "pupil_neon", false);

            delays.value(i,:) = mean(pupil_neon.time_offset_ms_mean) * 10^6; % from ms to ns
            
            % id_mask = events.id == idx;
            % events.start_timestamp(id_mask) = events.start_timestamp(id_mask) + delay;
            % events.end_timestamp(id_mask) = events.end_timestamp(id_mask) + delay;

        end



    end

    delays = struct2table(delays);

end

