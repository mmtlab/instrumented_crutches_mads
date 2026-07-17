function values = read_dataset(filename, path)
raw = h5read(filename, path);

if iscell(raw)
    values = string(raw(:));
    return
end

values = raw(:);
end