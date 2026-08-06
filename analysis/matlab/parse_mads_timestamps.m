function timestamps = parse_mads_timestamps(timestampsRaw)

    timezone = 'UTC';
    timestampText = strtrim(string(timestampsRaw));
    timestamps = NaT(size(timestampText), 'TimeZone', timezone);

    hasMilliseconds = contains(timestampText, '.');
    if any(hasMilliseconds)
        timestamps(hasMilliseconds) = datetime(timestampText(hasMilliseconds), ...
            'InputFormat', 'yyyy-MM-dd''T''HH:mm:ss.SSSZ', 'TimeZone', timezone);
    end
    if any(~hasMilliseconds)
        timestamps(~hasMilliseconds) = datetime(timestampText(~hasMilliseconds), ...
            'InputFormat', 'yyyy-MM-dd''T''HH:mm:ssZ', 'TimeZone', timezone);
    end
end