function events = format_events(raw_events)
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
            event_name = extractBefore(label, ".begin");
            end_label = event_name + ".end";
            end_idx = find(raw_events.label == end_label & raw_events.timestamp > raw_events.timestamp(r), 1, "first");
            if isempty(end_idx)
                warning('Unpaired event: %s at timestamp %d. This event will be discarded.', label, raw_events.timestamp(r));
                raw_events.label(r) = "";
            else
                % Add the paired event to the events table with the start and end timestamps
                events = [events; table(event_name, raw_events.timestamp(r), raw_events.timestamp(end_idx), raw_events.pupil_id(r), 'VariableNames', {'label', 'start_timestamp', 'end_timestamp', 'pupil_id'})];

                % Mark the paired begin and end events as processed
                raw_events.label(r) = ""; 
                raw_events.label(end_idx) = ""; 
            end
        elseif endsWith(label, ".end")
            % Since we process events in order, if we encounter an ".end" event it means that we didn't have a corresponding ".begin" event
            warning('Unpaired event: %s at timestamp %d. This event will be discarded.', label, raw_events.timestamp(r));
            raw_events.label(r) = "";
        
        end
    end

end

