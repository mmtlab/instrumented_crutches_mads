function timestamps = parse_mads_timestamps(timestampsRaw)
    timestampText = strtrim(string(timestampsRaw));
    timestamps = NaT(size(timestampText), 'TimeZone', 'UTC');

    hasMilliseconds = contains(timestampText, '.');
    if any(hasMilliseconds)
        timestamps(hasMilliseconds) = datetime(timestampText(hasMilliseconds), ...
            'InputFormat', 'yyyy-MM-dd''T''HH:mm:ss.SSSZ', 'TimeZone', 'UTC');
    end
    if any(~hasMilliseconds)
        timestamps(~hasMilliseconds) = datetime(timestampText(~hasMilliseconds), ...
            'InputFormat', 'yyyy-MM-dd''T''HH:mm:ssZ', 'TimeZone', 'UTC');
    end
end