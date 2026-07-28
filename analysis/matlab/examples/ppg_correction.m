clear all
clc

ppg_folder = fullfile('..', '..', 'web_server', 'data', 'ppg');
handle_folder = fullfile('..', '..', 'web_server', 'data', 'handle');

ppg_time = readtable(fullfile(ppg_folder, 'timestamp.csv'), "Delimiter",",");
ppg_ir = readtable(fullfile(ppg_folder, 'ir.csv'), "Delimiter",",");
ppg_side = readtable(fullfile(ppg_folder, 'side.csv'), "Delimiter",",");

handle_time = readtable(fullfile(handle_folder, 'timestamp.csv'), "Delimiter",",");
handle_front = readtable(fullfile(handle_folder, 'force.up_front.csv'), "Delimiter",",");
handle_back = readtable(fullfile(handle_folder, 'force.up_back.csv'), "Delimiter",",");
handle_side = readtable(fullfile(handle_folder, 'side.csv'), "Delimiter",",");

idx_diff = height(ppg_time)-height(ppg_ir);
ppg_time(1:idx_diff, :) = [];
ppg_side(1:idx_diff, :) = [];

ppg.timestamp = datetime(ppg_time.timestamp, ...
	'InputFormat', "yyyy-MM-dd'T'HH:mm:ss.SSSZ", ...
	'TimeZone', 'UTC');
ppg.ir = ppg_ir.ir;
ppg.side = categorical(ppg_side.side);
ppg = struct2table(ppg);

handle.timestamp = datetime(handle_time.timestamp, ...
	'InputFormat', "yyyy-MM-dd'T'HH:mm:ss.SSSZ", ...
	'TimeZone', 'UTC');
handle.front = handle_front.force_up_front;
handle.back = handle_back.force_up_back;
handle.side = categorical(handle_side.side);
handle = struct2table(handle);

clear ppg_time ppg_ir ppg_side handle_time handle_front handle_back handle_side

side = "left";
figure(1); clf;
subplot(2,1,1); hold on;
plot(ppg.timestamp(ppg.side == side), ppg.ir(ppg.side == side));
subplot(2,1,2); hold on;
plot(handle.timestamp(handle.side == side), handle.front(handle.side == side) + handle.back(handle.side == side));

side = "right";
figure(2); clf;
subplot(2,1,1); hold on;
plot(ppg.timestamp(ppg.side == side), ppg.ir(ppg.side == side));
subplot(2,1,2); hold on;
plot(handle.timestamp(handle.side == side), handle.front(handle.side == side) + handle.back(handle.side == side));