function [signalFiltered, idxRemoved] = filterLoadcell(signal)
% HX711 loadcell amplifier introduce some unwanted spikes in the force signal. 
% This is a custom filter that removes the spikes
[~,idxRemoved]=rmoutliers(signal,'movmedian',9);

% Interpolate outliers
idxToInterp = find(idxRemoved(2:end-1)) + 1;
for idx = idxToInterp
    signal(idx) = (signal(idx-1) + signal(idx+1)) / 2;
end

% Remove outliers based on std
normSignal = (signal - mean(signal)) / std(signal);
idxOutlier = find(abs(normSignal(2:end-1)) > 7) + 1;
for idx = idxOutlier
    signal(idx) = (signal(idx-1) + signal(idx+1)) / 2;
end

signalFiltered = signal;
end