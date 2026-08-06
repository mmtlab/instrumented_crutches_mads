function [gaze, fixations, saccades, blinks, imu, events, ecg] = import_pupil_neon_and_ecg_data(campaign_dir, idxs, crutch_info)
    % Import the pupil neon data anche correct the delay
    % The same delay is applied on the ecg data
    % Since if the delay is computed thanks to the pupil neon (by using events or
    % by remote control), we added here the ecg import pipeline that share the
    % time baseline with the pupil neon (same smartphone)
    
    if length(unique(idxs.crutch_id)) > 1
        apply_data_cut = true;
    else
        apply_data_cut = false;
    end
    
    gaze = [];
    fixations = [];
    saccades = [];
    blinks = [];
    imu = [];
    events = [];
    ecg = [];
    for i = 1:height(idxs)
    
        % This test IDs
        subject_id = idxs.subject_id(i);
        session_id = idxs.session_id(i);
        pupil_id = idxs.pupil_id(i);
        crutch_id = idxs.crutch_id(i);
    
        % seek for the pupil folder
        pupil_folder = dir(fullfile(campaign_dir,"02_preprocessing", "pupil", sprintf('sub_%d_cond_%d_acq_%d-*', [subject_id, session_id, pupil_id])));
        if isempty(pupil_folder)
            % We can have several cases where we have more crutch acquisitions than pupil acquisitions, so we just skip the missing ones and warn the user.
            warning('Pupil folder not found for acquisition %d. Check if this acquisition is present and needed.', pupil_id);
            continue;
        end
    
        %% Fix the delay
    
        % evaluate the delay between the raspberry (hdf5 file logger) and the pupil
        % neon's smartphone
        % Before 30/07/2026 the crutches' raspberry are not automatically synchronized with the pupil neon.
        % Therefore we need to handle the delay and we adopt two methods:
        % - "auto" the pupil neon delay is store in the crutch hdf5 file,
        % - "manual" a sync event is manually labeled in the pupil recording and on the crutch data
        %
        % In the "overwrite_sync_with_crutch.xlsx" stored in the
        % "02_preprocessing\pupil" folder we let the user define which test
        % should overwrite the automatic method with the manual. If there is no
        % raw with the related subject_id, session_id and id we assume the
        % automatic syncronization
    
        % PUPIL EVENTS
        raw = readtable(fullfile(pupil_folder.folder, pupil_folder.name, 'events.csv'), "VariableNamingRule", "preserve");
    
        formatted = [];
        formatted.("timestamp") = double(raw.("timestamp [ns]"));
        formatted.("label") = string(raw.("name"));
    
        formatted = struct2table(formatted);
        formatted.("pupil_id") = pupil_id*ones(height(formatted),1);
        formatted_events = format_events(formatted);
    
    
        % handle delays
        overwrite_sync= readtable(fullfile(campaign_dir,"02_preprocessing","pupil","overwrite_sync_with_crutch.xlsx"));
    
        % Ids must match
        row_mask = double(overwrite_sync{:, "subject"}) == subject_id & double(overwrite_sync{:, "session"}) == session_id;
        row_mask = row_mask & double(overwrite_sync{:, "pupil_id"}) == pupil_id & double(overwrite_sync{:, "crutch_id"}) == crutch_id;
    
        % Take the min and max time for this IDs combination
        left_crutch_info_row_mask = crutch_info.left_crutch{:, "subject_id"} == subject_id & crutch_info.left_crutch{:, "session_id"} == session_id;
        left_crutch_info_row_mask = left_crutch_info_row_mask & crutch_info.left_crutch{:, "crutch_id"} == crutch_id;
        right_crutch_info_row_mask = crutch_info.right_crutch{:, "subject_id"} == subject_id & crutch_info.right_crutch{:, "session_id"} == session_id;
        right_crutch_info_row_mask = right_crutch_info_row_mask & crutch_info.right_crutch{:, "crutch_id"} == crutch_id;
    
        crutch_start_time = min([crutch_info.left_crutch.start_time(left_crutch_info_row_mask,:), crutch_info.right_crutch.start_time(right_crutch_info_row_mask)]);
        crutch_end_time = max([crutch_info.left_crutch.end_time(left_crutch_info_row_mask,:), crutch_info.right_crutch.end_time(right_crutch_info_row_mask)]);
    
        if any(row_mask)
            % if the subject_id, session_id and id combination is present,
            % use the manual synchronization
            sync_pupil_idx = find(formatted_events.label == "sync_" + crutch_id, 1, "first");
    
            delay = overwrite_sync.crutch_sync_event(row_mask) - formatted_events.start_timestamp(sync_pupil_idx);
    
        else
            % Use the default automatic method that use the delay estimated
            % with the pupil real time api methods. Delays are store in the
            % crutch h5 file
            data_dir = fullfile(campaign_dir, '01_raw', 'crutch');
            [~, ~, pupil_neon] = import_hdf5_data(data_dir, idxs(i,:), "pupil_neon", false);
    
            delay = mean(pupil_neon.time_offset_ms_mean) * 10^6; % from ms to ns
    
            
        end
    
        %% Import pupil data and apply delay
        
    
        % Note: this way is not computational efficient but we keep it at
        % the moment since we do not have any constrain
    
    
        % GAZE
        raw = readtable(fullfile(pupil_folder.folder, pupil_folder.name, 'gaze.csv'), "VariableNamingRule", "preserve");
    
        raw_columns = ["timestamp [ns]", "gaze x [px]", "gaze y [px]", "gaze mono left x [px]", "gaze mono left y [px]", "gaze mono right x [px]", "gaze mono right y [px]", "worn", "fixation id", "blink id", "azimuth [deg]", "elevation [deg]"];
        formatted_columns = ["timestamp", "gaze_x", "gaze_y", "gaze_mono_left_x", "gaze_mono_left_y", "gaze_mono_right_x", "gaze_mono_right_y", "worn", "fixation_id", "blink_id", "azimuth", "elevation"];
    
        formatted = [];
        for col = 1:length(raw_columns)
            formatted.(formatted_columns(col)) = double(raw.(raw_columns(col)));
        end
        formatted = struct2table(formatted);
        formatted.("pupil_id") = pupil_id*ones(height(formatted),1);
    
        delayed = apply_delay(formatted, delay, crutch_start_time, crutch_end_time, apply_data_cut);
        gaze = [gaze; delayed];
    
    
        % FIXATIONS
        raw = readtable(fullfile(pupil_folder.folder, pupil_folder.name, 'fixations.csv'), "VariableNamingRule", "preserve");
    
        raw_columns = ["fixation id", "start timestamp [ns]", "end timestamp [ns]", "duration [ms]", "fixation x [px]", "fixation y [px]", "azimuth [deg]", "elevation [deg]"];
        formatted_columns = ["fixation_id", "start_timestamp", "end_timestamp", "duration", "fixation_x", "fixation_y", "azimuth", "elevation"];
    
        formatted = [];
        for col = 1:length(raw_columns)
            formatted.(formatted_columns(col)) = double(raw.(raw_columns(col)));
        end
        formatted = struct2table(formatted);
        formatted.("pupil_id") = pupil_id*ones(height(formatted),1);
        delayed = apply_delay_on_events(formatted, delay, crutch_start_time, crutch_end_time, apply_data_cut);
        fixations = [fixations; delayed];
    
    
        % SACCADES
        raw = readtable(fullfile(pupil_folder.folder, pupil_folder.name, 'saccades.csv'), "VariableNamingRule", "preserve");
    
        raw_columns = ["saccade id", "start timestamp [ns]", "end timestamp [ns]", "duration [ms]", "amplitude [px]", "amplitude [deg]", "mean velocity [px/s]", "peak velocity [px/s]"];
        formatted_columns = ["saccade_id", "start_timestamp", "end_timestamp", "duration","amplitude_px", "amplitude_deg", "mean_velocity", "peak_velocity"];
    
        formatted = [];
        for col = 1:length(raw_columns)
            formatted.(formatted_columns(col)) = double(raw.(raw_columns(col)));
        end
        formatted = struct2table(formatted);
        formatted.("pupil_id") = pupil_id*ones(height(formatted),1);
        delayed = apply_delay_on_events(formatted, delay, crutch_start_time, crutch_end_time, apply_data_cut);
        saccades = [saccades; delayed];
    
    
        % BLINKS
        raw = readtable(fullfile(pupil_folder.folder, pupil_folder.name, 'blinks.csv'), "VariableNamingRule", "preserve");
    
        raw_columns = ["blink id", "start timestamp [ns]", "end timestamp [ns]", "duration [ms]"];
        formatted_columns = ["blink_id", "start_timestamp", "end_timestamp", "duration"];
    
        formatted = [];
        for col = 1:length(raw_columns)
            formatted.(formatted_columns(col)) = double(raw.(raw_columns(col)));
        end
        formatted = struct2table(formatted);
        formatted.("pupil_id") = pupil_id*ones(height(formatted),1);
        delayed = apply_delay_on_events(formatted, delay, crutch_start_time, crutch_end_time, apply_data_cut);
        blinks = [blinks; delayed];
    
    
        % IMU
        raw = readtable(fullfile(pupil_folder.folder, pupil_folder.name, 'imu.csv'), "VariableNamingRule", "preserve");
    
        raw_columns = ["timestamp [ns]","gyro x [deg/s]","gyro y [deg/s]","gyro z [deg/s]","acceleration x [g]","acceleration y [g]","acceleration z [g]","roll [deg]","pitch [deg]","yaw [deg]","quaternion w","quaternion x","quaternion y","quaternion z"];
        formatted_columns = ["timestamp","gyro_x","gyro_y","gyro_z","acc_x","acc_y","acc_z","roll","pitch","yaw","quat_w","quat_x","quat_y","quat_z"];
    
        formatted = [];
        for col = 1:length(raw_columns)
            formatted.(formatted_columns(col)) = double(raw.(raw_columns(col)));
        end
        formatted = struct2table(formatted);
        formatted.("pupil_id") = pupil_id*ones(height(formatted),1);
        delayed = apply_delay(formatted, delay, crutch_start_time, crutch_end_time, apply_data_cut);
        imu = [imu; delayed];
    
        % fix the events' timestamp
        delayed = apply_delay_on_events(formatted_events, delay, crutch_start_time, crutch_end_time, apply_data_cut);
        events = [events; delayed];% Adapt the events to the format
        
        % Import the ECG data and apply the delay
        % The ecg files are store in "01_raw/ecg" and their filename is the
        % recording time at the start in the format 
        % "day month year, HH_mm_ss-#.csv" 
        % Example: "7 Jul 2026, 09_09_30-1.csv"
        % If the recording exceed a timeout it will generate a new file
        % increasing the last number
        % Example: "7 Jul 2026, 09_09_30-2.csv"
        % We use the crutch_start_time to seek the closest recording
        ecg_folder = fullfile(campaign_dir,"01_raw","ecg");
        ecg_files_list = parse_ecg_files(ecg_folder);
        ecg_files_list.timestamp = convertTo(ecg_files_list.datetime,"epochtime","TicksPerSecond",10^9);
    
        time_diff = double(ecg_files_list.timestamp) - double(crutch_start_time);
        [~,closest_ecg_file_idx] = min(time_diff); % trovo il minimo e prendo solo il primo se lo trovo

        closest_ecg_file_idxs = find(time_diff(closest_ecg_file_idx) == time_diff); % vedo se ce ne sono altri
        
        formatted = [];
        for ecg_idx = closest_ecg_file_idxs'
            raw = readtable(fullfile(ecg_folder,ecg_files_list.filename(ecg_idx)),'readvariablenames',1,'Range',1, "VariableNamingRule", "preserve");
            raw = renamevars(raw,"UNIX Timestamp","timestamp");
            raw = renamevars(raw,raw.Properties.VariableNames,lower(raw.Properties.VariableNames));
            formatted = [formatted; raw];
        end
        delayed = apply_delay(formatted, delay, crutch_start_time, crutch_end_time, apply_data_cut);
        ecg = [ecg, delayed];

    end



end

function data = apply_delay(data, delay, start_time, end_time, cut_data)

    % Add the delay on the time columns
    data.timestamp = data.timestamp + delay;

    % If enabled, cut data outside the crutch data interval (+- a 30
    % seconds windows)
    window = 30 * 10^9;
    if cut_data
        row_mask = data.timestamp >= start_time - window & data.timestamp <= end_time + window;
        data(~row_mask,:) = [];
    end
    
end


function data = apply_delay_on_events(data, delay, start_time, end_time, cut_data)

    % Add the delay on the time columns
    data.start_timestamp = data.start_timestamp + delay;
    data.end_timestamp = data.end_timestamp + delay;

    % If enabled, cut data outside the crutch data interval (+- a 30
    % seconds windows)
    window = 30 * 10^9;
    if cut_data
        row_mask = data.start_timestamp >= start_time - window & data.end_timestamp <= end_time + window;
        data(~row_mask,:) = [];
    end
    
end