clear
close all
clc

% Configuration
idx = 27;

scriptDir = fileparts(mfilename('fullpath'));
analysisDir = fileparts(scriptDir);
dataDir = fullfile(analysisDir, '..', 'web_server', 'data');
filename = fullfile(dataDir, sprintf('acq_%d.h5', idx));
outputDir = fullfile(analysisDir, 'graphs');
csvOutputDir = fullfile(analysisDir, 'csv');

if ~isfile(filename)
    files = dir(fullfile(dataDir, 'acq_*.h5'));
    available = strings(numel(files), 1);
    for i = 1:numel(files)
        tokens = regexp(files(i).name, '^acq_(\d+)\.h5$', 'tokens', 'once');
        if ~isempty(tokens)
            available(i) = tokens{1};
        end
    end
    available = available(available ~= "");
    error('File non trovato: acq_%d.h5. Numeri disponibili: %s', idx, strjoin(cellstr(available), ', '));
end

fprintf('File selezionato (numero %d): %s\n', idx, string(filename));

info = h5info(filename);

fprintf('Campi contenuti nel file H5:\n');
print_h5_fields(info, '');

% Read coordinator group (labels + timestamps) if present
coordinatorLabels = string([]);
coordinatorTimestamps = string([]);
for gi = 1:numel(info.Groups)
    gname = extractAfter(string(info.Groups(gi).Name), '/');
    if gname == "coordinator"
        try
            coordinatorTimestamps = read_string_dataset(filename, info.Groups(gi).Name + "/timestamp", "timestamp");
        catch
            coordinatorTimestamps = string([]);
        end
        try
            coordinatorLabels = read_string_dataset(filename, info.Groups(gi).Name + "/label", "label");
        catch
            coordinatorLabels = string([]);
        end
        break
    end
end

if ~exist(outputDir, 'dir')
    mkdir(outputDir);
end

if ~exist(csvOutputDir, 'dir')
    mkdir(csvOutputDir);
end

for g = 1:numel(info.Groups)
    groupInfo = info.Groups(g);
    groupPath = string(groupInfo.Name);     % e.g. "/ppg"
    groupName = extractAfter(groupPath, '/');
    plot_group(filename, groupPath, groupName, idx, outputDir, csvOutputDir, coordinatorLabels, coordinatorTimestamps);
end

plot_tip_handle_combined(filename, idx, outputDir);


function print_h5_fields(nodeInfo, prefix)
for i = 1:numel(nodeInfo.Datasets)
    ds = nodeInfo.Datasets(i);
    fullPath = string(ds.Name);
    if prefix ~= ""
        fullPath = prefix + "/" + fullPath;
    else
        fullPath = "/" + fullPath;
    end

    dims = ds.Dataspace.Size;
    dimsText = strjoin(string(dims), 'x');
    fprintf('[DATASET] %s shape=%s\n', fullPath, dimsText);
end

for i = 1:numel(nodeInfo.Groups)
    g = nodeInfo.Groups(i);
    gPath = string(g.Name);
    fprintf('[GROUP]   %s\n', gPath);
    print_h5_fields(g, gPath);
end
end


function plot_group(filename, groupPath, groupName, idx, outputDir, csvOutputDir, coordinatorLabels, coordinatorTimestamps)
datasets = h5info(filename, groupPath).Datasets;
datasetNames = string({datasets.Name});

timestampName = find_first(datasetNames, ["timestamp", "timsestamp"]);
sideName = find_first(datasetNames, "side");

if timestampName == "" || sideName == ""
    return
end

timestampsRaw = read_string_dataset(filename, groupPath + "/" + timestampName, "timestamp");
sidesRaw = read_string_dataset(filename, groupPath + "/" + sideName, "side");

sides = strings(numel(sidesRaw), 1);
for i = 1:numel(sidesRaw)
    sides(i) = normalize_side(sidesRaw(i));
end

[timeSeconds, tsAll, timingInfo] = relative_seconds_from_common_t0(timestampsRaw, sides);

exclude = [timestampName, sideName];
signalNames = datasetNames(~ismember(datasetNames, exclude));
if isempty(signalNames)
    return
end

leftColor = [128, 0, 32] / 255;   % Burgundy
rightColor = [0, 100, 0] / 255;   % Dark green

fig = figure('Visible', 'on', 'Color', 'w', 'Position', [100, 100, 1100, max(320 * numel(signalNames), 450)]);
tiledlayout(numel(signalNames), 1);

ax = gobjects(numel(signalNames), 1);
yMin = inf;
yMax = -inf;
signalSeries = cell(numel(signalNames), 1);

for s = 1:numel(signalNames)
    signalName = signalNames(s);
    signal = read_dataset_1d(filename, groupPath + "/" + signalName);
    signalSeries{s} = double(signal(:));

    n = min([numel(timeSeconds), numel(sides), numel(signal)]);
    if n == 0
        continue
    end

    t = timeSeconds(1:n);
    sideSlice = sides(1:n);
    y = double(signal(1:n));

    finiteMask = isfinite(y);
    if any(finiteMask)
        yMin = min(yMin, min(y(finiteMask)));
        yMax = max(yMax, max(y(finiteMask)));
    end

    leftMask = sideSlice == "left";
    rightMask = sideSlice == "right";

    ax(s) = nexttile;
    hold on
    plot(t(leftMask), y(leftMask), '.', 'Color', leftColor, 'DisplayName', 'left', 'MarkerSize', 8, 'LineStyle', 'none');
    plot(t(rightMask), y(rightMask), '.', 'Color', rightColor, 'DisplayName', 'right', 'MarkerSize', 8, 'LineStyle', 'none');
    title(signalName, 'Interpreter', 'none');
    ylabel(signalName, 'Interpreter', 'none');
    grid on
    legend('Location', 'best');
end

validAx = ax(isgraphics(ax));
if ~isempty(validAx) && isfinite(yMin) && isfinite(yMax)
    if yMin == yMax
        delta = max(1, abs(yMin) * 0.05);
        yLimits = [yMin - delta, yMax + delta];
    else
        yLimits = [yMin, yMax];
    end

    for i = 1:numel(validAx)
        ylim(validAx(i), yLimits);
    end
end

if numel(validAx) > 1
    linkaxes(validAx, 'x');
end

    % Apply coordinator-based background shading
    try
        apply_condition_background(validAx, coordinatorLabels, coordinatorTimestamps, tsAll, timingInfo);
    catch
    end

xlabel('time [s]');
sgtitle("Group: " + groupName, 'Interpreter', 'none');

exportGroupName = groupName;
if groupName == "handle_loadcell"
    exportGroupName = groupName + "_signals";
end

export_group_csvs(csvOutputDir, idx, exportGroupName, timestampsRaw, sides, signalNames, signalSeries);

safeGroupName = regexprep(groupName, '[^a-zA-Z0-9_-]', '_');
outName = sprintf('acq_%d_%s.png', idx, safeGroupName);
outPath = fullfile(outputDir, outName);
exportgraphics(fig, outPath, 'Resolution', 150);

if groupName == "handle_loadcell"
    plot_handle_loadcell_pairs(filename, groupPath, idx, outputDir, csvOutputDir, timestampsRaw, timeSeconds, sides, leftColor, rightColor, coordinatorLabels, coordinatorTimestamps, tsAll, timingInfo);
end
end


function plot_tip_handle_combined(filename, idx, outputDir)
tipGroupPath = find_group_path(filename, "tip_loadcell");
handleGroupPath = find_group_path(filename, "handle_loadcell");

if tipGroupPath == "" || handleGroupPath == ""
    return
end

tipDatasets = h5info(filename, tipGroupPath).Datasets;
tipDatasetNames = string({tipDatasets.Name});
tipTimestampName = find_first(tipDatasetNames, ["timestamp", "timsestamp"]);
tipSideName = find_first(tipDatasetNames, "side");
tipForceName = find_first(tipDatasetNames, "force");

handleDatasets = h5info(filename, handleGroupPath).Datasets;
handleDatasetNames = string({handleDatasets.Name});
handleTimestampName = find_first(handleDatasetNames, ["timestamp", "timsestamp"]);
handleSideName = find_first(handleDatasetNames, "side");
handleForceName = find_first(handleDatasetNames, "force.up_back");

if tipTimestampName == "" || tipSideName == "" || tipForceName == "" || handleTimestampName == "" || handleSideName == "" || handleForceName == ""
    return
end

tipTimestampsRaw = read_string_dataset(filename, tipGroupPath + "/" + tipTimestampName, "timestamp");
tipSidesRaw = read_string_dataset(filename, tipGroupPath + "/" + tipSideName, "side");
tipSides = strings(numel(tipSidesRaw), 1);
for i = 1:numel(tipSidesRaw)
    tipSides(i) = normalize_side(tipSidesRaw(i));
end
tipForce = read_dataset_1d(filename, tipGroupPath + "/" + tipForceName);

handleTimestampsRaw = read_string_dataset(filename, handleGroupPath + "/" + handleTimestampName, "timestamp");
handleSidesRaw = read_string_dataset(filename, handleGroupPath + "/" + handleSideName, "side");
handleSides = strings(numel(handleSidesRaw), 1);
for i = 1:numel(handleSidesRaw)
    handleSides(i) = normalize_side(handleSidesRaw(i));
end
handleForce = read_dataset_1d(filename, handleGroupPath + "/" + handleForceName);

tipTimes = parse_timestamps(tipTimestampsRaw);
handleTimes = parse_timestamps(handleTimestampsRaw);
allTimes = [tipTimes; handleTimes];
allTimes = allTimes(~isnat(allTimes));
if isempty(allTimes)
    return
end

t0 = min(allTimes);

tipTimeSeconds = seconds(tipTimes - t0);
handleTimeSeconds = seconds(handleTimes - t0);

nTip = min([numel(tipTimeSeconds), numel(tipSides), numel(tipForce)]);
nHandle = min([numel(handleTimeSeconds), numel(handleSides), numel(handleForce)]);
if nTip == 0 || nHandle == 0
    return
end

leftColor = [128, 0, 32] / 255;
rightColor = [0, 100, 0] / 255;

tipTimeSeconds = tipTimeSeconds(1:nTip);
tipSides = tipSides(1:nTip);
tipForce = double(tipForce(1:nTip));

handleTimeSeconds = handleTimeSeconds(1:nHandle);
handleSides = handleSides(1:nHandle);
handleForce = double(handleForce(1:nHandle));

fig = figure('Visible', 'on', 'Color', 'w', 'Position', [160, 140, 1200, 720]);
tl = tiledlayout(fig, 2, 1);
title(tl, 'tip_loadcell force vs handle_loadcell force.up_back', 'Interpreter', 'none')

tipLeftMask = tipSides == "left";
tipRightMask = tipSides == "right";
handleLeftMask = handleSides == "left";
handleRightMask = handleSides == "right";

axLeft = nexttile(tl, 1);
hold(axLeft, 'on')
plot(axLeft, tipTimeSeconds(tipLeftMask), tipForce(tipLeftMask), '.', 'Color', leftColor, 'DisplayName', 'tip_loadcell', 'MarkerSize', 8, 'LineStyle', 'none');
plot(axLeft, handleTimeSeconds(handleLeftMask), handleForce(handleLeftMask), 'x', 'Color', [0.2, 0.2, 0.2], 'DisplayName', 'handle_loadcell force.up_back', 'MarkerSize', 6, 'LineStyle', 'none');
grid(axLeft, 'on')
xlabel(axLeft, 'time [s]')
ylabel(axLeft, 'force [N]')
title(axLeft, 'left')
legend(axLeft, 'Location', 'best')

axRight = nexttile(tl, 2);
hold(axRight, 'on')
plot(axRight, tipTimeSeconds(tipRightMask), tipForce(tipRightMask), '.', 'Color', rightColor, 'DisplayName', 'tip_loadcell', 'MarkerSize', 8, 'LineStyle', 'none');
plot(axRight, handleTimeSeconds(handleRightMask), handleForce(handleRightMask), 'x', 'Color', [0.2, 0.2, 0.2], 'DisplayName', 'handle_loadcell force.up_back', 'MarkerSize', 6, 'LineStyle', 'none');
grid(axRight, 'on')
xlabel(axRight, 'time [s]')
ylabel(axRight, 'force [N]')
title(axRight, 'right')
legend(axRight, 'Location', 'best')

linkaxes([axLeft, axRight], 'x');

safeGroupName = regexprep("tip_loadcell_vs_handle_up_back", '[^a-zA-Z0-9_-]', '_');
outName = sprintf('acq_%d_%s.png', idx, safeGroupName);
outPath = fullfile(outputDir, outName);
exportgraphics(fig, outPath, 'Resolution', 150);
end


function groupPath = find_group_path(filename, targetName)
groupPath = "";
info = h5info(filename);
for i = 1:numel(info.Groups)
    gPath = string(info.Groups(i).Name);
    if extractAfter(gPath, '/') == targetName
        groupPath = gPath;
        return
    end
end
end


function plot_handle_loadcell_pairs(filename, groupPath, idx, outputDir, csvOutputDir, timestampsRaw, timeSeconds, sides, leftColor, rightColor, coordinatorLabels, coordinatorTimestamps, tsAll, timingInfo)
datasets = h5info(filename, groupPath).Datasets;
datasetNames = string({datasets.Name});

pairs = [
    "up", "force.up_front", "force.up_back";
    "down", "force.down_front", "force.down_back";
    "int", "force.int_front", "force.int_back";
    "ext", "force.ext_front", "force.ext_back"
    ];

for i = 1:size(pairs, 1)
    if ~any(datasetNames == pairs(i, 2)) || ~any(datasetNames == pairs(i, 3))
        warning('Dataset mancanti per %s in %s: %s e/o %s', pairs(i, 1), groupPath, pairs(i, 2), pairs(i, 3));
        return
    end
end

fig = figure('Visible', 'on', 'Color', 'w', 'Position', [140, 120, 1100, 1200]);
tiledlayout(4, 1);

nMax = numel(timeSeconds);
pairLabels = strings(size(pairs, 1), 1);
pairSeries = cell(size(pairs, 1), 1);

ax = gobjects(size(pairs,1),1);
for i = 1:size(pairs, 1)
    label = pairs(i, 1);
    frontName = pairs(i, 2);
    backName = pairs(i, 3);
    pairLabels(i) = label;

    frontVals = read_dataset_1d(filename, groupPath + "/" + frontName);
    backVals = read_dataset_1d(filename, groupPath + "/" + backName);

    n = min([nMax, numel(sides), numel(frontVals), numel(backVals)]);
    if n == 0
        continue
    end

    t = timeSeconds(1:n);
    sideSlice = sides(1:n);
    y = double(frontVals(1:n)) + double(backVals(1:n));
    pairSeries{i} = y;

    leftMask = sideSlice == "left";
    rightMask = sideSlice == "right";

    nexttile
    hold on
    plot(t(leftMask), y(leftMask), '.', 'Color', leftColor, 'DisplayName', 'left', 'MarkerSize', 8, 'LineStyle', 'none');
    plot(t(rightMask), y(rightMask), '.', 'Color', rightColor, 'DisplayName', 'right', 'MarkerSize', 8, 'LineStyle', 'none');
    ylabel(label + " [N]", 'Interpreter', 'none');
    title(label + " = " + frontName + " + " + backName, 'Interpreter', 'none');
    grid on
    legend('Location', 'best');

    if label == "up"
        ylim([-10, 510]);
    else
        ylim([-10, 60]);
    end
    ax(i) = gca;
end

xlabel('time [s]');
sgtitle('Group: handle_loadcell (paired sums)', 'Interpreter', 'none');
% Apply coordinator-based background shading to pair plots
try
    apply_condition_background(ax, coordinatorLabels, coordinatorTimestamps, tsAll, timingInfo);
catch
end

validPairAx = ax(isgraphics(ax));
if numel(validPairAx) > 1
    linkaxes(validPairAx, 'x');
end

export_group_csvs(csvOutputDir, idx, "handle_loadcell_pairs", timestampsRaw, sides, pairLabels, pairSeries);

safeGroupName = regexprep("handle_loadcell_pairs", '[^a-zA-Z0-9_-]', '_');
outName = sprintf('acq_%d_%s.png', idx, safeGroupName);
outPath = fullfile(outputDir, outName);
exportgraphics(fig, outPath, 'Resolution', 150);
end


function name = find_first(datasetNames, candidates)
name = "";
for i = 1:numel(candidates)
    idx = find(datasetNames == candidates(i), 1, 'first');
    if ~isempty(idx)
        name = datasetNames(idx);
        return
    end
end
end


function values = read_dataset_1d(filename, path)
raw = h5read(filename, path);
values = raw(:);
end


function values = read_string_dataset(filename, path, kind)
raw = h5read(filename, path);

if isstring(raw)
    values = raw(:);
    return
end

if iscell(raw)
    values = string(raw(:));
    return
end

if ischar(raw)
    if isvector(raw)
        values = string(strtrim(raw));
        values = values(:);
        return
    end

    rows = string(strtrim(cellstr(raw)));
    cols = string(strtrim(cellstr(raw.')));

    if kind == "side"
        rowScore = side_match_score(rows);
        colScore = side_match_score(cols);
        if colScore > rowScore
            values = cols(:);
        else
            values = rows(:);
        end
        return
    end

    rowScore = timestamp_match_score(rows);
    colScore = timestamp_match_score(cols);
    if colScore > rowScore
        values = cols(:);
    else
        values = rows(:);
    end
    return
end

values = string(raw(:));
end


function score = side_match_score(values)
score = 0;
for i = 1:numel(values)
    s = normalize_side(values(i));
    if s == "left" || s == "right"
        score = score + 1;
    end
end
end


function score = timestamp_match_score(values)
score = 0;
for i = 1:numel(values)
    text = strtrim(values(i));
    if ~isempty(regexp(text, '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{4}$', 'once'))
        score = score + 1;
    end
end
end


function side = normalize_side(value)
if isstring(value) || ischar(value)
    text = lower(strtrim(string(value)));
elseif isnumeric(value)
    text = string(value);
else
    text = lower(strtrim(string(value)));
end

if any(text == ["left", "l", "0"])
    side = "left";
elseif any(text == ["right", "r", "1"])
    side = "right";
else
    side = "other";
end
end


function [tSec, ts, timingInfo] = relative_seconds_from_common_t0(timestampsRaw, sides)
n = numel(timestampsRaw);
ts = NaT(n, 1, 'TimeZone', 'local');
for i = 1:n
    text = strtrim(string(timestampsRaw(i)));
    try
        ts(i) = datetime(text, 'InputFormat', 'yyyy-MM-dd''T''HH:mm:ss.SSSZ', 'TimeZone', 'local');
    catch
        ts(i) = datetime(text, 'InputFormat', 'yyyy-MM-dd''T''HH:mm:ssZ', 'TimeZone', 'local');
    end
end

% Get first timestamps for each side
leftMask = sides == "left";
rightMask = sides == "right";

leftIndices = find(leftMask, 1, 'first');
rightIndices = find(rightMask, 1, 'first');

% Check if time difference between first samples is > 5 seconds
usePerSideT0 = false;
if ~isempty(leftIndices) && ~isempty(rightIndices)
    firstLeftTime = ts(leftIndices);
    firstRightTime = ts(rightIndices);
    timeDiff = abs(seconds(firstLeftTime - firstRightTime));
    
    if timeDiff > 5
        usePerSideT0 = true;
    end
end

tSec = zeros(n, 1);

if usePerSideT0
    % Use separate t0 for each side (per-side relative times)
    if ~isempty(leftIndices)
        t0_left = ts(leftIndices);
        tSec(leftMask) = seconds(ts(leftMask) - t0_left);
    end
    if ~isempty(rightIndices)
        t0_right = ts(rightIndices);
        tSec(rightMask) = seconds(ts(rightMask) - t0_right);
    end
else
    % Use common t0 (original behavior)
    leftTimes = unique(ts(leftMask));
    rightTimes = unique(ts(rightMask));
    common = intersect(leftTimes, rightTimes);
    
    if ~isempty(common)
        t0 = common(1);
    else
        t0 = ts(1);
    end
    
    tSec = seconds(ts - t0);
end

% Fill timingInfo
timingInfo = struct();
timingInfo.usePerSideT0 = usePerSideT0;
if exist('t0_left', 'var')
    timingInfo.t0_left = t0_left;
else
    timingInfo.t0_left = NaT;
end
if exist('t0_right', 'var')
    timingInfo.t0_right = t0_right;
else
    timingInfo.t0_right = NaT;
end
if exist('t0', 'var')
    timingInfo.t0_common = t0;
else
    timingInfo.t0_common = NaT;
end

end

function ts = parse_timestamps(timestampsRaw)
n = numel(timestampsRaw);
ts = NaT(n, 1, 'TimeZone', 'local');
for i = 1:n
    text = strtrim(string(timestampsRaw(i)));
    try
        ts(i) = datetime(text, 'InputFormat', 'yyyy-MM-dd''T''HH:mm:ss.SSSZ', 'TimeZone', 'local');
    catch
        ts(i) = datetime(text, 'InputFormat', 'yyyy-MM-dd''T''HH:mm:ssZ', 'TimeZone', 'local');
    end
end
end


function apply_condition_background(axHandles, coordinatorLabels, coordinatorTimestamps, tsAll, timingInfo)
if isempty(axHandles) || isempty(tsAll)
    return
end

% Parse coordinator timestamps
if isempty(coordinatorTimestamps)
    starts = tsAll(1);
    labels = string("NA");
else
    starts = parse_timestamps(coordinatorTimestamps);
    labels = string(coordinatorLabels(:));
    % If the first coordinator timestamp is after the first data sample,
    % prepend initial NA condition
    if starts(1) > tsAll(1)
        starts = [tsAll(1); starts];
        labels = [string("NA"); labels];
    end
end

% Define interval ends
globalEnd = tsAll(end);
ends = [starts(2:end); globalEnd + seconds(1)];

% Map labels to colors
uniqueLabels = unique(labels, 'stable');
colors = lines(numel(uniqueLabels));
labelColorMap = containers.Map();
for i = 1:numel(uniqueLabels)
    labelColorMap(char(uniqueLabels(i))) = colors(i, :);
end

for ai = 1:numel(axHandles)
    ax = axHandles(ai);
    if ~isgraphics(ax)
        continue
    end
    axes(ax); hold on
    yl = ylim(ax);

    for k = 1:numel(starts)
        lab = char(labels(k));
        if isKey(labelColorMap, lab)
            c = labelColorMap(lab);
        else
            c = [0.7,0.7,0.7];
        end

        % Compute relative start/end depending on timingInfo
        try
            if timingInfo.usePerSideT0 && ~isnat(timingInfo.t0_left)
                % draw for left
                sRel = seconds(starts(k) - timingInfo.t0_left);
                eRel = seconds(ends(k) - timingInfo.t0_left);
                patch(ax, [sRel, eRel, eRel, sRel], [yl(1), yl(1), yl(2), yl(2)], c, 'FaceAlpha', 0.12, 'EdgeColor', 'none');
            end
        catch
        end
        try
            if timingInfo.usePerSideT0 && ~isnat(timingInfo.t0_right)
                % draw for right
                sRel = seconds(starts(k) - timingInfo.t0_right);
                eRel = seconds(ends(k) - timingInfo.t0_right);
                patch(ax, [sRel, eRel, eRel, sRel], [yl(1), yl(1), yl(2), yl(2)], c, 'FaceAlpha', 0.12, 'EdgeColor', 'none');
            end
        catch
        end
        try
            if ~timingInfo.usePerSideT0 && ~isnat(timingInfo.t0_common)
                sRel = seconds(starts(k) - timingInfo.t0_common);
                eRel = seconds(ends(k) - timingInfo.t0_common);
                patch(ax, [sRel, eRel, eRel, sRel], [yl(1), yl(1), yl(2), yl(2)], c, 'FaceAlpha', 0.12, 'EdgeColor', 'none');
            end
        catch
        end
    end
end
end


function export_group_csvs(csvOutputDir, idx, groupName, timestampsRaw, sides, seriesNames, seriesValues)
if isempty(seriesNames) || isempty(seriesValues)
    return
end

commonN = min(numel(timestampsRaw), numel(sides));
for i = 1:numel(seriesValues)
    values = seriesValues{i};
    if isempty(values)
        continue
    end
    commonN = min(commonN, numel(values));
end

if commonN == 0
    return
end

safeGroupName = regexprep(string(groupName), '[^a-zA-Z0-9_-]', '_');
timestampSlice = timestampsRaw(1:commonN);
sideSlice = sides(1:commonN);

seriesNames = string(seriesNames(:));
tableVarNames = matlab.lang.makeUniqueStrings(matlab.lang.makeValidName(cellstr(seriesNames)));

baseTable = table(timestampSlice, 'VariableNames', {'timestamp'});
for i = 1:numel(seriesValues)
    values = seriesValues{i};
    if isempty(values)
        baseTable.(tableVarNames{i}) = nan(commonN, 1);
    else
        baseTable.(tableVarNames{i}) = double(values(1:commonN));
    end
end

for sideLabel = ["left", "right"]
    rowMask = sideSlice == sideLabel;
    if ~any(rowMask)
        continue
    end

    sideTable = baseTable(rowMask, :);
    outName = sprintf('acq_%d_%s_%s.csv', idx, safeGroupName, sideLabel);
    outPath = fullfile(csvOutputDir, outName);
    writetable(sideTable, outPath);
end
end
