clear
close all
clc

% Configuration
testFolder = fullfile("G:\Drive condivisi\ESCAPE - Fit4MedRob\Tests");
date = "20260707";
idx = 29;

% Plot enable/disable flags
config.enablePPG = false;
config.enablePupilNeon = false;
config.enableUPS = false;
config.enableHandleLoadcell = true;
config.enableHandleLoadcellPairs = true;
config.enableTipLoadcell = false;
config.enableTipHandleCombined = false;

% paths setup
rawDataDir = fullfile(testFolder, date, '01_raw');
preprocessingDataDir = fullfile(testFolder, date, '02_preprocessing');

% seek for the crutches' h5 file
crutchFiles = dir(fullfile(rawDataDir, "crutch", sprintf('*_acq_%d.h5', idx)));
crutchFilename = fullfile(crutchFiles.folder, crutchFiles.name);
info = h5info(crutchFilename);

% feedback to user
fprintf('Selected file (id %d): %s\n', idx, string(crutchFilename));
fprintf('H5 file info:\n');
print_h5_fields(info, '');


groupNames = ["coordinator", "handle_loadcell", "tip_loadcell", "ppg", "ups"];
for groupName = groupNames
    groupPath = "/" + groupName;
    datasets = h5info(crutchFilename, groupPath).Datasets;
    datasetNames = string({datasets.Name});

    timestampsRaw = read_dataset(crutchFilename, groupPath + "/timestamp");
    if groupName == "coordinator"
        sides = "";
    else
        sides = read_dataset(crutchFilename, groupPath + "/side");
    end

    exclude = ["timestamp", "side"];
    signalNames = datasetNames(~ismember(datasetNames, exclude));
    if isempty(signalNames)
        return
    end

    signalSeries = cell(numel(signalNames), 1);

    for s = 1:numel(signalNames)
        signalName = signalNames(s);
        signal = read_dataset(crutchFilename, groupPath + "/" + signalName);
        if groupName == "coordinator"
            signalSeries{s} = string(signal(:));
        else
            signalSeries{s} = double(signal(:));
        end
    end

    export_group_csvs(fullfile(preprocessingDataDir,"crutch"), crutchFiles.name, groupName, timestampsRaw, sides, signalNames, signalSeries);
end
