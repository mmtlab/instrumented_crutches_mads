function [tip_left, tip_right] = tip(filename)
if nargin < 1 || isempty(filename)
	[fileName, filePath] = uigetfile({'*.h5;*.hdf5', 'HDF5 files (*.h5, *.hdf5)'; '*.*', 'All files'}, 'Select tip_loadcell H5 file');
	if isequal(fileName, 0)
		error('Nessun file selezionato.');
	end
	filename = fullfile(filePath, fileName);
end

groupPath = find_group_path(filename, 'tip_loadcell');
if groupPath == ""
	error('Gruppo tip_loadcell non trovato nel file H5: %s', filename);
end

datasets = h5info(filename, groupPath).Datasets;
datasetNames = string({datasets.Name});

timestampName = find_first(datasetNames, "timestamp");
sideName = find_first(datasetNames, "side");
forceName = find_first(datasetNames, "force");

if timestampName == "" || sideName == "" || forceName == ""
	error('Dataset richiesti mancanti in %s. Attesi: timestamp, side, force.', groupPath);
end

timestampsRaw = read_string_dataset(filename, groupPath + "/" + timestampName, 'timestamp');
sidesRaw = read_string_dataset(filename, groupPath + "/" + sideName, 'side');
force = read_dataset_1d(filename, groupPath + "/" + forceName);

sideValues = strings(numel(sidesRaw), 1);
for i = 1:numel(sidesRaw)
	sideValues(i) = normalize_side(sidesRaw(i));
end

timestamps = parse_timestamps(timestampsRaw);
commonN = min([numel(timestamps), numel(sideValues), numel(force)]);
if commonN == 0
	error('Nessun campione disponibile in %s.', groupPath);
end

timestamps = timestamps(1:commonN);
sideValues = sideValues(1:commonN);
force = double(force(1:commonN));

tip_left = build_tip_table(timestamps(sideValues == "left"), force(sideValues == "left"));
tip_right = build_tip_table(timestamps(sideValues == "right"), force(sideValues == "right"));

assignin('base', 'tip_left', tip_left);
assignin('base', 'tip_right', tip_right);
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


function name = find_first(datasetNames, candidates)
name = "";
for i = 1:numel(candidates)
	idx = find(datasetNames == string(candidates(i)), 1, 'first');
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
kind = string(kind);

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


function outTable = build_tip_table(timestamps, force)
timestampUnixNs = zeros(numel(timestamps), 1, 'int64');
validMask = ~isnat(timestamps);
if any(validMask)
	timestampUnixNs(validMask) = int64(round(posixtime(timestamps(validMask)) .* 1e9));
end

outTable = table(timestamps(:), timestampUnixNs, force(:), ...
	'VariableNames', {'timestamp', 'timestamp_unix_ns', 'force'});
end
