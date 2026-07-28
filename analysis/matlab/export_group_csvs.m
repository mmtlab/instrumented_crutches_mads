function export_group_csvs(csvOutputDir, filename, groupName, timestampsRaw, sides, seriesNames, seriesValues)
if isempty(seriesNames) || isempty(seriesValues)
    return
end

% remove file extension from the filename
filename = regexprep(filename, '.h5', '');

safeGroupName = regexprep(string(groupName), '[^a-zA-Z0-9_-]', '_');
seriesNames = string(seriesNames(:));
tableVarNames = matlab.lang.makeUniqueStrings(matlab.lang.makeValidName(cellstr(seriesNames)));

baseTable = table(timestampsRaw, 'VariableNames', {'timestamp'});
for i = 1:numel(seriesValues)
    values = seriesValues{i};
    if isempty(values)
        baseTable.(tableVarNames{i}) = nan(height(baseTable), 1);
    else
        baseTable.(tableVarNames{i}) = values(1:height(baseTable));
    end
end

if sides == ""
    outName = sprintf('%s_%s.csv', filename, safeGroupName);
    outPath = fullfile(csvOutputDir, outName);
    writetable(baseTable, outPath);
    return
end

for sideLabel = ["left", "right"]
    rowMask = sides == sideLabel;
    if ~any(rowMask)
        continue
    end

    sideTable = baseTable(rowMask, :);
    outName = sprintf('%s_%s_%s.csv', filename, safeGroupName, sideLabel);
    outPath = fullfile(csvOutputDir, outName);
    writetable(sideTable, outPath);
end
end