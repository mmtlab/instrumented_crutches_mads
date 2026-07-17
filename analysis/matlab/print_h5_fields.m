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

