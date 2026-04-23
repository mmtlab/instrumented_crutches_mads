clear
close all
clc

% Configuration
idx = 60;

scriptDir = fileparts(mfilename('fullpath'));
analysisDir = fileparts(scriptDir);
dataDir = fullfile(analysisDir, '..', 'web_server', 'data');
filename = fullfile(dataDir, sprintf('acq_%d.h5', idx));
outputDir = fullfile(analysisDir, 'graphs');

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

if ~exist(outputDir, 'dir')
    mkdir(outputDir);
end

for g = 1:numel(info.Groups)
    groupInfo = info.Groups(g);
    groupPath = string(groupInfo.Name);     % e.g. "/ppg"
    groupName = extractAfter(groupPath, '/');
    plot_group(filename, groupPath, groupName, idx, outputDir);
end


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


function plot_group(filename, groupPath, groupName, idx, outputDir)
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

timeSeconds = relative_seconds_from_common_t0(timestampsRaw, sides);

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

for s = 1:numel(signalNames)
    signalName = signalNames(s);
    signal = read_dataset_1d(filename, groupPath + "/" + signalName);

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
    title(groupName + "/" + signalName, 'Interpreter', 'none');
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

xlabel('time [s] relative to first common timestamp');
sgtitle("Group: " + groupName, 'Interpreter', 'none');

safeGroupName = regexprep(groupName, '[^a-zA-Z0-9_-]', '_');
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


function tSec = relative_seconds_from_common_t0(timestampsRaw, sides)
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

leftTimes = unique(ts(sides == "left"));
rightTimes = unique(ts(sides == "right"));
common = intersect(leftTimes, rightTimes);

if ~isempty(common)
    t0 = common(1);
else
    t0 = ts(1);
end

tSec = seconds(ts - t0);
end
