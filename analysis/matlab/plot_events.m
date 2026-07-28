function [] = plot_events(events, offset, colors, lower_line, upper_line, text_line)
% if text_line is nan it will not be printed
    for e = 1:height(events)
        
        start_time = (events.start_timestamp(e)-offset)*1e-9;
        end_time = (events.end_timestamp(e)-offset)*1e-9;
        label = events{e,"label"};
        labelFormatted = strrep(label,"_", " ");
    
        if label == "recording" || startsWith(label,"sync_")
            continue
        end
    
        vertices = [start_time lower_line; end_time lower_line; end_time upper_line; start_time upper_line];
        faces = [1 2 3 4];
    
        patch('Faces', faces, 'Vertices', vertices, 'FaceColor', colors.(label), 'FaceAlpha', .2, 'EdgeColor', 'none')

        if ~isnan(text_line)
            text(start_time + 1, text_line, labelFormatted)
        end
    end
end